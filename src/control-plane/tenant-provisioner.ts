// src/control-plane/tenant-provisioner.ts
// Phase 6: the control-plane creates per-tenant compute on the shared platform via
// the AWS SDK directly (no CodeBuild). Mirrors infra/terraform/modules/tenant-service.
// Gated by PLATFORM_ECS_CLUSTER — absent ⇒ local mode (the caller flips to running).
// See docs/MULTI_TENANT_SPEC.md (Phase 6).

import {
  CreateServiceCommand,
  DeleteServiceCommand,
  DeregisterTaskDefinitionCommand,
  ECSClient,
  RegisterTaskDefinitionCommand,
  UpdateServiceCommand,
} from '@aws-sdk/client-ecs';
import {
  CreateRuleCommand,
  CreateTargetGroupCommand,
  DeleteRuleCommand,
  DeleteTargetGroupCommand,
  ElasticLoadBalancingV2Client,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import {
  ApplicationAutoScalingClient,
  DeregisterScalableTargetCommand,
  PutScalingPolicyCommand,
  RegisterScalableTargetCommand,
} from '@aws-sdk/client-application-auto-scaling';

const CONTAINER_PORT = 3001;

interface PlatformConfig {
  cluster: string;
  subnets: string[];
  tenantSgId: string;
  vpcId: string;
  httpsListenerArn: string;
  executionRoleArn: string;
  taskRoleArn: string;
  databaseUrlSecretArn: string;
  stateBucket: string;
  redisHost: string;
  domain: string;
  imageUri: string;
  region: string;
  controlPlaneInternalUrl: string;
  websiteUrl: string;
}

// Per-tier Fargate sizing (cpu units / MiB). Defaults to small; enterprise tiers larger.
const TIER_SIZING: Record<string, { cpu: number; memory: number; maxCapacity: number }> = {
  free: { cpu: 512, memory: 1024, maxCapacity: 1 },
  individual: { cpu: 512, memory: 1024, maxCapacity: 2 },
  enterprise_starter: { cpu: 1024, memory: 2048, maxCapacity: 3 },
  enterprise_pro: { cpu: 2048, memory: 4096, maxCapacity: 5 },
  enterprise_unlimited: { cpu: 4096, memory: 8192, maxCapacity: 10 },
};

export interface TenantServiceRefs {
  ecsServiceName: string;
  serviceArn: string;
  targetGroupArn: string;
  listenerRuleArn: string;
  taskDefinitionArn: string;
}

export interface ProvisionArgs {
  tenantId: string;
  host: string;
  pricingTier: string;
  listenerRulePriority: number;
}

/** True when real per-tenant AWS provisioning is configured (vs local mode). */
export function isPlatformProvisioningEnabled(): boolean {
  return !!process.env['PLATFORM_ECS_CLUSTER']?.trim();
}

function loadConfig(): PlatformConfig {
  const get = (k: string): string => process.env[k]?.trim() ?? '';
  const cfg: PlatformConfig = {
    cluster: get('PLATFORM_ECS_CLUSTER'),
    subnets: get('PLATFORM_PRIVATE_SUBNET_IDS').split(',').map((s) => s.trim()).filter(Boolean),
    tenantSgId: get('PLATFORM_TENANT_SG_ID'),
    vpcId: get('PLATFORM_VPC_ID'),
    httpsListenerArn: get('PLATFORM_ALB_HTTPS_LISTENER_ARN'),
    executionRoleArn: get('PLATFORM_EXECUTION_ROLE_ARN'),
    taskRoleArn: get('PLATFORM_TASK_ROLE_ARN'),
    databaseUrlSecretArn: get('PLATFORM_DATABASE_URL_SECRET_ARN'),
    stateBucket: get('PLATFORM_STATE_BUCKET'),
    redisHost: get('PLATFORM_REDIS_HOST'),
    domain: get('PLATFORM_DOMAIN'),
    imageUri: get('PLATFORM_APP_IMAGE_URI'),
    region: get('AWS_REGION') || 'eu-west-2',
    controlPlaneInternalUrl: get('CONTROL_PLANE_INTERNAL_URL'),
    websiteUrl: get('ARIA_WEBSITE_URL'),
  };

  const required: (keyof PlatformConfig)[] = [
    'cluster', 'tenantSgId', 'vpcId', 'httpsListenerArn',
    'executionRoleArn', 'taskRoleArn', 'databaseUrlSecretArn', 'imageUri',
  ];
  const missing = required.filter((k) => !cfg[k] || (Array.isArray(cfg[k]) && (cfg[k] as string[]).length === 0));
  if (cfg.subnets.length === 0) missing.push('subnets' as keyof PlatformConfig);
  if (missing.length > 0) {
    throw new Error(`tenant-provisioner: missing platform config: ${missing.join(', ')}`);
  }
  return cfg;
}

function shortName(prefix: string, tenantId: string, max: number): string {
  return `${prefix}-${tenantId}`.slice(0, max);
}

function ecsClient(region: string): ECSClient {
  return new ECSClient({ region });
}
function elbClient(region: string): ElasticLoadBalancingV2Client {
  return new ElasticLoadBalancingV2Client({ region });
}
function scalingClient(region: string): ApplicationAutoScalingClient {
  return new ApplicationAutoScalingClient({ region });
}

function tenantContainerEnv(cfg: PlatformConfig, tenantId: string, pricingTier: string): { name: string; value: string }[] {
  const env: { name: string; value: string }[] = [
    { name: 'NODE_ENV', value: 'production' },
    { name: 'API_PORT', value: String(CONTAINER_PORT) },
    { name: 'TENANT_ID', value: tenantId },
    { name: 'TENANT_SCOPING_MODE', value: 'enforce' },
    { name: 'SAAS_MODE', value: 'true' },
    { name: 'PRICING_TIER', value: pricingTier },
    { name: 'SCENARIOS_DIR', value: '/app/state/scenarios' },
    { name: 'EVAL_REPORT_OUTPUT_DIR', value: '/app/state/reports' },
    { name: 'AWS_S3_STATE_BUCKET', value: cfg.stateBucket },
    { name: 'AWS_S3_STATE_PREFIX', value: tenantId },
  ];
  if (cfg.redisHost) {
    env.push({ name: 'REDIS_HOST', value: cfg.redisHost }, { name: 'REDIS_PORT', value: '6379' });
  }
  if (cfg.controlPlaneInternalUrl) env.push({ name: 'CONTROL_PLANE_INTERNAL_URL', value: cfg.controlPlaneInternalUrl });
  if (cfg.websiteUrl) env.push({ name: 'ARIA_WEBSITE_URL', value: cfg.websiteUrl });
  return env;
}

/** Create the full per-tenant service stack. Service starts at desired=0 (scale-to-zero). */
export async function provisionTenantService(args: ProvisionArgs): Promise<TenantServiceRefs> {
  const cfg = loadConfig();
  const sizing = TIER_SIZING[args.pricingTier] ?? TIER_SIZING['individual']!;
  const serviceName = shortName('aria', args.tenantId, 255);
  const ecs = ecsClient(cfg.region);
  const elb = elbClient(cfg.region);
  const scaling = scalingClient(cfg.region);

  // 1. Task definition (DATABASE_URL injected from the shared Aurora secret).
  const taskDef = await ecs.send(new RegisterTaskDefinitionCommand({
    family: serviceName,
    requiresCompatibilities: ['FARGATE'],
    networkMode: 'awsvpc',
    cpu: String(sizing.cpu),
    memory: String(sizing.memory),
    executionRoleArn: cfg.executionRoleArn,
    taskRoleArn: cfg.taskRoleArn,
    containerDefinitions: [{
      name: 'app',
      image: cfg.imageUri,
      essential: true,
      environment: tenantContainerEnv(cfg, args.tenantId, args.pricingTier),
      secrets: [{ name: 'DATABASE_URL', valueFrom: cfg.databaseUrlSecretArn }],
      portMappings: [{ containerPort: CONTAINER_PORT, protocol: 'tcp' }],
      logConfiguration: {
        logDriver: 'awslogs',
        options: {
          'awslogs-group': `/aria/tenants/${args.tenantId}`,
          'awslogs-region': cfg.region,
          'awslogs-stream-prefix': 'app',
          'awslogs-create-group': 'true',
        },
      },
    }],
  }));
  const taskDefinitionArn = taskDef.taskDefinition?.taskDefinitionArn ?? '';

  // 2. Target group.
  const tg = await elb.send(new CreateTargetGroupCommand({
    Name: shortName('aria', args.tenantId, 32),
    Port: CONTAINER_PORT,
    Protocol: 'HTTP',
    VpcId: cfg.vpcId,
    TargetType: 'ip',
    HealthCheckPath: '/health',
    HealthCheckIntervalSeconds: 30,
    HealthyThresholdCount: 2,
    UnhealthyThresholdCount: 3,
    Matcher: { HttpCode: '200-399' },
  }));
  const targetGroupArn = tg.TargetGroups?.[0]?.TargetGroupArn ?? '';

  // 3. Host-header listener rule on the shared HTTPS listener.
  const rule = await elb.send(new CreateRuleCommand({
    ListenerArn: cfg.httpsListenerArn,
    Priority: args.listenerRulePriority,
    Conditions: [{ Field: 'host-header', HostHeaderConfig: { Values: [args.host] } }],
    Actions: [{ Type: 'forward', TargetGroupArn: targetGroupArn }],
  }));
  const listenerRuleArn = rule.Rules?.[0]?.RuleArn ?? '';

  // 4. ECS service — desired=0 (control-plane wakes on login).
  const service = await ecs.send(new CreateServiceCommand({
    cluster: cfg.cluster,
    serviceName,
    taskDefinition: taskDefinitionArn,
    desiredCount: 0,
    launchType: 'FARGATE',
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: cfg.subnets,
        securityGroups: [cfg.tenantSgId],
        assignPublicIp: 'DISABLED',
      },
    },
    loadBalancers: [{ targetGroupArn, containerName: 'app', containerPort: CONTAINER_PORT }],
  }));
  const serviceArn = service.service?.serviceArn ?? '';

  // 5. Scale-to-zero autoscaling.
  const resourceId = `service/${cfg.cluster}/${serviceName}`;
  await scaling.send(new RegisterScalableTargetCommand({
    ServiceNamespace: 'ecs',
    ResourceId: resourceId,
    ScalableDimension: 'ecs:service:DesiredCount',
    MinCapacity: 0,
    MaxCapacity: sizing.maxCapacity,
  }));
  await scaling.send(new PutScalingPolicyCommand({
    PolicyName: `${serviceName}-cpu`,
    ServiceNamespace: 'ecs',
    ResourceId: resourceId,
    ScalableDimension: 'ecs:service:DesiredCount',
    PolicyType: 'TargetTrackingScaling',
    TargetTrackingScalingPolicyConfiguration: {
      PredefinedMetricSpecification: { PredefinedMetricType: 'ECSServiceAverageCPUUtilization' },
      TargetValue: 70,
      ScaleInCooldown: 300,
      ScaleOutCooldown: 60,
    },
  }));

  return { ecsServiceName: serviceName, serviceArn, targetGroupArn, listenerRuleArn, taskDefinitionArn };
}

