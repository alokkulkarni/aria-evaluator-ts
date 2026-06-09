# Production Security Hardening Guide

## Overview

This document describes the complete security hardening implementation for the Aria Evaluator provisioning infrastructure. The architecture implements **zero-trust security principles** with comprehensive controls across authentication, authorization, rate limiting, monitoring, and audit logging.

---

## Architecture Components

### 1. **Authentication & Authorization (Zero-Trust)**

#### JWT Token Validation
- **Component**: JWT Authorizer Lambda (`jwt-authorizer/index.js`)
- **Function**: Validates JWT tokens from Cognito before they reach the provisioning Lambda
- **Validation Steps**:
  1. Token format check: Must be valid Bearer token (3-part JWT)
  2. Signature verification: Against Cognito JWK (public keys)
  3. Expiration check: Token `exp` claim must be in future
  4. Audience validation: Token `aud` must match `jwt_audience` variable
  5. Issuer validation: Token `iss` must match Cognito issuer URL

#### API Gateway Authorizer
- **Resource**: `aws_apigatewayv2_authorizer` in `provisioning-lambda/main.tf`
- **Type**: JWT authorizer attached to all 4 provisioning routes
- **Behavior**: Rejects invalid tokens with 401 Unauthorized before they reach Lambda
- **Context Passing**: Valid token context passed to Lambda via `requestContext.authorizer`

#### Lambda-Level Authorization
- **Function**: `validateAuthAndGetUserId()` in provisioning Lambda
- **Checks**:
  1. Authorization header present
  2. Bearer token format correct
  3. JWT payload has `sub` (subject) claim
  4. User ID extracted from token context or payload

---

### 2. **Input Validation & Sanitization**

#### Validation Functions

**`validateUserId(userId)`**
- Pattern: `^[a-zA-Z0-9_-]+$`
- Length: 1-128 characters
- Purpose: Prevent command injection, path traversal
- Action: Returns boolean; throws TypeError if invalid

**`validatePlanType(planType)`**
- Enum: `['free', 'individual', 'enterprise']`
- Purpose: Ensure only valid plan types
- Action: Returns boolean; throws TypeError if invalid

**`sanitizeInput(input)`**
- Max length: 1024 characters
- Escapes HTML entities to prevent XSS
- Trims whitespace
- Returns safe string

#### Applied At
- `/api/provision`: User ID, plan type
- `/api/status` and `/api/instance-url`: Build ID queries
- All user-provided input in request body

---

### 3. **Rate Limiting (In-Memory)**

#### Configuration
- **Limit**: 10 requests per user per hour
- **Storage**: In-memory cache keyed by `{userId}:{hourWindow}`
- **Cache Cleanup**: Auto-cleans entries older than current window when size > 1000

#### Behavior
```
First 10 requests in hour: Allowed (200)
11th+ requests in hour: Rejected with 429 Too Many Requests
Next hour: Counter resets
```

