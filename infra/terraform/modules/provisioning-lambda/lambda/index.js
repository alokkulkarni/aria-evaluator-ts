const AWS = require('aws-sdk');
const crypto = require('crypto');

const codebuild = new AWS.CodeBuild();
const dynamodb = new AWS.DynamoDB();
const cloudwatch = new AWS.CloudWatch();
const secretsManager = new AWS.SecretsManager();

const PROJECT_NAME = process.env.CODEBUILD_PROJECT_NAME;
const TABLE_NAME = process.env.USER_INSTANCE_TABLE;
const AWS_REGION = process.env.AWS_REGION;
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const MAX_INSTANCES_PER_USER = parseInt(process.env.MAX_INSTANCES_PER_USER || '2', 10);
const MAX_MONTHLY_SPEND = parseFloat(process.env.MAX_MONTHLY_SPEND || '1000', 10);
const COST_PER_INSTANCE_HOUR = parseFloat(process.env.COST_PER_INSTANCE_HOUR || '0.25', 10);

// Rate limiting: store request counts per user (cleared hourly)
const rateLimitCache = {};
const MAX_REQUESTS_PER_HOUR = 10;

// Input validation helpers
function validateUserId(userId) {
  if (!userId || typeof userId !== 'string') return false;
  if (userId.length > 128 || userId.length < 1) return false;
  // Only alphanumeric, hyphens, underscores
  return /^[a-zA-Z0-9_-]+$/.test(userId);
}

function validatePlanType(planType) {
  return ['free', 'individual', 'enterprise'].includes(planType);
}