/** Wake an idle (scale-to-zero) tenant by setting desired_count=1. */
export async function wakeTenantService(ecsServiceName: string): Promise<void> {
  const cfg = loadConfig();
  await ecsClient(cfg.region).send(new UpdateServiceCommand({
    cluster: cfg.cluster,
    service: ecsServiceName,
    desiredCount: 1,
  }));
}

/** Suspend a tenant by scaling its service to zero. */
export async function suspendTenantService(ecsServiceName: string): Promise<void> {
  const cfg = loadConfig();
  await ecsClient(cfg.region).send(new UpdateServiceCommand({
    cluster: cfg.cluster,
    service: ecsServiceName,
    desiredCount: 0,
  }));
}

/** Tear down all per-tenant compute resources. */
export async function deprovisionTenantService(refs: Partial<TenantServiceRefs>): Promise<void> {
  const cfg = loadConfig();
  const ecs = ecsClient(cfg.region);
  const elb = elbClient(cfg.region);
  const scaling = scalingClient(cfg.region);

  if (refs.ecsServiceName) {
    const resourceId = `service/${cfg.cluster}/${refs.ecsServiceName}`;
    await scaling.send(new DeregisterScalableTargetCommand({
      ServiceNamespace: 'ecs',
      ResourceId: resourceId,
      ScalableDimension: 'ecs:service:DesiredCount',
    })).catch(() => undefined);
    await ecs.send(new DeleteServiceCommand({
      cluster: cfg.cluster,
      service: refs.ecsServiceName,
      force: true,
    })).catch(() => undefined);
  }
  if (refs.listenerRuleArn) {
    await elb.send(new DeleteRuleCommand({ RuleArn: refs.listenerRuleArn })).catch(() => undefined);
  }
  if (refs.targetGroupArn) {
    await elb.send(new DeleteTargetGroupCommand({ TargetGroupArn: refs.targetGroupArn })).catch(() => undefined);
  }
  if (refs.taskDefinitionArn) {
    await ecs.send(new DeregisterTaskDefinitionCommand({ taskDefinition: refs.taskDefinitionArn })).catch(() => undefined);
  }
}