#### Limitations & Improvements
- **Current**: Per-Lambda-instance only (doesn't share across concurrent executions)
- **Recommended for Production**: DynamoDB-backed distributed rate limiting
  ```javascript
  // Would use DynamoDB Streams + TTL for accurate counting
  const params = {
    TableName: 'rate-limits',
    Key: { userId_hour: `${userId}:${hourWindow}` },
    UpdateExpression: 'SET count = if_not_exists(count, :zero) + :one, expiration = :exp',
    ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':exp': expireTime }
  };
  ```

---

### 4. **Cost Guardrails**

#### Guardrail Types

**1. Instance Count Limit**
- **Default**: 2 active instances per user
- **Check**: Query DynamoDB for user_id with status IN ['provisioning', 'active']
- **Action**: Reject provision request if count >= limit

**2. Monthly Spend Limit**
- **Default**: $1,000 per user per month
- **Calculation**: `(currentInstances + 1) × 730 hours/month × costPerHour`
- **Example**: 2 × 730 × $0.50 = $730 (allowed)
- **Example**: 3 × 730 × $0.50 = $1,095 (rejected)
- **Action**: Reject provision request if estimated cost exceeds limit

#### Configuration in terraform.tfvars
```hcl
max_instances_per_user      = 2          # Prevent runaway provisioning
max_monthly_spend_per_user  = 1000       # Budget control in USD
cost_per_instance_hour      = 0.50       # Used for cost estimation
```

#### Implementation Location
- Function: `checkCostGuardrails()` in `lambda/index.js`
- Called: Before CodeBuild trigger in `provisionEvaluator()`
- Query: DynamoDB `user_id-status-index` GSI

---

### 5. **Audit Logging**

#### Log Format
```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "userId": "user-123",
  "action": "PROVISION_EVALUATOR",
  "statusCode": 202,
  "details": {
    "planType": "enterprise",
    "buildId": "aria-build-abc123",
    "instanceCount": 1
  },
  "requestId": "aws-request-id-uuid",
  "source": "provisioning-lambda"
}
```

#### Audit Actions Logged
1. **PROVISION_EVALUATOR**: New instance provision request
2. **GET_PROVISION_STATUS**: Status check (with sanitized build ID)
3. **GET_INSTANCE_URL**: URL retrieval (no sensitive data logged)
4. **REACTIVATE_INSTANCE**: Instance reactivation
5. **RATE_LIMIT_EXCEEDED**: Rate limit hit (user ID only)
6. **COST_GUARDRAIL_HIT**: Budget constraint enforcement
7. **INVALID_TOKEN**: JWT validation failures
8. **INPUT_VALIDATION_ERROR**: Malformed input rejection

#### Storage Locations
- **Primary**: CloudWatch Logs (`/aws/lambda/aria-provisioner`)
- **Secondary**: CloudTrail (Lambda invocation events, DynamoDB operations)
- **Metrics**: CloudWatch Metrics (ProvisioningRequest metric with Action and StatusCode dimensions)

---

### 6. **API Gateway WAF (Web Application Firewall)**

#### Rules

**Rule 1: Rate Limiting (Geo + IP-Based)**
- **Limit**: 2,000 requests per IP per 5-minute window
- **Action**: Block requests exceeding limit
- **Purpose**: DDoS protection at API Gateway level

**Rule 2: AWS Managed Common RuleSet**
- **Coverage**: OWASP Top 10 protection
- **Includes**:
  - SQL injection prevention
  - Cross-site scripting (XSS) prevention
  - Local file inclusion (LFI) prevention
  - Remote code execution (RCE) prevention
  - HTTP protocol violations

**Rule 3: AWS Managed Known Bad Inputs**
- **Coverage**: Known malicious request patterns
- **Updates**: AWS regularly updates the ruleset

#### Configuration Location
```hcl
# infra/terraform/modules/provisioning-lambda/main.tf
# Lines 293-400: WAF Web ACL and rule definitions
# Lines 430-445: WAF association to API Gateway stage
```

#### Monitoring
- Blocked requests logged to CloudWatch
- CloudWatch Alarm: `provisioning_waf_blocked_requests`
- Default threshold: Any blocked request generates alarm

---

### 7. **Encryption**

#### Data at Rest

**DynamoDB**
```hcl
server_side_encryption {
  enabled     = true
  kms_key_arn = aws_kms_key.dynamodb.arn  # Customer-managed KMS key
}
```
- **Key**: Dedicated KMS key in control-plane account
- **Rotation**: Automatic annual key rotation enabled
- **Scope**: Encrypts all data in user_instances table

**S3 (CloudTrail Logs)**
```hcl
server_side_encryption {
  enabled = true
  sse_algorithm = "AES256"  # Or use KMS for additional control
}
```

#### Data in Transit

**API Gateway → Client**
- **Protocol**: HTTPS only (API Gateway enforces)
- **Headers**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Cache-Control: no-cache`
- **Credentials**: JWT tokens in Authorization header

**Lambda → CodeBuild**
- **Protocol**: AWS-internal (VPC Endpoint or PrivateLink preferred)
- **Authentication**: IAM role-based (no API keys)

**CodeBuild → Terraform State**
- **Protocol**: HTTPS (AWS SDK enforces)
- **Encryption**: S3 bucket uses KMS encryption
- **State Locking**: DynamoDB with encryption

---

### 8. **Network & Isolation**

#### API Gateway Isolation
- **Type**: HTTP API (not REST API) for performance
- **Endpoint Type**: Regional (edge-optimized not needed)
- **CORS**: Restricted to `allowed_origins` list
  ```hcl
  allowed_origins = ["http://localhost:3000", "https://ariaeval.io"]
  ```

#### Lambda Execution Context
- **Timeout**: 300 seconds (5 minutes)
- **Memory**: Configurable (default 512 MB)
- **Ephemeral Storage**: Minimal (temp files cleaned up)
- **IAM Role**: Least-privilege (see IAM section)

#### DynamoDB Access
- **Point-in-Time Recovery**: Enabled (disaster recovery)
- **Backup**: Daily automated backups
- **Streams**: NEW_AND_OLD_IMAGES for audit trail

---

### 9. **Monitoring & Alerting**

#### CloudWatch Alarms

**Lambda Errors**
```hcl
alarm_name = "provisioning-lambda-errors"
threshold  = 1
period     = 60 seconds
```
- Triggers if Lambda function errors occur
- Action: Publish to SNS topic

**Lambda Throttles**
```hcl
alarm_name = "provisioning-lambda-throttles"
threshold  = 1
period     = 60 seconds
```
- Triggers if Lambda is throttled
- Action: Publish to SNS topic

**API Gateway 4xx Errors**
```hcl
alarm_name = "provisioning-api-4xx"
threshold  = 50
period     = 300 seconds
```
- Triggers if >50 client errors in 5 minutes
- Action: Publish to SNS topic

**API Gateway 5xx Errors**
```hcl
alarm_name = "provisioning-api-5xx"
threshold  = 1
period     = 60 seconds
```
- Triggers if any server error occurs
- Action: Publish to SNS topic

#### X-Ray Tracing
- **Enabled**: Lambda sends traces to X-Ray
- **Sampling**: 1% of requests (configurable)
- **Visibility**: Request tracing from API Gateway → Lambda → CodeBuild
- **Layer**: X-Ray SDK layer attached to Lambda

#### CloudTrail Audit Logging
- **Scope**: Multi-region trail
- **Events Tracked**:
  - Lambda function invocations
  - DynamoDB table operations (GetItem, PutItem, UpdateItem)
  - S3 operations on Terraform state bucket
- **Log Destination**: S3 bucket with encryption & versioning
- **Retention**: S3 lifecycle policies (configurable)

---

### 10. **IAM Least-Privilege Access**

#### Lambda Execution Role Permissions

**CodeBuild Invocation**
```json
{
  "Effect": "Allow",
  "Action": "codebuild:BatchGetBuilds",
  "Resource": "arn:aws:codebuild:REGION:ACCOUNT:project/PROJECTNAME"
}
```
- Only specific CodeBuild project
- Only read operations (query status, get logs)

**DynamoDB Operations**
```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:Query",
    "dynamodb:GetItem",
    "dynamodb:PutItem",
    "dynamodb:UpdateItem"
  ],
  "Resource": [
    "arn:aws:dynamodb:REGION:ACCOUNT:table/TABLE",
    "arn:aws:dynamodb:REGION:ACCOUNT:table/TABLE/index/*"
  ]
}
```
- Specific table and GSI only
- No DeleteItem, ScanItem, or administrative operations

**KMS Encryption**
```json
{
  "Effect": "Allow",
  "Action": [
    "kms:Decrypt",
    "kms:GenerateDataKey"
  ],
  "Resource": "arn:aws:kms:REGION:ACCOUNT:key/KEYID",
  "Condition": {
    "StringEquals": {
      "aws:SourceAccount": "ACCOUNT"
    }
  }
}
```
- Only decrypt/generate (no key deletion, rotation)
- Resource-specific

**CloudWatch Logs**
```json
{
  "Effect": "Allow",
  "Action": [
    "logs:CreateLogStream",
    "logs:PutLogEvents"
  ],
  "Resource": "arn:aws:logs:REGION:ACCOUNT:log-group:/aws/lambda/FUNCTION:*"
}
```
- Log group specific
- No log deletion or group modification

---

## Deployment Checklist

### Pre-Deployment

- [ ] **Cognito Setup**
  - [ ] Create User Pool (if not exists)
  - [ ] Create App Client
  - [ ] Note Pool ID and App Client ID
  - [ ] Configure JWT claims (include `sub`, `aud`)

- [ ] **Configuration**
  - [ ] Update `terraform.tfvars` with:
    - `cognito_user_pool_id`: Your User Pool ID
    - `jwt_audience`: Your App Client ID or custom audience
    - `max_instances_per_user`: Your limit (default 2)
    - `max_monthly_spend_per_user`: Your budget (default $1000)
    - `cost_per_instance_hour`: Your instance cost

- [ ] **IAM**
  - [ ] Ensure CodeBuild role has Terraform permissions
  - [ ] Ensure Lambda execution role has CodeBuild and DynamoDB permissions
  - [ ] Verify KMS key access

### Deployment Steps

```bash
# 1. Navigate to control-plane-prod directory
cd infra/terraform/environments/control-plane-prod/

