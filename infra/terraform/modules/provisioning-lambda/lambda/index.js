const AWS = require('aws-sdk');

const codebuild = new AWS.CodeBuild();
const dynamodb = new AWS.DynamoDB();

const PROJECT_NAME = process.env.CODEBUILD_PROJECT_NAME;
const TABLE_NAME = process.env.USER_INSTANCE_TABLE;
const AWS_REGION = process.env.AWS_REGION;

exports.handler = async (event) => {
  console.log('Provisioner Lambda invoked:', JSON.stringify(event));

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
      return await getProvisionStatus(buildId);
    }

    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Route not found' }),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

async function provisionEvaluator(event) {
  // Parse request body
  const body = JSON.parse(event.body || '{}');
  const { user_id, plan_type } = body;

  if (!user_id || !plan_type) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing user_id or plan_type' }),
    };
  }

  console.log(`Provisioning evaluator for user ${user_id} with plan ${plan_type}`);

  try {
    // Check if user already has an instance
    const existing = await dynamodb
      .getItem({
        TableName: TABLE_NAME,
        Key: { user_id: { S: user_id } },
      })
      .promise();

    if (existing.Item) {
      const status = existing.Item.status.S;
      if (status === 'active' || status === 'provisioning') {
        return {
          statusCode: 409,
          body: JSON.stringify({
            error: 'Instance already exists for this user',
            instance_url: existing.Item.instance_url?.S,
            status: status,
          }),
        };
      } else if (status === 'suspended') {
        // Reactivate suspended instance
        await dynamodb
          .updateItem({
            TableName: TABLE_NAME,
            Key: { user_id: { S: user_id } },
            UpdateExpression: 'SET #status = :status, last_login = :time',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':status': { S: 'active' },
              ':time': { N: String(Math.floor(Date.now() / 1000)) },
            },
          })
          .promise();

        return {
          statusCode: 200,
          body: JSON.stringify({
            message: 'Instance reactivated',
            instance_url: existing.Item.instance_url?.S,
          }),
        };
      }
    }

    // Start CodeBuild job to provision instance
    const buildResponse = await codebuild
      .startBuild({
        projectName: PROJECT_NAME,
        environmentVariablesOverride: [
          { name: 'USER_ID', value: user_id, type: 'PLAINTEXT' },
          { name: 'PLAN_TYPE', value: plan_type, type: 'PLAINTEXT' },
        ],
      })
      .promise();

    const buildId = buildResponse.build.id;
    console.log(`CodeBuild job started: ${buildId}`);

    // Record provisioning status in DynamoDB
    await dynamodb
      .putItem({
        TableName: TABLE_NAME,
        Item: {
          user_id: { S: user_id },
          plan_type: { S: plan_type },
          status: { S: 'provisioning' },
          build_id: { S: buildId },
          created_at: { N: String(Math.floor(Date.now() / 1000)) },
          last_login: { N: '0' },
        },
      })
      .promise();

    return {
      statusCode: 202,
      body: JSON.stringify({
        message: 'Instance provisioning started',
        build_id: buildId,
        user_id: user_id,
      }),
    };
  } catch (error) {
    console.error('Provisioning error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}

async function getProvisionStatus(buildId) {
  try {
    const buildResponse = await codebuild
      .batchGetBuilds({ ids: [buildId] })
      .promise();

    if (!buildResponse.builds || buildResponse.builds.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Build not found' }),
      };
    }

    const build = buildResponse.builds[0];
    const status = build.buildStatus; // SUCCEEDED, FAILED, IN_PROGRESS, etc.

    return {
      statusCode: 200,
      body: JSON.stringify({
        build_id: buildId,
        status: status,
        build_log: build.logs?.s3Logs?.location,
      }),
    };
  } catch (error) {
    console.error('Status check error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