function sanitizeInput(input) {
  if (typeof input !== 'string') return null;
  return input.slice(0, 1024).replace(/[<>\"'&]/g, '');
}

// JWT validation function (verify token with issuer)
function validateJWT(token) {
  try {
    // In production, verify JWT signature and expiration
    // For now, basic structure validation
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid token format' };
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
    
    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true, payload };
  } catch (error) {
    return { valid: false, error: 'Invalid token' };
  }
}

// Helper function to validate authorization and extract user_id with JWT
function validateAuthAndGetUserId(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (!authHeader) {
    return { valid: false, error: 'Missing authorization header', statusCode: 401 };
  }

  if (!authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Invalid authorization header format', statusCode: 401 };
  }

  const token = authHeader.substring(7);
  if (!token) {
    return { valid: false, error: 'Empty bearer token', statusCode: 401 };
  }

  // Validate JWT
  const jwtValidation = validateJWT(token);
  if (!jwtValidation.valid) {
    return { valid: false, error: jwtValidation.error, statusCode: 401 };
  }

  const userId = jwtValidation.payload.sub || jwtValidation.payload.user_id;
  if (!userId || !validateUserId(userId)) {
    return { valid: false, error: 'Invalid user_id in token', statusCode: 401 };
  }

  return { valid: true, userId, token, payload: jwtValidation.payload };
}

// Rate limiting check
function checkRateLimit(userId) {
  const now = Date.now();
  const hourWindow = Math.floor(now / (60 * 60 * 1000));
  const key = `${userId}:${hourWindow}`;

  if (!rateLimitCache[key]) {
    rateLimitCache[key] = 0;
  }

  rateLimitCache[key]++;

  if (rateLimitCache[key] > MAX_REQUESTS_PER_HOUR) {
    return { limited: true, error: 'Rate limit exceeded' };
  }

  // Cleanup old entries (every 1000 operations)
  if (Object.keys(rateLimitCache).length > 1000) {
    const currentWindow = Math.floor(now / (60 * 60 * 1000));
    Object.keys(rateLimitCache).forEach(k => {
      const window = parseInt(k.split(':')[1], 10);
      if (window < currentWindow - 2) {
        delete rateLimitCache[k];
      }
    });
  }

  return { limited: false };
}

// Cost guardrail check
async function checkCostGuardrails(userId, planType) {
  try {
    // Get all active instances for user
    const response = await dynamodb
      .query({
        TableName: TABLE_NAME,
        IndexName: 'user_id-status-index',
        KeyConditionExpression: 'user_id = :uid',
        ExpressionAttributeValues: {
          ':uid': { S: userId },
        },
      })
      .promise();

    const items = response.Items || [];
    const activeInstances = items.filter(i => ['active', 'provisioning'].includes(i.status?.S));

    // Check instance limit
    if (activeInstances.length >= MAX_INSTANCES_PER_USER) {
      return {
        allowed: false,
        error: `Maximum ${MAX_INSTANCES_PER_USER} instances per user`,
        statusCode: 429,
      };
    }

    // Estimate monthly cost
    const estimatedMonthlyCost = (activeInstances.length + 1) * COST_PER_INSTANCE_HOUR * 730; // 730 hours/month

    if (estimatedMonthlyCost > MAX_MONTHLY_SPEND) {
      return {
        allowed: false,
        error: 'Estimated monthly cost exceeds limit',
        statusCode: 429,
        estimatedCost: estimatedMonthlyCost,
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Cost guardrail check error:', error);
    return { allowed: true }; // Fail open, not closed
  }
}

// Audit logging to CloudWatch
async function auditLog(userId, action, details, statusCode) {
  try {
    const logEntry = {
      timestamp: new Date().toISOString(),
      userId,
      action,
      statusCode,
      details: sanitizeInput(JSON.stringify(details)),
      requestId: process.env.AWS_REQUEST_ID,
    };

    console.log('AUDIT:', JSON.stringify(logEntry));

    // Emit metric to CloudWatch
    await cloudwatch
      .putMetricData({
        Namespace: 'ProvisioningAPI',
        MetricData: [
          {
            MetricName: 'ProvisioningRequest',
            Value: 1,
            Unit: 'Count',
            Dimensions: [
              { Name: 'Action', Value: action },
              { Name: 'StatusCode', Value: String(statusCode) },
            ],
          },
        ],
      })
      .promise()
      .catch(e => console.error('CloudWatch metric error:', e));
  } catch (error) {
    console.error('Audit log error:', error);
  }
}

// Response helper with security headers
function createResponse(statusCode, body, isError = false) {
  const response = {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    },
    body: JSON.stringify(body),
  };

  if (isError) {
    // Generic error message to prevent information leakage
    response.body = JSON.stringify({ error: 'Request failed' });
  }

  return response;
}

exports.handler = async (event) => {
  const requestId = context.requestId;
  console.log('Provisioner Lambda invoked:', { requestId, method: event.requestContext.http.method, path: event.requestContext.http.path });

  try {
    const httpMethod = event.requestContext.http.method;
    const path = event.requestContext.http.path;

    // Route: POST /provision-evaluator
    if (httpMethod === 'POST' && path.endsWith('/provision-evaluator')) {
      return await provisionEvaluator(event);
    }

    // Route: GET /provision-status/{buildId}
    if (httpMethod === 'GET' && path.includes('/provision-status/')) {
      const buildId = path.split('/').pop();
      // Validate buildId format to prevent injection
      if (!/^[a-zA-Z0-9\-:]+$/.test(buildId)) {
        return createResponse(400, { error: 'Invalid build ID format' });
      }
      return await getProvisionStatus(buildId, event);
    }

    // Route: GET /instance-url
    if (httpMethod === 'GET' && path.endsWith('/instance-url')) {
      return await getInstanceUrl(event);
    }

    // Route: POST /reactivate-instance
    if (httpMethod === 'POST' && path.endsWith('/reactivate-instance')) {
      return await reactivateInstance(event);
    }

    // Route: POST /retry-build
    if (httpMethod === 'POST' && path.endsWith('/retry-build')) {
      return await retryBuild(event);
    }

    return createResponse(404, { error: 'Route not found' });
  } catch (error) {
    console.error('Handler error:', error);
    return createResponse(500, { error: 'Internal error' }, true);
  }
};

async function provisionEvaluator(event) {
  try {
    // Validate auth first
    const auth = validateAuthAndGetUserId(event);
    if (!auth.valid) {
      await auditLog('unknown', 'provision_attempt', { reason: auth.error }, auth.statusCode);
      return createResponse(auth.statusCode, { error: 'Unauthorized' });
    }

    const userId = auth.userId;

    // Rate limiting
    const rateLimitCheck = checkRateLimit(userId);
    if (rateLimitCheck.limited) {
      await auditLog(userId, 'provision_attempt', { reason: 'rate_limit' }, 429);
      return createResponse(429, { error: 'Too many requests' });
    }

    // Parse and validate request body
    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch (error) {
      await auditLog(userId, 'provision_attempt', { reason: 'invalid_json' }, 400);
      return createResponse(400, { error: 'Invalid JSON' });
    }

    const { plan_type } = body;

    // Input validation
    if (!plan_type || !validatePlanType(plan_type)) {
      await auditLog(userId, 'provision_attempt', { reason: 'invalid_plan_type', plan_type }, 400);
      return createResponse(400, { error: 'Invalid plan_type' });
    }

    console.log(`Provisioning evaluator for user ${userId} with plan ${plan_type}`);

    // Cost guardrail check
    const costCheck = await checkCostGuardrails(userId, plan_type);
    if (!costCheck.allowed) {
      await auditLog(userId, 'provision_attempt', { reason: 'cost_limit', costCheck }, costCheck.statusCode || 429);
      return createResponse(costCheck.statusCode || 429, { error: costCheck.error });
    }

    // Check if user already has an instance
    const existing = await dynamodb
      .getItem({
        TableName: TABLE_NAME,
        Key: { user_id: { S: userId } },
      })
      .promise();

    if (existing.Item) {
      const status = existing.Item.status.S;
      if (status === 'active' || status === 'provisioning') {
        await auditLog(userId, 'provision_attempt', { reason: 'already_provisioned', status }, 409);
        return createResponse(409, { error: 'Instance already exists' });
      } else if (status === 'suspended') {
        // Reactivate suspended instance
        await dynamodb
          .updateItem({
            TableName: TABLE_NAME,
            Key: { user_id: { S: userId } },
            UpdateExpression: 'SET #status = :status, last_login = :time',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':status': { S: 'active' },
              ':time': { N: String(Math.floor(Date.now() / 1000)) },
            },
          })
          .promise();

        await auditLog(userId, 'provision_reactivate', { instance_url: existing.Item.instance_url?.S }, 200);
        return createResponse(200, { message: 'Instance reactivated', instance_url: existing.Item.instance_url?.S });
      }
    }

    // Start CodeBuild job to provision instance
    let buildResponse;
    try {
      buildResponse = await codebuild
        .startBuild({
          projectName: PROJECT_NAME,
          environmentVariablesOverride: [
            { name: 'USER_ID', value: userId, type: 'PLAINTEXT' },
            { name: 'PLAN_TYPE', value: plan_type, type: 'PLAINTEXT' },
          ],
        })
        .promise();
    } catch (error) {
      console.error('CodeBuild error:', error);
      await auditLog(userId, 'provision_attempt', { reason: 'codebuild_error' }, 500);
      return createResponse(500, { error: 'Provisioning failed' }, true);
    }

    const buildId = buildResponse.build.id;
    console.log(`CodeBuild job started: ${buildId}`);

    // Record provisioning status in DynamoDB
    await dynamodb
      .putItem({
        TableName: TABLE_NAME,
        Item: {
          user_id: { S: userId },
          plan_type: { S: plan_type },
          status: { S: 'provisioning' },
          build_id: { S: buildId },
          created_at: { N: String(Math.floor(Date.now() / 1000)) },
          last_login: { N: '0' },
        },
      })
      .promise();

    await auditLog(userId, 'provision_start', { buildId, planType: plan_type }, 202);

    return createResponse(202, {
      message: 'Instance provisioning started',
      build_id: buildId,
    });
  } catch (error) {
    console.error('Provision evaluator error:', error);
    await auditLog('unknown', 'provision_error', { error: error.message }, 500);
    return createResponse(500, { error: 'Internal error' }, true);
  }
}

async function getProvisionStatus(buildId, event) {
  try {
    // Validate auth
    const auth = validateAuthAndGetUserId(event);
    if (!auth.valid) {
      return createResponse(auth.statusCode, { error: 'Unauthorized' });
    }

    const userId = auth.userId;

    // Verify buildId belongs to authenticated user
    // Query DynamoDB to verify user owns this build
    const response = await dynamodb
      .getItem({
        TableName: TABLE_NAME,
        Key: { user_id: { S: userId } },
      })
      .promise();

    if (!response.Item || response.Item.build_id?.S !== buildId) {
      await auditLog(userId, 'status_check', { reason: 'unauthorized_build', buildId }, 403);
      return createResponse(403, { error: 'Forbidden' });
    }

    try {
      const buildResponse = await codebuild
        .batchGetBuilds({ ids: [buildId] })
        .promise();

      if (!buildResponse.builds || buildResponse.builds.length === 0) {
        return createResponse(404, { error: 'Build not found' });
      }

      const build = buildResponse.builds[0];
      const status = build.buildStatus;

      await auditLog(userId, 'status_check', { buildId, status }, 200);

      return createResponse(200, {
        build_id: buildId,
        status: status,
        build_log: build.logs?.s3Logs?.location,
      });
    } catch (error) {
      console.error('CodeBuild error:', error);
      await auditLog(userId, 'status_check', { reason: 'codebuild_error', buildId }, 500);
      return createResponse(500, { error: 'Status check failed' }, true);
    }
  } catch (error) {
    console.error('Get status error:', error);
    return createResponse(500, { error: 'Internal error' }, true);
  }
}

async function getInstanceUrl(event) {
  try {
    // Validate auth
    const auth = validateAuthAndGetUserId(event);
    if (!auth.valid) {
      return createResponse(auth.statusCode, { error: 'Unauthorized' });
    }

    const userId = auth.userId;

    // Query DynamoDB for user instance
    const response = await dynamodb
      .getItem({
        TableName: TABLE_NAME,
        Key: { user_id: { S: userId } },
      })
      .promise();

    if (!response.Item) {
      return createResponse(200, {
        instance_url: null,
        status: null,
      });
    }

    const instance = response.Item;

    // Auto-reactivate if suspended
    if (instance.status?.S === 'suspended') {
      await dynamodb
        .updateItem({
          TableName: TABLE_NAME,
          Key: { user_id: { S: userId } },
          UpdateExpression: 'SET #status = :status, last_login = :time',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':status': { S: 'active' },
            ':time': { N: String(Math.floor(Date.now() / 1000)) },
          },
        })
        .promise();

      instance.status = { S: 'active' };
      await auditLog(userId, 'instance_url_auto_reactivate', { instanceId: instance.instance_id?.S }, 200);
    }

    return createResponse(200, {
      instance_url: instance.instance_url?.S || null,
      status: instance.status?.S || null,
      plan_type: instance.plan_type?.S || null,
      instance_id: instance.instance_id?.S || null,
    });
  } catch (error) {
    console.error('Get instance URL error:', error);
    return createResponse(500, { error: 'Internal error' }, true);
  }
}

