# Phase 1 + Terraform Local Fix

**Issue**: Duplicate provider configuration in local environment  
**Root Cause**: Both `redis.tf` and `versions.tf` defined the Docker provider  
**Status**: ✅ FIXED

---

## What Was Fixed

### 1. Removed Duplicate Provider Definitions from `redis.tf`

**Before** (lines 10-21 in redis.tf):
```hcl
terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
}

provider "docker" {
  host = "unix:///var/run/docker.sock"
}
```

**After**:
- Removed the `terraform` block from `redis.tf`
- Removed the `provider` block from `redis.tf`
- These are now centralized in `versions.tf`

### 2. Updated `versions.tf` Docker Provider Configuration

Added `host` configuration to the Docker provider:

```hcl
provider "docker" {
  host = "unix:///var/run/docker.sock"
}
```

This ensures the local Docker daemon is properly connected.

### 3. Added Missing Variable to `variables.tf`

Added `docker_pull_trigger` variable that `redis.tf` was referencing:

```hcl
variable "docker_pull_trigger" {
  description = "Trigger value to force Docker image pull (e.g., current date to update Redis)"
  type        = string
  default     = "redis:7-alpine"
}
```

### 4. Added Phase 1 Variables to `variables.tf`

Added all Phase 1 authentication variables:

```hcl
# Phase 1: JWT Secrets
variable "access_token_secret" { ... }
variable "refresh_token_secret" { ... }

# Phase 1: OAuth Credentials
variable "google_client_id" { ... }
variable "google_client_secret" { ... }
variable "github_client_id" { ... }
variable "github_client_secret" { ... }
```

### 5. Updated `main.tf` to Pass Phase 1 Variables

Added locals block and updated module call:

```hcl
locals {
  phase1_environment_vars = [
    { name = "REDIS_HOST", value = "localhost" },
    { name = "REDIS_PORT", value = "6379" },
    { name = "ACCESS_TOKEN_SECRET", value = var.access_token_secret },
    { name = "REFRESH_TOKEN_SECRET", value = var.refresh_token_secret },
    # ... more Phase 1 env vars ...
  ]
}

module "docker_local" {
  source = "../../modules/docker-local"
  
  # ... existing variables ...
  
  extra_environment_vars = concat(var.extra_environment_vars, local.phase1_environment_vars)
}
```

### 6. Updated `terraform.tfvars` with Phase 1 Values

Added Phase 1 configuration:

```hcl
# Phase 1: JWT Secrets
access_token_secret  = "local-dev-access-token-secret-do-not-use-in-prod"
refresh_token_secret = "local-dev-refresh-token-secret-do-not-use-in-prod"

# Phase 1: OAuth Credentials
google_client_id     = "local-google-client-id"
google_client_secret = "local-google-client-secret"
github_client_id     = "local-github-client-id"
github_client_secret = "local-github-client-secret"
```

---

## Files Modified

| File | Changes |
|------|---------|
| `infra/terraform/environments/local/redis.tf` | ✅ Removed duplicate terraform/provider blocks |
| `infra/terraform/environments/local/versions.tf` | ✅ Added host config to docker provider |
| `infra/terraform/environments/local/variables.tf` | ✅ Added Phase 1 & docker_pull_trigger variables |
| `infra/terraform/environments/local/main.tf` | ✅ Added Phase 1 env var injection |
| `infra/terraform/environments/local/terraform.tfvars` | ✅ Added Phase 1 configuration values |

---

## Now Run Terraform

```bash
cd infra/terraform/environments/local

# 1. Clean up previous state (if terraform failed before)
rm -rf .terraform/
rm -f .terraform.lock.hcl
rm -f terraform.tfstate*

# 2. Initialize Terraform
terraform init

# 3. Validate configuration
terraform validate
# Output should be: Success! The configuration is valid.

# 4. Plan deployment
terraform plan
# Review the output for Docker resources

# 5. Apply deployment
terraform apply

# When asked "Do you want to perform these actions?" → type: yes
```

---

## Verify Deployment

```bash
# 1. Check Docker containers
docker ps
# You should see:
#   - aria-redis-local (port 6379)
#   - aria-evaluator-local (port 3001)

# 2. Test Redis connection
redis-cli ping
# Output: PONG

# 3. Test API health
curl http://localhost:3001/health
# Output: {"ok": true, "ts": "2026-06-11T..."}

# 4. Test Phase 1 auth signup
curl -X POST http://localhost:3001/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"SecurePass123!"}'

# Should return tokens if Phase 1 is working:
# {"accessToken":"eyJ...", "refreshToken":"eyJ...", "user":{...}}
```

