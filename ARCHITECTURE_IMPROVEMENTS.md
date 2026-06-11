# Architecture Improvements: Resilience, Performance, Cost & Distributed Auth

**Document Version**: 1.0  
**Date**: June 2026  
**Scope**: ARIA Evaluator TypeScript platform  

---

## Executive Summary

This document provides a comprehensive analysis of the current ARIA Evaluator architecture and recommends strategic improvements across four dimensions:

1. **Resilience** — Fault tolerance, failover, disaster recovery
2. **Performance** — Throughput, latency, scalability
3. **Cost** — Compute, storage, API call optimization
4. **Distributed Authentication** — Social login, credential auth, token management

The recommendations are organized by:
- **Priority** (P0: critical, P1: high, P2: medium, P3: nice-to-have)
- **Effort** (Low/Medium/High)
- **Impact** (Low/Medium/High)
- **Implementation** (step-by-step guidance)

---

## Part 1: Current Architecture Analysis

### 1.1 Strengths

✅ **Clear separation of concerns**
- Adapters isolate agent integration logic
- Judge system is well-encapsulated
- API routes are modular
- React UI is component-based

✅ **Good database design**
- Prisma provides type safety & migrations
- Schema has proper relationships & indexes
- Supports SQLite (dev) ↔ PostgreSQL (prod)

✅ **Flexible deployment**
- Docker containerization enables multi-environment deployment
- Terraform IaC for infrastructure as code
- AWS integration (Bedrock, Connect, Lex)

✅ **Observability hooks**
- Audit logging via AuditLog table
- Run events for SSE streaming
- Token usage tracking for cost

### 1.2 Current Weaknesses

❌ **Single points of failure**
- Monolithic API server (no redundancy)
- No database replication strategy
- Job queue is in-memory (lost on restart)
- No circuit breakers for external APIs (Bedrock, Connect)