async function reactivateInstance(event) {
  try {
    // Validate auth
    const auth = validateAuthAndGetUserId(event);
    if (!auth.valid) {
      return createResponse(auth.statusCode, { error: 'Unauthorized' });
    }

    const userId = auth.userId;

    // Parse and validate request body
    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch (error) {
      return createResponse(400, { error: 'Invalid JSON' });
    }

    // Check if instance exists and is suspended
    const existing = await dynamodb
      .getItem({
        TableName: TABLE_NAME,
        Key: { user_id: { S: userId } },
      })
      .promise();

    if (!existing.Item) {
      await auditLog(userId, 'reactivate_attempt', { reason: 'no_instance' }, 404);
      return createResponse(404, { error: 'No instance found' });
    }

    const status = existing.Item.status?.S;
    if (status !== 'suspended') {
      await auditLog(userId, 'reactivate_attempt', { reason: 'invalid_status', status }, 409);
      return createResponse(409, { error: `Cannot reactivate instance with status: ${status}` });
    }

    // Update instance status to active
    await dynamodb
      .updateItem({
        TableName: TABLE_NAME,
        Key: { user_id: { S: userId } },
        UpdateExpression: 'SET #status = :status, last_login = :time',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': { S: 'active' },
          ':time': { N: String(Math.floor(Date.now() / 1000)) },
        },
      })
      .promise();

    await auditLog(userId, 'reactivate_success', { instanceId: existing.Item.instance_id?.S }, 200);

    return createResponse(200, {
      message: 'Instance reactivated successfully',
      instance_url: existing.Item.instance_url?.S,
      status: 'active',
    });
  } catch (error) {
    console.error('Reactivate instance error:', error);
    return createResponse(500, { error: 'Internal error' }, true);
  }
}