# 2. Validate configuration
terraform validate

# 3. Plan deployment
terraform plan -out=tfplan

# 4. Review and apply
terraform apply tfplan

# 5. Verify outputs
terraform output provisioning_api_endpoint
terraform output jwt_authorizer_function_arn
```

### Post-Deployment Verification

- [ ] **API Gateway**
  ```bash
  # Test without token (should fail with 401)
  curl https://YOUR-API-ENDPOINT/provision \
    -X POST \
    -H "Content-Type: application/json" \
    -d '{"userId":"test","planType":"free"}'
  # Expected: 401 Unauthorized
  ```

- [ ] **JWT Authorizer**
  ```bash
  # Obtain token from Cognito
  TOKEN=$(aws cognito-idp initiate-auth \
    --user-pool-id YOUR_POOL_ID \
    --client-id YOUR_CLIENT_ID \
    --auth-flow USER_PASSWORD_AUTH \
    --auth-parameters USERNAME=testuser,PASSWORD=testpass \
    | jq -r '.AuthenticationResult.AccessToken')
  
  # Test with token
  curl https://YOUR-API-ENDPOINT/provision \
    -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"userId":"test","planType":"free"}'
  # Expected: 202 Accepted (if CodeBuild succeeds)
  ```

- [ ] **DynamoDB**
  ```bash
  aws dynamodb describe-table \
    --table-name aria-control-plane-user-instances \
    | jq '.Table.SSEDescription, .Table.PointInTimeRecoveryDescription'
  # Verify: SSE enabled, PITR enabled
  ```

- [ ] **CloudTrail**
  ```bash
  aws cloudtrail describe-trails \
    --trail-name provisioning-trail \
    | jq '.trailList[0]'
  # Verify: IsMultiRegionTrail: true, HasCustomEventSelectors: true
  ```

- [ ] **WAF**
  ```bash
  aws wafv2 get-web-acl-for-resource \
    --resource-arn arn:aws:apigateway:REGION::/restapis/APIID \
    | jq '.WebACL.Name'
  # Verify: WAF is attached to API Gateway
  ```

- [ ] **Monitoring**
  ```bash
  # Check CloudWatch Logs
  aws logs tail /aws/lambda/aria-provisioner --follow
  
  # Check X-Ray traces
  aws xray get-service-graph --start-time $(date -d '1 hour ago' +%s)
  ```

---

## Security Incident Response

### Rate Limit Exceeded
- **Symptom**: Client receives 429 Too Many Requests
- **Root Cause**: User exceeded 10 requests/hour limit
- **Resolution**: 
  - Check CloudWatch logs for user's request pattern
  - If legitimate, increase `max_instances_per_user` in terraform.tfvars
  - If abuse, manually block user in Cognito (disable account)

### Cost Guardrail Hit
- **Symptom**: Client receives 400 Bad Request ("Cost guardrail exceeded")
- **Root Cause**: Instance count or monthly spend limit reached
- **Resolution**:
  - Check CloudWatch Logs for user's instance count
  - Query DynamoDB: `aws dynamodb query --table-name aria-control-plane-user-instances --key-condition-expression "user_id = :uid" --expression-attribute-values '{":uid":{"S":"USER-ID"}}'`
  - If instances are no longer needed, mark as `suspended` for cleanup
  - Contact user to discuss upgrade or cleanup

### JWT Validation Failures
- **Symptom**: Client receives 401 Unauthorized, logs show "Invalid token"
- **Root Cause**: Token expired, wrong audience, or invalid signature
- **Resolution**:
  - Verify Cognito User Pool ID matches `cognito_user_pool_id` in terraform.tfvars
  - Verify token's `aud` claim matches `jwt_audience` variable
  - Check token expiration: `jwt_decode(token)['exp'] > time.time()`
  - Check CloudTrail for JWT authorizer invocations

### Lambda Throttling
- **Symptom**: CloudWatch Alarm triggers, API returns 503 Service Unavailable
- **Root Cause**: Lambda concurrency limit reached
- **Resolution**:
  - Check CloudWatch metric: LambdaProvisioningThrottles
  - Increase Lambda reserved concurrency (default: account limit)
  - For control-plane-prod: `reserved_concurrent_executions = 100`

---

## Zero-Trust Security Principles Applied

1. **Verify Identity**: JWT token validation with Cognito integration
2. **Verify Authorization**: Token scopes (implicit via `aud` claim)
3. **Validate Intent**: Input validation and sanitization
4. **Enforce Least Privilege**: IAM roles with specific resource restrictions
5. **Encrypt Everything**: Data at rest (KMS) and in transit (HTTPS/TLS)
6. **Audit & Monitor**: CloudTrail + CloudWatch logs + X-Ray traces
7. **Rate Limit**: Per-user and per-IP rate limiting
8. **Cost Control**: Guardrails to prevent resource exhaustion
9. **Network Security**: WAF rules + API Gateway isolation
10. **Incident Response**: Alarms + SNS notifications for security events

---

## Compliance Considerations

### GDPR
- User data: Minimal (only user_id stored in DynamoDB)
- Audit logs: Encrypted in CloudTrail S3 bucket
- Retention: S3 lifecycle policies (configurable)
- Data Deletion: Implement Lambda to delete user data on request

### SOC 2
- Encryption: KMS keys for DynamoDB and S3
- Access Control: IAM roles with least privilege
- Audit Logging: CloudTrail enabled with encryption
- Monitoring: CloudWatch alarms and X-Ray traces
- Incident Response: SNS notifications and manual escalation

### PCI DSS
- Network Segmentation: API Gateway + Lambda in private subnets (recommended)
- Encryption: TLS 1.2+ for all API communications
- Access Control: JWT-based authentication
- Audit Logging: CloudTrail + CloudWatch Logs retained

---

## Future Enhancements

1. **Distributed Rate Limiting**: Move from in-memory to DynamoDB-backed
2. **IP Allowlisting**: Add origin IP whitelist for internal integrations
3. **Signature Verification**: Full JWT signature verification against Cognito JWKs
4. **Secrets Rotation**: Use Secrets Manager for sensitive configuration
5. **Multi-Factor Authentication**: Require MFA for sensitive operations
6. **API Key Management**: Add API key rotation for non-Cognito clients
7. **VPC Endpoints**: Private API Gateway endpoints for network isolation
8. **Advanced Threat Detection**: GuardDuty integration for ML-based detection
9. **Automated Response**: Lambda-based auto-remediation for security findings
10. **Security Hub**: Centralized security findings aggregation

---

## References

- [AWS Lambda Security Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/security.html)
- [AWS API Gateway Security](https://docs.aws.amazon.com/apigateway/latest/developerguide/security.html)
- [AWS WAF Developer Guide](https://docs.aws.amazon.com/waf/latest/developerguide/)
- [AWS DynamoDB Encryption](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/encryption.html)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Zero Trust Architecture](https://www.nist.gov/publications/zero-trust-architecture)
- [AWS Well-Architected Framework - Security Pillar](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/welcome.html)