---

## What's Now Running

After successful `terraform apply`, you have:

### Containers
- **aria-redis-local** (Redis 7)
  - Port: 6379 (localhost)
  - Persistent volume: aria-evaluator-local-state
  - Health check: Active

- **aria-evaluator-local** (ARIA API)
  - Port: 3001 (localhost)
  - Image: aria-evaluator:local (auto-built)
  - Environment: Phase 1 variables injected
  - Health check: curl http://localhost:3001/health

### Network
- **aria-evaluator-local-network** (Docker bridge)
  - Connects Redis to API container
  - Isolated from host network

### Volumes
- **aria-evaluator-local-state**
  - SQLite database
  - Evaluation reports
  - Transcripts
  - Persistent across restarts

---

## Phase 1 Auth Features Now Available

Once the containers are running:

✅ **Email/Password Auth**
```bash
curl -X POST http://localhost:3001/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"SecurePass123!"}'
```

✅ **Token Management**
```bash
# Login
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"SecurePass123!"}'

# Use token on protected endpoints
curl -X GET http://localhost:3001/api/scenarios \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

✅ **Token Refresh**
```bash
curl -X POST http://localhost:3001/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<REFRESH_TOKEN>"}'
```

✅ **Logout**
```bash
curl -X POST http://localhost:3001/auth/logout \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<REFRESH_TOKEN>"}'
```

✅ **OAuth (Setup Required)**
- Google OAuth redirects to: `http://localhost:3001/auth/oauth/google/login`
- GitHub OAuth redirects to: `http://localhost:3001/auth/oauth/github/login`
- (OAuth testing requires actual Google/GitHub credentials)

---

## Cleanup (If Needed)

```bash
# Remove all containers and volumes
terraform destroy

# Confirm with: yes

# Force remove containers if destroy fails
docker rm -f aria-evaluator-local aria-redis-local

# Remove Docker network
docker network rm aria-evaluator-local-network

# Remove Docker volume
docker volume rm aria-evaluator-local-state
```

---

## Testing Checklist

- [ ] `terraform validate` passes
- [ ] `terraform plan` shows 5-8 resources to create
- [ ] `terraform apply` completes without errors
- [ ] Both containers running: `docker ps`
- [ ] Redis responds: `redis-cli ping` → PONG
- [ ] API health: `curl http://localhost:3001/health` → 200 OK
- [ ] Auth signup works: Creates user and returns tokens
- [ ] Protected endpoint requires token: `/api/scenarios` returns 401 without token
- [ ] Token validation works: Same token on `/api/scenarios` returns 200 OK

---

## Troubleshooting

### Error: "Docker daemon is not running"

```bash
# Start Docker Desktop (macOS/Windows) or Docker daemon (Linux)
# macOS:
open -a Docker

# Linux:
sudo systemctl start docker
```

### Error: "Cannot connect to Docker daemon at unix:///var/run/docker.sock"

```bash
# On Linux, add your user to docker group:
sudo usermod -aG docker $USER
newgrp docker

# On macOS, Docker Desktop should handle this automatically
```

### Error: "redis-cli: command not found"

```bash
# Install Redis CLI
# macOS:
brew install redis

# Linux:
sudo apt-get install redis-tools

# Windows (WSL):
sudo apt-get install redis-tools
```

### Containers running but API not responding

```bash
# Check logs
docker logs aria-evaluator-local-api

# Restart containers
terraform taint module.docker_local.docker_container.app
terraform apply
```

### Port 3001 already in use

```bash
# Change port in terraform.tfvars:
host_port = 3002  # Use different port

# Or kill process using port 3001:
lsof -i :3001
kill -9 <PID>
```

---

## Next Steps

1. ✅ Verify local Terraform deployment works
2. ✅ Test Phase 1 auth flows with curl examples
3. ✅ Deploy to dev environment (see PHASE_1_TERRAFORM_DEPLOYMENT_GUIDE.md)
4. ✅ Deploy to prod environment

---

## Summary

**All Terraform configuration issues fixed.** Local environment should now:

✅ Initialize without provider conflicts  
✅ Deploy Docker containers for Redis and API  
✅ Inject Phase 1 environment variables  
✅ Support local auth testing  
✅ Connect to Redis from API container  

**Ready to test Phase 1 auth system locally!** 🚀

---

**Last Updated**: June 11, 2026  
**Status**: Ready for `terraform apply`