async function retryBuild(event) {
  try {
    const auth = validateAuthAndGetUserId(event);
    if (!auth.valid) {
      return createResponse(auth.statusCode, { error: 'Unauthorized' });
    }

    const userId = auth.userId;

    // Look up the user's current instance record
    const existing = await dynamodb
      .getItem({
        TableName: TABLE_NAME,
        Key: { user_id: { S: userId } },
      })
      .promise();

    if (!existing.Item) {
      await auditLog(userId, 'retry_build', { reason: 'no_instance' }, 404);
      return createResponse(404, { error: 'No instance found for this user' });
    }

    const currentStatus = existing.Item.status?.S;
    const previousBuildId = existing.Item.build_id?.S;

    // Only allow retry if the previous build failed or instance is in a failed state
    if (currentStatus !== 'provisioning' && currentStatus !== 'failed') {
      // Check the actual CodeBuild status if instance is still marked as provisioning
      if (currentStatus === 'provisioning' && previousBuildId) {
        const buildCheck = await codebuild
          .batchGetBuilds({ ids: [previousBuildId] })
          .promise();
        const buildStatus = buildCheck.builds?.[0]?.buildStatus;
        if (buildStatus === 'IN_PROGRESS') {
          await auditLog(userId, 'retry_build', { reason: 'build_still_running', buildId: previousBuildId }, 409);
          return createResponse(409, { error: 'A build is still in progress', build_id: previousBuildId });
        }
      } else {
        await auditLog(userId, 'retry_build', { reason: 'invalid_status', status: currentStatus }, 409);
        return createResponse(409, { error: `Cannot retry build for instance with status: ${currentStatus}` });
      }
    }

    // Re-use the same plan_type from the original provisioning request
    const planType = existing.Item.plan_type?.S || 'free';

    // Start a new CodeBuild job
    const buildResponse = await codebuild
      .startBuild({
        projectName: PROJECT_NAME,
        environmentVariablesOverride: [
          { name: 'USER_ID', value: userId, type: 'PLAINTEXT' },
          { name: 'PLAN_TYPE', value: planType, type: 'PLAINTEXT' },
        ],
      })
      .promise();

    const newBuildId = buildResponse.build.id;

    // Update DynamoDB with new build ID and reset status
    await dynamodb
      .updateItem({
        TableName: TABLE_NAME,
        Key: { user_id: { S: userId } },
        UpdateExpression: 'SET #status = :status, build_id = :buildId',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': { S: 'provisioning' },
          ':buildId': { S: newBuildId },
        },
      })
      .promise();

    await auditLog(userId, 'retry_build', { newBuildId, previousBuildId, planType }, 202);

    return createResponse(202, {
      message: 'Build retry started',
      build_id: newBuildId,
      previous_build_id: previousBuildId,
    });
  } catch (error) {
    console.error('Retry build error:', error);
    return createResponse(500, { error: 'Internal error' }, true);
  }
}
