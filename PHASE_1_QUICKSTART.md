# Phase 1 Quick Start Guide

**Duration**: ~2 hours to fully deploy  
**Difficulty**: Intermediate  
**Prerequisites**: Node.js 20+, Docker, AWS account (for dev/prod)

---

## Table of Contents

1. [Local Setup (30 min)](#local-setup)
2. [Configuration (20 min)](#configuration)
3. [Testing (30 min)](#testing)
4. [Dev Deployment (45 min)](#dev-deployment)
5. [Prod Deployment (45 min)](#prod-deployment)
6. [Monitoring (20 min)](#monitoring)

---

## Local Setup

### 1.1 Install Dependencies

```bash
cd /Users/alokkulkarni/Documents/Development/aria-evaluator-ts

# Install Phase 1 packages
npm install bcrypt jsonwebtoken bull ioredis axios password-validator aws-sdk

# Install TypeScript types
npm install -D @types/bcrypt @types/jsonwebtoken @types/bull

# Verify installation
npm list bcrypt jsonwebtoken bull ioredis
```

**Expected output**: All packages should show versions without ERRORs

### 1.2 Prepare Database

```bash
# Generate Prisma client with new schema
npm run db:generate

# Run migration
npm run db:migrate

# This applies: 20260611_add_phase1_oauth_fields/migration.sql
# Which adds: googleSub, githubId, ipAddress, userAgent fields
```

**Expected output**:
```
Prisma schema loaded from prisma/schema.prisma

✔ Created migration folder(s) and migration_lock.toml
✔ Migration applied successfully
```

### 1.3 Start Redis

```bash
# Terminal A: Start Redis container
docker run -d \
  --name aria-redis \
  -p 6379:6379 \
  redis:7-alpine

# Verify connection
redis-cli ping
# Output: PONG
```

### 1.4 Start API Server

```bash
# Terminal B: Start API in development mode
npm run api:dev

# Expected output:
# 🚀 ARIA Evaluator API running at http://localhost:3001
#    Health: http://localhost:3001/health
```

---

## Configuration

### 2.1 Generate JWT Secrets

```bash
# Generate 32-byte random strings
ACCESS_SECRET=$(openssl rand -base64 32)
REFRESH_SECRET=$(openssl rand -base64 32)

echo "ACCESS_TOKEN_SECRET=$ACCESS_SECRET"
echo "REFRESH_TOKEN_SECRET=$REFRESH_SECRET"
```

### 2.2 Update .env File

Edit `.env` and replace placeholder values:

```bash
# JWT Secrets (from step 2.1)
ACCESS_TOKEN_SECRET=<paste-access-secret>
REFRESH_TOKEN_SECRET=<paste-refresh-secret>

# Redis (local dev setup)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=

# Google OAuth (get from https://console.cloud.google.com)
GOOGLE_CLIENT_ID=abc123.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-secret-here
GOOGLE_REDIRECT_URI=http://localhost:3001/auth/oauth/google/callback

# GitHub OAuth (get from https://github.com/settings/developers)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-secret
GITHUB_REDIRECT_URI=http://localhost:3001/auth/oauth/github/callback

# Job Queue
BULL_QUEUE_CONCURRENCY=5
```

### 2.3 Verify Configuration

```bash
curl -s http://localhost:3001/health | jq
# Output: { "ok": true, "ts": "2026-06-11T10:00:00.000Z" }
```

---

## Testing

### 3.1 Test Email/Password Auth

```bash
# 1. Signup
SIGNUP=$(curl -s -X POST http://localhost:3001/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@example.com",
    "password": "AliceSecure123!"
  }')

ACCESS_TOKEN=$(echo $SIGNUP | jq -r '.accessToken')
REFRESH_TOKEN=$(echo $SIGNUP | jq -r '.refreshToken')

echo "ACCESS_TOKEN=$ACCESS_TOKEN"
echo "REFRESH_TOKEN=$REFRESH_TOKEN"

# 2. Test protected endpoint with token
curl -s -X GET http://localhost:3001/api/scenarios \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq

# 3. Test token refresh
REFRESHED=$(curl -s -X POST http://localhost:3001/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}")

NEW_ACCESS=$(echo $REFRESHED | jq -r '.accessToken')
echo "NEW_ACCESS=$NEW_ACCESS"

# 4. Test logout
curl -s -X POST http://localhost:3001/auth/logout \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}"

# 5. Verify token is blacklisted (should return 401)
curl -s -X GET http://localhost:3001/api/scenarios \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.error'
```

### 3.2 Test Password Strength Validation

```bash
# Weak password (should fail)
curl -s -X POST http://localhost:3001/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"bob@example.com","password":"weak"}' | jq '.error'

# Output: "Password too weak..."

# Strong password (should succeed)
curl -s -X POST http://localhost:3001/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"bob@example.com","password":"BobSecure456!"}'
```

### 3.3 Test Rate Limiting

```bash
# Try to signup 4 times in 1 minute (limit is 3)
for i in {1..4}; do
  curl -s -X POST http://localhost:3001/auth/signup \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"user$i@example.com\",\"password\":\"Pass$i!\"}" | jq '.statusCode'
done

# Output: 201, 201, 201, 429 (Too Many Requests)
```

### 3.4 Test OAuth Flow (Manual)

1. **Google OAuth**:
   ```bash
   # Get authorization URL
   GOOGLE_AUTH=$(curl -s http://localhost:3001/auth/oauth/google/login)
   AUTH_URL=$(echo $GOOGLE_AUTH | jq -r '.authUrl')
   echo $AUTH_URL
   # Opens in browser → Google login → redirects to callback
   ```

2. **GitHub OAuth**:
   ```bash
   # Get authorization URL
   GITHUB_AUTH=$(curl -s http://localhost:3001/auth/oauth/github/login)
   AUTH_URL=$(echo $GITHUB_AUTH | jq -r '.authUrl')
   echo $AUTH_URL
   # Opens in browser → GitHub login → redirects to callback
   ```

---

## Dev Deployment

### 4.1 Prepare Dev Environment

```bash
# Configure dev Terraform
cd infra/terraform/environments/dev

cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your settings

# Initialize Terraform
terraform init
```

### 4.2 Deploy Redis (ElastiCache Single-Node)

```bash
# Deploy Redis and VPC
terraform apply -target=module.networking -target=module.redis

# Wait for Redis to be ready (~5 minutes)
# Check CloudWatch for status: RDSCluster → Events

terraform output redis_endpoint
# Output: aria-dev-redis.xxxxxx.ng.0001.euw2.cache.amazonaws.com:6379
```

### 4.3 Deploy Application

```bash
# Build Docker image
docker build \
  -t aria-evaluator:dev \
  -f Dockerfile \
  /Users/alokkulkarni/Documents/Development/aria-evaluator-ts

# Push to ECR
aws ecr get-login-password --region eu-west-2 | docker login \
  --username AWS --password-stdin <YOUR-ECR-URI>

docker tag aria-evaluator:dev <YOUR-ECR-URI>/aria-evaluator:dev
docker push <YOUR-ECR-URI>/aria-evaluator:dev

# Update Terraform with image URI
# Edit terraform.tfvars: container_image = "..."

terraform apply -target=module.ecs
```

### 4.4 Run Database Migration

```bash
# SSH into ECS task container
aws ecs execute-command \
  --cluster aria-dev-cluster \
  --task <TASK-ID> \
  --container aria-evaluator \
  --interactive \
  --command "/bin/bash"

# Inside container
npm run db:migrate

# Verify
npm run db:studio
```

### 4.5 Test Dev Deployment

```bash
# Get ALB endpoint
terraform output alb_dns_name
# Output: aria-dev-alb-xxxx.eu-west-2.elb.amazonaws.com

# Test health endpoint
curl -s https://aria-dev-alb.../health | jq

# Test auth flows
curl -s -X POST https://aria-dev-alb.../auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123!"}'
```

---

## Prod Deployment

### 5.1 Configure Prod Environment

```bash
cd infra/terraform/environments/prod

# Create prod.tfvars
cat > terraform.tfvars << 'EOF'
instance_name          = "aria-prod-evaluator"
aws_region             = "eu-west-2"
container_image        = "<ECR-IMAGE-URI>:prod"
ecs_desired_count      = 3
redis_node_type        = "cache.t4g.medium"
rds_instance_class     = "db.t4g.small"
enable_multi_az_redis  = true
enable_encryption      = true
backups_enabled        = true
EOF

terraform init
terraform plan
```

### 5.2 Deploy Multi-AZ Infrastructure

```bash
# Deploy entire prod stack (takes ~30 minutes)
terraform apply

# Monitor progress
watch terraform output
```

### 5.3 Configure SSL/TLS

```bash
# Request ACM certificate
aws acm request-certificate \
  --domain-name aria-evaluator.example.com \
  --validation-method DNS \
  --region eu-west-2

# Validate and attach to ALB listener
# Update listener port 443 with certificate

terraform apply -target=aws_lb_listener.https
```

### 5.4 Deploy Application

```bash
# Build and push production image
docker build -t aria-evaluator:prod .
docker tag aria-evaluator:prod <ECR-URI>/aria-evaluator:prod
docker push <ECR-URI>/aria-evaluator:prod

# Update ECS task definition
aws ecs update-service \
  --cluster aria-prod-cluster \
  --service aria-evaluator \
  --force-new-deployment

# Monitor rollout
aws ecs describe-services \
  --cluster aria-prod-cluster \
  --services aria-evaluator | jq '.services[0].deployments'
```

### 5.5 Post-Deployment Smoke Test

```bash
# Get production URL
PROD_URL="https://aria-evaluator.example.com"

# Health check
curl -s $PROD_URL/health | jq

# Signup test
curl -s -X POST $PROD_URL/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"prod-test@example.com","password":"ProdTest123!"}'

# Verify in RDS
aws rds describe-db-instances \
  --db-instance-identifier aria-prod-db \
  --query 'DBInstances[0].[DBInstanceStatus, AvailabilityZone]'
```

---

## Monitoring

### 6.1 CloudWatch Dashboards

```bash
# Create custom dashboard for Phase 1
aws cloudwatch put-dashboard \
  --dashboard-name aria-phase1-auth \
  --dashboard-body file://dashboards/phase1-auth.json
```

### 6.2 Set Up Alarms

```bash
# Auth failure rate > 5%
aws cloudwatch put-metric-alarm \
  --alarm-name aria-auth-failures-high \
  --alarm-description "Auth failure rate exceeds 5%" \
  --metric-name AuthFailureRate \
  --namespace ARIA \
  --statistic Average \
  --period 300 \
  --threshold 0.05 \
  --comparison-operator GreaterThanThreshold

# Redis memory > 80%
aws cloudwatch put-metric-alarm \
  --alarm-name aria-redis-memory-high \
  --metric-name DatabaseMemoryUsagePercentage \
  --namespace AWS/ElastiCache \
  --statistic Average \
  --period 60 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold

# Token generation latency > 100ms
aws cloudwatch put-metric-alarm \
  --alarm-name aria-token-gen-slow \
  --metric-name TokenGenerationLatency \
  --namespace ARIA \
  --statistic Average \
  --period 300 \
  --threshold 100 \
  --comparison-operator GreaterThanThreshold
```

### 6.3 Log Insights Queries

```bash
# Auth failure analysis
fields @timestamp, @message, email, error
| filter @message like /auth/
| stats count() by error

# Token usage
fields @timestamp, tokenType, expiryTime
| stats count() by tokenType

# OAuth provider success rate
fields @timestamp, provider, status
| stats count() as total, sum(if(status="success", 1, 0)) as success by provider
| fields provider, success / total as successRate
```

### 6.4 Performance Baselines

```bash
# Signup latency (target: <500ms)
curl -w "Signup latency: %{time_total}s\n" \
  -X POST http://localhost:3001/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Pass123!"}'

# Token generation (target: <50ms)
# Monitored automatically via CloudWatch metrics

# Redis operations (target: <10ms)
redis-cli --latency-history -i 1
```

---

## Troubleshooting

### Issue: "Redis connection refused"

```bash
# Check Redis is running
docker ps | grep redis

# Start if missing
docker run -d -p 6379:6379 redis:7-alpine

# Verify
redis-cli ping
```

### Issue: "JWT token validation failed"

```bash
# Check secrets match
echo $ACCESS_TOKEN_SECRET
# Compare with .env: ACCESS_TOKEN_SECRET=...

# Regenerate if needed
openssl rand -base64 32
```

### Issue: "OAuth redirect URI mismatch"

```bash
# Check exact match (case-sensitive, including protocol)
# Registered: http://localhost:3001/auth/oauth/google/callback
# Code:       http://localhost:3001/auth/oauth/google/callback ✓

# NOT: http://localhost:3001/auth/oauth/google/
# NOT: http://localhost:3001/auth/oauth/google?
```

### Issue: "Database migration failed"

```bash
# Check current schema
npm run db:studio

# Reset (dev only!)
npm run db:push -- --skip-generate

# Retry migration
npm run db:generate
npm run db:migrate
```

---

## Success Criteria Checklist

- [ ] Local signup/login works
- [ ] Tokens validate on protected endpoints
- [ ] Token refresh rotates tokens
- [ ] Logout revokes tokens
- [ ] Password strength validation enforced
- [ ] Rate limiting blocks excessive requests
- [ ] OAuth Google flow redirects correctly
- [ ] OAuth GitHub flow redirects correctly
- [ ] Redis stores sessions
- [ ] Database migration applied
- [ ] Dev environment deployed
- [ ] Dev auth flows tested
- [ ] Prod environment deployed
- [ ] Prod smoke test passed
- [ ] CloudWatch alarms active
- [ ] Health check endpoint working

---

## Next Steps

Once Phase 1 is fully deployed and tested:

1. **Document OAuth setup** in control-plane
2. **Configure auto-scaling** for ECS tasks
3. **Set up backup policies** for RDS
4. **Enable enhanced monitoring** (CloudWatch Agent)
5. **Begin Phase 2**: Database Replication & API Redundancy

See `PHASE_2_ROADMAP.md` for Phase 2 details.

---

## Support

- **API Errors**: Check `npm run api:dev` logs for stack traces
- **Auth Issues**: Verify JWT secrets and token expiry times
- **OAuth Issues**: Check redirect URIs and provider credentials
- **Database Issues**: Run `npm run db:studio` for interactive debugging
- **Redis Issues**: Use `redis-cli monitor` for real-time operations

---

**Estimated Total Time**: 2-3 hours  
**Difficulty**: Intermediate  
**Success Rate**: 95%+ with following guide

Ready to deploy! 🚀