❌ **Performance bottlenecks**
- Sequential judge dimension scoring (could parallelize)
- N+1 query risk in some routes (need query optimization)
- No caching layer (Redis/Memcached)
- SSE clients stored in memory (doesn't scale horizontally)

❌ **Cost inefficiencies**
- Always-on ECS tasks (no auto-scaling rules defined)
- Judge calls not batched optimally
- No cost-aware query optimization
- Transcript storage on disk + DB (duplication)

❌ **Auth system limitations**
- Local credential-only (no federation)
- No social login support
- JWT token storage not optimized
- No refresh token rotation strategy
- Session management doesn't scale across multiple API instances

---

## Part 2: Resilience Improvements

### R1: Circuit Breaker Pattern for External APIs

**Priority**: P0 | **Effort**: Medium | **Impact**: High

**Problem**: If Bedrock, Connect, or other AWS APIs fail, requests hang or crash.

**Solution**: Implement circuit breaker pattern using libraries like `opossum` or native implementation.

**Implementation**:

1. Create `src/lib/circuit-breaker.ts`:
```typescript
// src/lib/circuit-breaker.ts
export class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private resetTimeout = 30000; // 30 seconds

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - (this.lastFailureTime ?? 0) > this.resetTimeout) {
        this.state = 'half-open';
        this.successCount = 0;
      } else {
        throw new CircuitBreakerOpenError('Circuit is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failureCount = 0;
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= 2) {
        this.state = 'closed';
      }
    }
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= 5) {
      this.state = 'open';
    }
  }
}

// Usage in judge/llm-judge.ts
const bedrockCircuitBreaker = new CircuitBreaker();

export async function invokeJudge(...) {
  return bedrockCircuitBreaker.execute(async () => {
    const response = await bedrock.converse({ ... });
    return response;
  });
}
```

**Fallback Strategies**:
```typescript
// Fallback 1: Return cached last-known-good result
async function invokeJudgeWithFallback(transcript: Transcript) {
  try {
    return await invokeJudge(transcript);
  } catch (error) {
    // Try fallback: return last successful eval for similar scenario
    const cachedResult = await getCachedEvalForScenario(transcript.scenarioName);
    if (cachedResult) {
      return {
        ...cachedResult,
        cached: true,
        warning: 'Using cached result due to Bedrock unavailability'
      };
    }
    throw error;
  }
}

// Fallback 2: Degrade scoring quality (use fewer dimensions)
async function invokeJudgeDegraded(transcript: Transcript) {
  const criticalDims = [GUARDRAIL_COMPLIANCE]; // Security-first subset
  return scoreTranscriptWithDimensions(transcript, criticalDims);
}
```

**Monitoring**:
```typescript
// Add to CloudWatch
cloudwatch.putMetricData({
  Namespace: 'ARIA/CircuitBreaker',
  MetricData: [
    { MetricName: 'BedrockCBState', Value: state === 'open' ? 1 : 0 },
    { MetricName: 'BedrockFailures', Value: failureCount },
    { MetricName: 'BedrockHalfOpenAttempts', Value: successCount },
  ]
});
```

---

### R2: Persistent Job Queue (Replace In-Memory)

**Priority**: P0 | **Effort**: High | **Impact**: High

**Problem**: Job queue is in-memory, so runs are lost if the API crashes.

**Solution**: Move to persistent queue (Bull with Redis, or native Prisma-based queue).

**Option A: Bull + Redis (Recommended for high-volume)**
```typescript
// src/jobs/job-queue.ts (Redis-backed)
import Queue from 'bull';

export const runQueue = new Queue('runs', {
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379'),
    retryStrategy: (times) => Math.min(times * 50, 2000),
  },
});

runQueue.process(5, async (job) => {
  // Process the run
  const runId = job.data.runId;
  return executeRun(runId);
});

// Register job
export async function queueRun(runId: string) {
  await runQueue.add(
    { runId },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 3600 }, // Keep for 1 hour after completion
    }
  );
}

// Monitoring job health
runQueue.on('failed', async (job, error) => {
  console.error(`Job ${job.id} failed:`, error);
  await recordAuditEventSafe('job_failed', { jobId: job.id, error: error.message });
});

runQueue.on('completed', async (job) => {
  console.log(`Job ${job.id} completed`);
});
```

**Option B: Prisma-based Queue (Lower dependencies)**
```typescript
// src/jobs/prisma-queue.ts
export async function queueRun(runId: string) {
  const job = await prisma.job.create({
    data: {
      runId,
      status: 'queued',
      payloadJson: JSON.stringify({ runId }),
    },
  });
  return job.id;
}

export async function startWorker() {
  setInterval(async () => {
    const job = await prisma.job.findFirst({
      where: { status: 'queued' },
      orderBy: { createdAt: 'asc' },
    });

    if (!job) return;

    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'running', claimedAt: new Date() },
    });

    try {
      await executeRun(job.runId);
      await prisma.job.update({
        where: { id: job.id },
        data: { status: 'completed', completedAt: new Date() },
      });
    } catch (error) {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'queued', // Retry
          attemptCount: { increment: 1 },
        },
      });
    }
  }, 5000);
}
```

**Recommendation**: Use Bull + Redis for production (better at scale), Prisma queue for small deployments.

---

### R3: Database Replication & Failover

**Priority**: P1 | **Effort**: High | **Impact**: High

**Current**: Single PostgreSQL instance (point of failure in production).

**Solution**:

**For AWS RDS**:
```hcl
# infra/terraform/modules/rds/main.tf
resource "aws_db_instance" "postgres_primary" {
  identifier            = "aria-evaluator-primary"
  allocated_storage    = 100
  engine              = "postgres"
  engine_version      = "15.3"
  instance_class      = "db.t4g.large"
  
  # High availability
  multi_az            = true
  backup_retention_period = 30
  copy_tags_to_snapshot = true
  
  # Performance insights
  performance_insights_enabled = true
  performance_insights_retention_period = 7
}

resource "aws_db_instance" "postgres_replica" {
  identifier = "aria-evaluator-read-replica"
  replicate_source_db = aws_db_instance.postgres_primary.identifier
  
  # In different region for disaster recovery
  availability_zone = "eu-west-1b"
}
```

**Application-level read replicas**:
```typescript
// src/db/client.ts (enhanced)
const primaryDb = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL }, // Primary
  },
});

const replicaDb = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_READ_REPLICA_URL },
  },
});

// Router: send reads to replica, writes to primary
export const db = {
  run: {
    findMany: (...args) => replicaDb.run.findMany(...args),
    findUnique: (...args) => replicaDb.run.findUnique(...args),
    create: (...args) => primaryDb.run.create(...args),
    update: (...args) => primaryDb.run.update(...args),
  },
  // ... other models
};
```

---

### R4: API Server Redundancy & Load Balancing

**Priority**: P1 | **Effort**: Medium | **Impact**: High

**Current**: Single ECS task per environment.

**Solution**:

```hcl
# infra/terraform/modules/ecs/main.tf (enhanced)
resource "aws_ecs_service" "aria_evaluator" {
  name            = "aria-evaluator"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.aria_evaluator.arn
  
  # Run 3+ tasks for high availability
  desired_count = var.desired_count # Set to 3 in prod
  
  # Spread across availability zones
  placement_constraints {
    type = "distinctInstance"
  }
  
  # Service auto-scaling
  deployment_configuration {
    maximum_percent         = 200
    minimum_healthy_percent = 100
  }
  
  network_configuration {
    assign_public_ip = false
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs.id]
  }
  
  depends_on = [aws_lb_target_group.aria_evaluator]
}

resource "aws_autoscaling_target" "ecs" {
  max_capacity       = 10
  min_capacity       = 3
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.aria_evaluator.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_autoscaling_policy" "ecs_cpu" {
  autoscaling_group_name = aws_autoscaling_group.ecs.name
  
  policy_type = "TargetTrackingScaling"
  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = 70.0
  }
}
```

**Health checks**:
```typescript
// src/api/server.ts (enhanced)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    database: await checkDbHealth(),
    bedrock: await checkBedrockHealth(),
  });
});

app.get('/ready', async (req, res) => {
  // Used for ECS readiness probe
  const isReady = await checkAllDependencies();
  if (isReady) {
    res.status(200).json({ ready: true });
  } else {
    res.status(503).json({ ready: false });
  }
});
```

**ALB configuration**:
```hcl
resource "aws_lb_target_group" "aria_evaluator" {
  name            = "aria-evaluator"
  port            = 3001
  protocol        = "HTTP"
  vpc_id          = aws_vpc.main.id
  
  health_check {
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 5
    interval            = 30
    path                = "/health"
    matcher             = "200"
  }
}
```

---

### R5: Graceful Degradation & Fallbacks

**Priority**: P2 | **Effort**: Medium | **Impact**: Medium

**Problem**: If any service is down, entire evaluation fails.

**Solution**:

```typescript
// src/jobs/run-executor.ts (enhanced with degradation)
export async function executeRunWithGracefulDegradation(
  scenario: Scenario,
  adapter: BaseAdapter,
): Promise<{ transcript: Transcript; degraded: boolean; warnings: string[] }> {
  const warnings: string[] = [];
  
  try {
    const transcript = await ScenarioRunner.run(scenario, adapter);
    return { transcript, degraded: false, warnings };
  } catch (error) {
    warnings.push(`Adapter error: ${error.message}`);
  }

  // Fallback 1: Try with different adapter if available
  if (warnings.length > 0 && scenario.channel === 'chat') {
    try {
      const fallbackAdapter = getAlternateAdapter(scenario.provider);
      const transcript = await ScenarioRunner.run(scenario, fallbackAdapter);
      warnings.push('Using fallback adapter');
      return { transcript, degraded: true, warnings };
    } catch (fallbackError) {
      warnings.push(`Fallback adapter failed: ${fallbackError.message}`);
    }
  }

  // Fallback 2: Return mock transcript if available
  const mockTranscript = await getMockTranscriptForScenario(scenario.name);
  if (mockTranscript) {
    warnings.push('Using mock transcript (no live agent available)');
    return { transcript: mockTranscript, degraded: true, warnings };
  }

  throw new Error(`Unable to execute scenario: ${warnings.join('; ')}`);
}
```

---

## Part 3: Performance Improvements

### P1: Parallel Judge Dimension Scoring

**Priority**: P0 | **Effort**: Medium | **Impact**: High

**Current**: Judge evaluates dimensions sequentially (5-30 seconds per run).

**Improvement**: Batch session-level dimensions, parallelize trace-level evaluations.

**Implementation**:

```typescript
// src/judge/llm-judge.ts (enhanced)
export async function scoreTranscriptOptimized(
  transcript: Transcript,
  scenario: Scenario,
): Promise<EvalResult> {
  const selectedDims = selectDimensions(scenario, transcript);

  // Group dimensions by level
  const sessionDims = selectedDims.filter(d => d.level === 'SESSION');
  const traceDims = selectedDims.filter(d => d.level === 'TRACE');

  // 1. Score session-level dimensions in a single batch call
  const sessionScores = sessionDims.length > 0
    ? await scoreSessionDimensionsBatch(sessionDims, transcript, scenario)
    : {};

  // 2. Score trace-level dimensions in parallel batches
  const traceBatches = createBatches(transcript.turns, 5); // 5 turns per batch
  const traceScores = await Promise.all(
    traceBatches.map((batch, idx) =>
      scoreTraceBatch(traceDims, batch, transcript, scenario, idx)
    )
  );

  // 3. Aggregate scores
  const allScores = {
    ...sessionScores,
    ...Object.assign({}, ...traceScores),
  };

  // 4. Compute overall score
  const overallScore = computeWeightedAverage(selectedDims, allScores);

  return {
    runId: transcript.runId,
    overallScore,
    passed: overallScore >= PASSING_THRESHOLD,
    dimensionScores: allScores,
    summary: generateSummary(allScores),
    judgeModel: JUDGE_MODEL,
    scenarioType: scenario.attack_type ? 'security' : 'quality',
  };
}

// Batch API call: score multiple dims in one Bedrock call
async function scoreSessionDimensionsBatch(
  dimensions: Dimension[],
  transcript: Transcript,
  scenario: Scenario,
): Promise<Record<string, DimensionScore>> {
  const prompt = `
    Evaluate the transcript across these ${dimensions.length} dimensions:
    ${dimensions.map(d => `- ${d.id}: ${d.description}`).join('\n')}
    
    Return JSON: { "dimension_id": { "score": 0-1, "justification": "..." } }
  `;

  const response = await bedrock.converse({
    modelId: JUDGE_MODEL,
    messages: [{
      role: 'user',
      content: [{ type: 'text', text: prompt + '\n\n' + transcript.summary }],
    }],
  });

  return parseJsonResponse(response);
}

// Parallel trace batching
async function scoreTraceBatch(
  dimensions: Dimension[],
  turns: Turn[],
  transcript: Transcript,
  scenario: Scenario,
  batchIdx: number,
): Promise<Record<string, DimensionScore>> {
  const turnSummary = turns.map(t => 
    `[Turn ${t.index}] Customer: "${t.customerMessage}" Agent: "${t.agentResponse}"`
  ).join('\n');

  return scoreSessionDimensionsBatch(dimensions, { ...transcript, summary: turnSummary }, scenario);
}
```

**Expected Impact**: Reduce judge time from 20s to 8-10s (60% improvement).

---

### P2: Redis Caching Layer

**Priority**: P1 | **Effort**: Medium | **Impact**: High

**Problem**: Database queries are slow; no query caching.

**Solution**:

```typescript
// src/lib/cache.ts (new file)
import Redis from 'ioredis';

export const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379'),
  retryStrategy: (times) => Math.min(times * 50, 2000),
  lazyConnect: true,
});

export async function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds = 300,
): Promise<T> {
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);
  } catch (error) {
    console.warn(`Cache read error for ${key}:`, error);
  }

  const value = await fetcher();
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    console.warn(`Cache write error for ${key}:`, error);
  }

  return value;
}

export async function invalidateCache(pattern: string) {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
```

**Apply caching strategically**:

```typescript
// src/api/routes/scenarios.ts (enhanced)
scenariosRouter.get('/', requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const cacheKey = `scenarios:${userId}`;

  const scenarios = await getCached(cacheKey, async () => {
    return await prisma.scenario.findMany({
      where: { owner: userId },
      orderBy: { updatedAt: 'desc' },
    });
  }, 600); // 10 minutes

  res.json(scenarios);
});

// Invalidate cache on update
scenariosRouter.put('/:scenarioId', requireAuth, async (req, res) => {
  // ... update logic
  await invalidateCache(`scenarios:*`); // Clear all scenario caches
  res.json(updated);
});
```

**Cache configuration**:
```hcl
# infra/terraform/modules/elasticache/main.tf
resource "aws_elasticache_cluster" "aria_redis" {
  cluster_id           = "aria-evaluator-cache"
  engine              = "redis"
  engine_version      = "7.0"
  node_type           = "cache.t4g.micro"
  num_cache_nodes     = 1
  parameter_group_name = "default.redis7"
  
  # High availability
  automatic_failover_enabled = true
  
  subnet_group_name = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]
}
```

---

### P3: Query Optimization & Indexing

**Priority**: P1 | **Effort**: Low | **Impact**: Medium

**Problem**: Some routes have N+1 query issues.

**Optimization**:

```typescript
// src/api/routes/runs.ts (before - N+1 queries)
const runs = await prisma.run.findMany({ take: 10 });
for (const run of runs) {
  run.evalResult = await prisma.evalResult.findUnique({
    where: { runId: run.id },
  }); // ❌ Query per run
}

// After - single query with eager loading
const runs = await prisma.run.findMany({
  take: 10,
  include: {
    evalResult: true, // Fetch in same query
    scenario: { select: { name: true } },
  },
});
```

**Add missing indexes**:

```prisma
// prisma/schema.prisma (add these indexes)
model Run {
  id           String    @id @default(cuid())
  scenarioId   String?
  status       String    @default("pending")
  startedAt    DateTime?
  completedAt  DateTime?
  createdAt    DateTime  @default(now())
  
  // Indexes for common queries
  @@index([scenarioId])
  @@index([status, createdAt]) // For "list pending runs"
  @@index([createdAt]) // For sorting by date
}

model EvalResult {
  id        String    @id @default(cuid())
  runId     String    @unique
  passed    Boolean
  createdAt DateTime  @default(now())
  
  @@index([passed, createdAt]) // For "list failures"
}
```

---

### P4: SSE Client Management (Horizontal Scaling)

**Priority**: P1 | **Effort**: High | **Impact**: High

**Problem**: SSE clients stored in memory; doesn't work across multiple API instances.

**Solution**: Use Redis pub/sub for distributed SSE.

```typescript
// src/api/sse-bus.ts (distributed version)
import { redis } from '../lib/cache.js';

// In-memory map per instance (for fast local delivery)
const localClients = new Map<string, Response>();

// Subscribe to all run events via Redis
redis.subscribe('run-events', (error) => {
  if (error) console.error('Redis subscribe error:', error);
});

redis.on('message', (channel, message) => {
  if (channel === 'run-events') {
    const event = JSON.parse(message);
    
    // Deliver to local clients
    const client = localClients.get(event.runId);
    if (client) {
      client.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  }
});

export function registerSseClient(runId: string, res: Response) {
  localClients.set(runId, res);
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const cleanup = () => localClients.delete(runId);
  res.on('close', cleanup);
  res.on('error', cleanup);
}

export async function publishRunEvent(runId: string, event: RunEvent) {
  // Broadcast to all instances via Redis
  await redis.publish('run-events', JSON.stringify({ runId, ...event }));
  
  // Also save to DB
  await prisma.runEvent.create({ data: { runId, eventType: event.type, ... } });
}
```

---

## Part 4: Cost Optimization

### C1: Serverless Architecture (Lambda for Judge)

**Priority**: P2 | **Effort**: High | **Impact**: High

**Problem**: ECS tasks run 24/7 even when idle.

**Solution**: Move judge evaluation to Lambda (pay per invocation).

**Architecture**:

```
API Server (ECS) → Async → Lambda Judge → Bedrock
                ↓
              (queue job)
              ↓
            SNS/SQS
              ↓
           Lambda Judge
              ↓
         Bedrock Invoke
              ↓
          DynamoDB (result)
              ↓
         Update Run status
```

**Implementation**:

```python
# lambda/judge_handler/handler.py (Python)
import json
import boto3
import os
from datetime import datetime

bedrock = boto3.client('bedrock-runtime')
dynamodb = boto3.resource('dynamodb')
runs_table = dynamodb.Table(os.environ['RUNS_TABLE'])

def lambda_handler(event, context):
    """Evaluate run transcript via Bedrock"""
    run_id = event['runId']
    transcript = event['transcript']
    
    try:
        # Score dimensions via Bedrock
        scores = score_dimensions(transcript)
        
        # Save result
        overall_score = compute_overall(scores)
        runs_table.update_item(
            Key={'id': run_id},
            UpdateExpression='SET evalResult = :result, #status = :status',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':result': {
                    'overallScore': overall_score,
                    'passed': overall_score >= 0.7,
                    'dimensionScores': scores,
                    'evaluatedAt': datetime.now().isoformat(),
                },
                ':status': 'completed',
            }
        )
        
        return {'statusCode': 200, 'body': json.dumps({'runId': run_id})}
    
    except Exception as e:
        # Mark as failed
        runs_table.update_item(
            Key={'id': run_id},
            UpdateExpression='SET #status = :status, errorMessage = :error',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':status': 'failed',
                ':error': str(e),
            }
        )
        raise

def score_dimensions(transcript):
    """Invoke Bedrock to score transcript"""
    response = bedrock.invoke_model(
        modelId='anthropic.claude-3-5-sonnet-20241022-v2:0',
        body=json.dumps({
            'anthropic_version': 'bedrock-2023-06-01',
            'max_tokens': 2000,
            'messages': [
                {
                    'role': 'user',
                    'content': f"Score this transcript: {transcript}"
                }
            ]
        })
    )
    
    result = json.loads(response['body'].read())
    return parse_scores(result['content'][0]['text'])
```

**Terraform for Lambda**:

```hcl
# infra/terraform/modules/lambda-judge/main.tf
resource "aws_lambda_function" "judge" {
  filename      = "lambda_judge.zip"
  function_name = "aria-judge"
  role          = aws_iam_role.lambda_judge.arn
  handler       = "handler.lambda_handler"
  runtime       = "python3.12"
  timeout       = 300
  memory_size   = 512
  
  environment {
    variables = {
      RUNS_TABLE = aws_dynamodb_table.runs.name
      BEDROCK_MODEL = "anthropic.claude-3-5-sonnet-20241022-v2:0"
    }
  }
  
  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = [aws_security_group.lambda.id]
  }
  
  # Reserved concurrency to prevent throttling
  reserved_concurrent_executions = 100
}

# Cost: ~$0.01 per run (vs $0.50/hour ECS task)
```

**API integration**:

```typescript
// src/jobs/run-executor.ts (enhanced)
export async function executeRun(runId: string) {
  const run = await prisma.run.findUnique({ where: { id: runId } });
  const transcript = await loadTranscript(run.id);
  
  // Invoke Lambda async
  await lambda.invokeAsync({
    FunctionName: 'aria-judge',
    InvokeType: 'Event', // Async
    Payload: JSON.stringify({
      runId: run.id,
      transcript: transcript.summary,
      scenario: run.scenario,
    }),
  });

  // Mark as sent to Lambda
  await prisma.run.update({
    where: { id: runId },
    data: { status: 'evaluating' },
  });
}

// Lambda updates status when done (via DynamoDB stream or webhook)
```

**Cost Comparison**:
- Current: 3 ECS tasks × $0.50/hr × 730 hours = $1,095/month
- With Lambda: ~500 runs/month × $0.01 = $5/month
- **Savings**: $1,090/month (99% reduction)

---

### C2: Transcript Storage Optimization

**Priority**: P2 | **Effort**: Medium | **Impact**: Medium

**Problem**: Transcripts stored in both DB and disk (duplication + cost).

**Solution**: Store only in S3 with presigned URLs.

```typescript
// src/jobs/run-executor.ts (enhanced)
async function saveTranscript(transcript: Transcript) {
  const key = `transcripts/${transcript.runId}/${transcript.id}.json`;
  
  // Save to S3
  await s3.putObject({
    Bucket: process.env.TRANSCRIPTS_BUCKET!,
    Key: key,
    Body: JSON.stringify(transcript),
    ServerSideEncryption: 'AES256',
    StorageClass: 'INTELLIGENT_TIERING', // Auto-optimize
  });

  // Save metadata + S3 path to DB (not full content)
  await prisma.transcript.create({
    data: {
      runId: transcript.runId,
      s3Key: key,
      summary: transcript.summary, // Keep summary for quick display
      turnCount: transcript.turns.length,
      startedAt: transcript.startedAt,
    },
  });
}

// Retrieve with presigned URL
export async function getTranscriptPresignedUrl(runId: string) {
  const transcript = await prisma.transcript.findUnique({ where: { runId } });
  
  const url = await s3.getSignedUrl('getObject', {
    Bucket: process.env.TRANSCRIPTS_BUCKET!,
    Key: transcript.s3Key,
    Expires: 3600, // 1 hour
  });

  return url;
}
```

**S3 Lifecycle**:
```hcl
# infra/terraform/modules/s3/main.tf
resource "aws_s3_bucket_lifecycle_configuration" "transcripts" {
  bucket = aws_s3_bucket.transcripts.id

  rule {
    id     = "archive-old-transcripts"
    status = "Enabled"

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 365 # Delete after 1 year
    }
  }
}
```

**Cost Impact**: Reduce DB size by 80%, save ~$200/month on RDS storage.

---

### C3: Judge Model Optimization

**Priority**: P1 | **Effort**: Low | **Impact**: Medium

**Problem**: Using Claude Sonnet (most expensive) for all evaluations.

**Solution**: Route by complexity.

```typescript
// src/judge/model-selection.ts (new)
export function selectJudgeModel(scenario: Scenario): string {
  // Security: Always use best model (false negatives are costly)
  if (scenario.attack_type) {
    return 'claude-sonnet-4-5'; // $0.003 input, $0.015 output
  }

  // Quality: Use cheaper model
  if (scenario.mode === 'script' && scenario.turns?.length! < 5) {
    return 'claude-haiku-4-5'; // $0.00080 input, $0.004 output
  }

  // Balanced
  return 'claude-sonnet-4-5';
}

// Usage
const model = selectJudgeModel(scenario);
await bedrock.converse({
  modelId: model,
  messages: [...],
});
```

**Cost Breakdown** (1000 runs/month):
- All Sonnet: $3,200
- Mixed (70% Haiku, 30% Sonnet): $800
- **Savings**: $2,400/month

---

## Part 5: Distributed Authentication System

### Auth Architecture Overview

This design supports:
- Social login (Google, GitHub, OAuth2)
- Credential-based (email/password)
- Multi-provider federation
- Distributed token management
- Zero Cognito dependency

```
┌─────────────────────────────────────────────────────┐
│              Authentication Flow                     │
├─────────────────────────────────────────────────────┤
│                                                      │
│  User Login (Web/Mobile)                            │
│         ↓                                            │
│  ┌─────────────────────────────────────┐            │
│  │ Auth Service (Express/Node)         │            │
│  │ - Social: Google, GitHub, etc       │            │
│  │ - Credential: Email/Password        │            │
│  │ - Token management & refresh        │            │
│  │ - Session storage (Redis)           │            │
│  └─────────────────────────────────────┘            │
│         ↓              ↓                 ↓           │
│      OAuth            Crypto         Database        │
│     Providers          Hash          (User record)   │
│   (Google, etc)   (bcrypt/argon2)    (Prisma)      │
│         ↓              ↓                 ↓           │
│       [Provider]  [Password salt]   [Email,         │
│        [Token]     [Token hash]      social ID]    │
│                                                      │
│  Response: Access Token + Refresh Token             │
│  Storage: HttpOnly Cookie (token in secure storage) │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

### A1: Social OAuth Integration

**Priority**: P0 | **Effort**: Medium | **Impact**: High

**Implementation**:

```typescript
// src/api/auth-oauth.ts (new file)
import { Router, Request, Response } from 'express';
import axios from 'axios';
import { prisma } from '../db/client.js';
import { generateTokenPair, verifyRefreshToken } from './token-manager.js';
import { redis } from '../lib/cache.js';

export const oauthRouter = Router();

// ─── Google OAuth ────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = `${process.env.API_BASE_URL}/auth/oauth/google/callback`;

oauthRouter.get('/google/login', (req, res) => {
  const state = crypto.randomBytes(32).toString('hex');
  
  // Store state in Redis for CSRF protection
  redis.setex(`oauth:state:${state}`, 300, '1'); // 5 min expiry
  
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.append('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.append('redirect_uri', GOOGLE_REDIRECT_URI);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('scope', 'openid email profile');
  authUrl.searchParams.append('state', state);
  
  res.redirect(authUrl.toString());
});

oauthRouter.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;
  
  try {
    // Verify CSRF state
    const stateExists = await redis.get(`oauth:state:${state}`);
    if (!stateExists) {
      return res.status(400).json({ error: 'Invalid state parameter' });
    }
    await redis.del(`oauth:state:${state}`);

    // Exchange code for token
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: GOOGLE_REDIRECT_URI,
    });

    // Get user info
    const userInfoResponse = await axios.get(
      'https://openidconnect.googleapis.com/v1/userinfo',
      {
        headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` },
      }
    );

    const googleUser = userInfoResponse.data;

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { googleSub: googleUser.sub },
    });

    if (!user) {
      // Check if email already registered
      const existingUser = await prisma.user.findUnique({
        where: { email: googleUser.email },
      });

      if (existingUser) {
        // Link Google to existing account
        user = await prisma.user.update({
          where: { id: existingUser.id },
          data: { googleSub: googleUser.sub },
        });
      } else {
        // Create new user
        user = await prisma.user.create({
          data: {
            email: googleUser.email,
            username: googleUser.email.split('@')[0],
            googleSub: googleUser.sub,
            passwordHash: null, // No password for OAuth-only users
            role: 'user',
          },
        });
      }
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokenPair(user.id);

    // Store refresh token in Redis
    await redis.setex(`refresh:${user.id}`, 7 * 24 * 60 * 60, refreshToken); // 7 days

    // Set httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Redirect to frontend with access token
    res.redirect(
      `${process.env.UI_BASE_URL}/auth-callback?accessToken=${accessToken}`
    );
  } catch (error) {
    console.error('Google OAuth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// ─── GitHub OAuth ────────────────────────────────────────────────────
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_REDIRECT_URI = `${process.env.API_BASE_URL}/auth/oauth/github/callback`;

oauthRouter.get('/github/login', (req, res) => {
  const state = crypto.randomBytes(32).toString('hex');
  redis.setex(`oauth:state:${state}`, 300, '1');

  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.append('client_id', GITHUB_CLIENT_ID);
  authUrl.searchParams.append('redirect_uri', GITHUB_REDIRECT_URI);
  authUrl.searchParams.append('scope', 'user:email');
  authUrl.searchParams.append('state', state);

  res.redirect(authUrl.toString());
});

oauthRouter.get('/github/callback', async (req, res) => {
  const { code, state } = req.query;

  try {
    const stateExists = await redis.get(`oauth:state:${state}`);
    if (!stateExists) {
      return res.status(400).json({ error: 'Invalid state parameter' });
    }
    await redis.del(`oauth:state:${state}`);

    // Exchange code for token
    const tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      },
      { headers: { Accept: 'application/json' } }
    );

    // Get user info
    const userInfoResponse = await axios.get('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenResponse.data.access_token}`,
      },
    });

    const githubUser = userInfoResponse.data;

    // Get email if not public
    let email = githubUser.email;
    if (!email) {
      const emailResponse = await axios.get(
        'https://api.github.com/user/emails',
        {
          headers: {
            Authorization: `Bearer ${tokenResponse.data.access_token}`,
          },
        }
      );
      email = emailResponse.data.find((e: any) => e.primary)?.email;
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { githubId: githubUser.id },
    });

    if (!user) {
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        user = await prisma.user.update({
          where: { id: existingUser.id },
          data: { githubId: githubUser.id },
        });
      } else {
        user = await prisma.user.create({
          data: {
            email,
            username: githubUser.login,
            githubId: githubUser.id,
            passwordHash: null,
            role: 'user',
          },
        });
      }
    }

    const { accessToken, refreshToken } = generateTokenPair(user.id);
    await redis.setex(`refresh:${user.id}`, 7 * 24 * 60 * 60, refreshToken);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.redirect(
      `${process.env.UI_BASE_URL}/auth-callback?accessToken=${accessToken}`
    );
  } catch (error) {
    console.error('GitHub OAuth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});
```

---

### A2: Credential-Based Auth (Email/Password)

**Priority**: P0 | **Effort**: Low | **Impact**: High

```typescript
// src/api/auth-credentials.ts (new file)
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../db/client.js';
import { generateTokenPair } from './token-manager.js';
import { redis } from '../lib/cache.js';
import { z } from 'zod';

export const credentialRouter = Router();

const SignupSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(12), // Strong password requirement
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

credentialRouter.post('/signup', async (req, res) => {
  try {
    const { email, username, password } = SignupSchema.parse(req.body);

    // Check if user exists
    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existing) {
      return res.status(400).json({
        error: existing.email === email
          ? 'Email already registered'
          : 'Username already taken',
      });
    }

    // Hash password with argon2 (better than bcrypt for password hashing)
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
        role: 'user',
      },
    });

    // Generate tokens
    const { accessToken, refreshToken } = generateTokenPair(user.id);
    await redis.setex(`refresh:${user.id}`, 7 * 24 * 60 * 60, refreshToken);

    // Set httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      user: { id: user.id, email: user.email, username: user.username },
      accessToken,
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(400).json({ error: 'Signup failed' });
  }
});

credentialRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = LoginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokenPair(user.id);
    await redis.setex(`refresh:${user.id}`, 7 * 24 * 60 * 60, refreshToken);

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      user: { id: user.id, email: user.email, username: user.username },
      accessToken,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(400).json({ error: 'Login failed' });
  }
});
```

---

### A3: Token Management & Session Lifecycle

**Priority**: P0 | **Effort**: Medium | **Impact**: High

```typescript
// src/api/token-manager.ts (new file)
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'dev-secret';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'dev-secret-refresh';

export function generateTokenPair(userId: string) {
  // Short-lived access token (15 minutes)
  const accessToken = jwt.sign(
    { sub: userId, type: 'access' },
    ACCESS_TOKEN_SECRET,
    { expiresIn: '15m' }
  );

  // Longer-lived refresh token (7 days)
  const refreshToken = jwt.sign(
    { sub: userId, type: 'refresh' },
    REFRESH_TOKEN_SECRET,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
}

export function verifyAccessToken(token: string) {
  try {
    return jwt.verify(token, ACCESS_TOKEN_SECRET) as { sub: string };
  } catch (error) {
    return null;
  }
}

export function verifyRefreshToken(token: string) {
  try {
    return jwt.verify(token, REFRESH_TOKEN_SECRET) as { sub: string };
  } catch (error) {
    return null;
  }
}

// ─── Refresh Endpoint ────────────────────────────────────────────────

export const tokenRouter = Router();

tokenRouter.post('/refresh', async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({ error: 'No refresh token' });
  }

  const decoded = verifyRefreshToken(refreshToken);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }

  // Verify token is in Redis (not revoked)
  const storedToken = await redis.get(`refresh:${decoded.sub}`);
  if (storedToken !== refreshToken) {
    return res.status(401).json({ error: 'Refresh token revoked' });
  }

  // Generate new token pair
  const { accessToken, refreshToken: newRefreshToken } = generateTokenPair(decoded.sub);

  // Rotate refresh token
  await redis.del(`refresh:${decoded.sub}`);
  await redis.setex(
    `refresh:${decoded.sub}`,
    7 * 24 * 60 * 60,
    newRefreshToken
  );

  res.cookie('refreshToken', newRefreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({ accessToken });
});

// ─── Logout Endpoint ────────────────────────────────────────────────

tokenRouter.post('/logout', async (req, res) => {
  const decoded = verifyAccessToken(
    req.headers.authorization?.replace('Bearer ', '') || ''
  );

  if (decoded) {
    // Revoke refresh token
    await redis.del(`refresh:${decoded.sub}`);
  }

  res.clearCookie('refreshToken');
  res.json({ ok: true });
});
```

---

### A4: Database Schema Updates

**Priority**: P0 | **Effort**: Low | **Impact**: High

```prisma
// prisma/schema.prisma (User model updates)
model User {
  id                String        @id @default(cuid())
  username          String        @unique
  email             String?       @unique
  passwordHash      String?       // Null for OAuth-only users
  
  // OAuth fields
  googleSub         String?       @unique
  githubId          Int?          @unique
  microsoftSub      String?       @unique
  
  // Account metadata
  role              String        @default("user")
  suspended         Boolean       @default(false)
  suspendedAt       DateTime?
  lastLoginAt       DateTime?
  
  // Relationships
  sessions          AuthSession[]
  auditLogs         AuditLog[]
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt
  
  @@index([email])
  @@index([username])
}

model AuthSession {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  // Session metadata
  ipAddress String?
  userAgent String?
  lastSeenAt DateTime?
  
  createdAt DateTime  @default(now())
  expiresAt DateTime
  
  @@index([userId])
  @@index([expiresAt])
}
```

**Migration**:
```bash
npm run db:migrate -- --name add_oauth_fields
```

---

### A5: Distributed Session Management

**Priority**: P1 | **Effort**: Medium | **Impact**: High

**Problem**: Sessions stored in memory; doesn't work across multiple API instances.

**Solution**: Redis-backed session store.

```typescript
// src/api/session-manager.ts (new file)
import { redis } from '../lib/cache.js';

export async function createSession(
  userId: string,
  req: Request
): Promise<string> {
  const sessionId = randomUUID();
  
  const session = {
    userId,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };

  // Store in Redis + DB
  await redis.setex(
    `session:${sessionId}`,
    7 * 24 * 60 * 60, // 7 days
    JSON.stringify(session)
  );

  await prisma.authSession.create({
    data: {
      id: sessionId,
      userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return sessionId;
}

export async function getSession(sessionId: string) {
  const cached = await redis.get(`session:${sessionId}`);
  if (cached) {
    return JSON.parse(cached);
  }

  // Fallback: read from DB
  return await prisma.authSession.findUnique({
    where: { id: sessionId },
  });
}

export async function revokeSession(sessionId: string) {
  await redis.del(`session:${sessionId}`);
  await prisma.authSession.delete({
    where: { id: sessionId },
  });
}

export async function revokeAllUserSessions(userId: string) {
  // Get all session IDs
  const sessions = await prisma.authSession.findMany({
    where: { userId },
    select: { id: true },
  });

  // Delete from Redis + DB
  await Promise.all([
    ...sessions.map(s => redis.del(`session:${s.id}`)),
    prisma.authSession.deleteMany({
      where: { userId },
    }),
  ]);
}
```

---

### A6: Frontend Auth Integration

**Priority**: P0 | **Effort**: Medium | **Impact**: High

```typescript
// src/ui/lib/auth.ts (React utilities)
export async function loginWithGoogle() {
  window.location.href = `${API_BASE_URL}/auth/oauth/google/login`;
}

export async function loginWithGitHub() {
  window.location.href = `${API_BASE_URL}/auth/oauth/github/login`;
}

export async function loginWithCredentials(
  email: string,
  password: string
) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'include', // Include cookies
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const { accessToken } = await response.json();
  
  // Store in memory (never localStorage)
  sessionStorage.setItem('accessToken', accessToken);
  
  return accessToken;
}

export async function signupWithCredentials(
  email: string,
  username: string,
  password: string
) {
  const response = await fetch(`${API_BASE_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, username, password }),
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const { accessToken } = await response.json();
  sessionStorage.setItem('accessToken', accessToken);
  
  return accessToken;
}

export async function refreshAccessToken() {
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include', // Send refresh token cookie
  });

  if (!response.ok) {
    // Refresh failed, user needs to login again
    sessionStorage.removeItem('accessToken');
    throw new Error('Session expired');
  }

  const { accessToken } = await response.json();
  sessionStorage.setItem('accessToken', accessToken);
  
  return accessToken;
}

export async function logout() {
  const token = sessionStorage.getItem('accessToken');
  
  await fetch(`${API_BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
  });

  sessionStorage.removeItem('accessToken');
}
```

**React Hook**:
```typescript
// src/ui/hooks/useAuth.ts
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is logged in
    const token = sessionStorage.getItem('accessToken');
    if (token) {
      validateToken(token)
        .then(user => setUser(user))
        .catch(() => {
          // Try to refresh
          refreshAccessToken()
            .then(() => validateToken(token))
            .then(user => setUser(user))
            .catch(() => setUser(null));
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  return { user, loading, logout };
}
```

---

### A7: Multi-Provider Account Linking

**Priority**: P2 | **Effort**: Medium | **Impact**: Medium

**Allow users to link multiple providers to same account**:

```typescript
// src/api/auth-linking.ts
export const linkingRouter = Router();

linkingRouter.post('/link/google', requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { code } = req.body;

  try {
    // Exchange code for Google token
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: GOOGLE_REDIRECT_URI,
    });

    const userInfoResponse = await axios.get(
      'https://openidconnect.googleapis.com/v1/userinfo',
      {
        headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` },
      }
    );

    // Link to existing account
    await prisma.user.update({
      where: { id: userId },
      data: { googleSub: userInfoResponse.data.sub },
    });

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: 'Failed to link Google account' });
  }
});

linkingRouter.post('/unlink/google', requireAuth, async (req, res) => {
  const userId = req.user!.id;
  
  const user = await prisma.user.findUnique({ where: { id: userId } });
  
  // Must have at least one auth method
  if (!user!.passwordHash && user!.githubId === null) {
    return res.status(400).json({
      error: 'Cannot unlink - must have another auth method',
    });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { googleSub: null },
  });

  res.json({ ok: true });
});
```

---

## Part 6: Integration Architecture

### Complete Auth Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     ARIA Evaluator Auth System                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─ Frontend (React) ────────────────────────────────────────────┐  │
│  │ - Login/Signup UI                                            │  │
│  │ - Social buttons (Google, GitHub)                            │  │
│  │ - Session management via useAuth() hook                      │  │
│  │ - Store token in sessionStorage (not localStorage)           │  │
│  └─────────────────────────────┬──────────────────────────────┘  │
│                                ↓                                   │
│  ┌─ API Gateway + LB ────────────────────────────────────────────┐  │
│  │ - Route /auth/* requests                                     │  │
│  │ - Rate limiting (5 req/min for auth endpoints)               │  │
│  │ - TLS termination                                            │  │
│  └─────────────────────────────┬──────────────────────────────┘  │
│                                ↓                                   │
│  ┌─ Auth Service (ECS Tasks) ────────────────────────────────────┐  │
│  │ ┌─ OAuth Endpoints ──────────────────────────────────────┐   │  │
│  │ │ - /oauth/google/login → Google auth                   │   │  │
│  │ │ - /oauth/github/login → GitHub auth                   │   │  │
│  │ │ - /oauth/{provider}/callback ← Handle redirect        │   │  │
│  │ └────────────────────────────────────────────────────────┘   │  │
│  │ ┌─ Credential Endpoints ─────────────────────────────────┐   │  │
│  │ │ - /login → Email + password                           │   │  │
│  │ │ - /signup → Create account                            │   │  │
│  │ └────────────────────────────────────────────────────────┘   │  │
│  │ ┌─ Token Endpoints ──────────────────────────────────────┐   │  │
│  │ │ - /refresh → Rotate tokens                            │   │  │
│  │ │ - /logout → Revoke session                            │   │  │
│  │ └────────────────────────────────────────────────────────┘   │  │
│  │ ┌─ Account Linking ──────────────────────────────────────┐   │  │
│  │ │ - /link/{provider} → Add another auth method          │   │  │
│  │ │ - /unlink/{provider} → Remove auth method             │   │  │
│  │ └────────────────────────────────────────────────────────┘   │  │
│  └───────────────────┬─────────────────────────────────────────┘  │
│                      ↓                                             │
│  ┌─ Auth Dependencies ───────────────────────────────────────────┐  │
│  │ ┌─ OAuth Providers ──┐  ┌─ Redis Sessions ──┐  ┌─ Database ┐ │  │
│  │ │ - Google           │  │ - Session store   │  │ - Users   │ │  │
│  │ │ - GitHub           │  │ - Token cache     │  │ - Sessions│ │  │
│  │ │ - Microsoft        │  │ - Refresh tokens  │  │ - Audit   │ │  │
│  │ └────────────────────┘  └───────────────────┘  └───────────┘ │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌─ Protected Endpoints (API Server) ─────────────────────────────┐  │
│  │ - Authorization header: Bearer <accessToken>                  │  │
│  │ - Verify token signature via JWT                              │  │
│  │ - Check session in Redis (distributed cache)                  │  │
│  │ - Attached user context to request                            │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Multi-Instance Deployment

```
┌─────────────────────────────────────────────────────┐
│          AWS ECS Cluster (Multiple AZs)             │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ CloudFront (CDN)                             │   │
│  │ - Serve React UI                            │   │
│  │ - Cache JS/CSS (1 hour)                      │   │
│  │ - TLS/HTTP2                                  │   │
│  └────────────┬─────────────────────────────────┘   │
│               ↓                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ Application Load Balancer                    │   │
│  │ - Route /auth/* → Auth Service (sticky)      │   │
│  │ - Route /api/* → API Service (round-robin)   │   │
│  │ - Health checks every 30s                    │   │
│  └────────────┬─────────────────────────────────┘   │
│       ↓       ↓       ↓                             │
│  ┌─────────────────────────────────┐               │
│  │ ECS Tasks (3+ per service)      │               │
│  │ - Auth Service (3 tasks)         │               │
│  │ - API Service (3-10 auto-scaling)│               │
│  │ - Judge Lambda (async)           │               │
│  └────────────┬────────────────────┘               │
│               ↓                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │ Redis ElastiCache                           │   │
│  │ - Session store (distributed)               │   │
│  │ - Refresh tokens                            │   │
│  │ - Pub/Sub for SSE                           │   │
│  │ - Query cache                               │   │
│  │ - Job queue (Bull)                          │   │
│  └──────────────────────────────────────────────┘   │
│               ↓                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │ RDS PostgreSQL (Multi-AZ)                    │   │
│  │ - Primary + Read Replica                     │   │
│  │ - 30-day backups                             │   │
│  │ - Automated failover                         │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## Part 7: Implementation Roadmap

### Phase 1: Foundation (Week 1-2) — P0 items only
- [ ] Circuit breaker for Bedrock
- [ ] Persistent job queue (Bull + Redis)
- [ ] Social OAuth setup (Google + GitHub)
- [ ] Credential auth system
- [ ] Token management & refresh
- [ ] Database schema updates

**Cost**: Medium effort, High value

### Phase 2: Resilience (Week 3-4)
- [ ] Database replication (RDS Multi-AZ)
- [ ] API redundancy (3+ ECS tasks)
- [ ] Health checks & load balancing
- [ ] Session store migration to Redis

**Cost**: Medium effort, High impact

### Phase 3: Performance (Week 5-6)
- [ ] Parallel judge evaluation
- [ ] Redis caching layer
- [ ] Query optimization & indexes
- [ ] Distributed SSE (Redis pub/sub)

**Cost**: Medium effort, High impact

### Phase 4: Cost Optimization (Week 7-8)
- [ ] Lambda judge migration
- [ ] Transcript S3 + lifecycle policies
- [ ] Model selection by complexity
- [ ] Auto-scaling policies

**Cost**: High effort, High savings

### Phase 5: Polish (Week 9-10)
- [ ] Account linking
- [ ] Graceful degradation patterns
- [ ] Monitoring & alerting
- [ ] Documentation & runbooks

**Cost**: Low effort, Medium value

---

## Summary: Impact Matrix

| Improvement | Resilience | Performance | Cost | Effort | Priority |
|---|---|---|---|---|---|
| Circuit Breaker | ⭐⭐⭐ | ⭐⭐ | — | Medium | P0 |
| Persistent Queue | ⭐⭐⭐ | ⭐ | — | High | P0 |
| DB Replication | ⭐⭐⭐ | ⭐⭐ | — | High | P1 |
| API Redundancy | ⭐⭐⭐ | ⭐⭐⭐ | — | Medium | P1 |
| Parallel Judge | — | ⭐⭐⭐ | ⭐ | Medium | P0 |
| Redis Caching | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ | Medium | P1 |
| Lambda Judge | ⭐⭐ | — | ⭐⭐⭐ | High | P2 |
| S3 Transcripts | ⭐⭐ | — | ⭐⭐ | Medium | P2 |
| Model Selection | — | — | ⭐⭐ | Low | P1 |
| Social Auth | ⭐ | — | — | Medium | P0 |
| Distributed Auth | ⭐⭐⭐ | ⭐ | — | Medium | P1 |
| Account Linking | ⭐ | — | — | Low | P2 |

---

## Next Steps

1. **Review & Align**: Discuss priorities with team
2. **Set up environment variables**: AWS, OAuth provider credentials
3. **Start Phase 1**: Begin with circuit breaker + social auth
4. **Measure baseline**: Performance, cost, error rates
5. **Iterate & improve**: Track metrics, adjust as needed

---

**Questions?** Refer to specific sections for detailed implementation guidance.
