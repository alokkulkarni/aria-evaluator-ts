import 'dotenv/config';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { CodeBuildClient, StartBuildCommand } from '@aws-sdk/client-codebuild';

type BillingPeriod = 'monthly' | 'annual';
type PricingTier = 'free' | 'individual' | 'enterprise_starter' | 'enterprise_pro' | 'enterprise_unlimited';
type InstanceStatus = 'not_provisioned' | 'provisioning' | 'running' | 'suspended' | 'error';
type AuthProvider = 'email' | 'google' | 'github' | 'apple';

interface ControlPlaneUser {
  id: string;
  email: string;
  name: string;
  company?: string;
  authProvider?: AuthProvider;
  role: 'owner' | 'admin' | 'member';
  passwordHash: string;
  isNewUser: boolean;
  tenantId?: string;
  lastLoginAt?: string;
  emailVerified?: boolean;
  passwordResetToken?: string;   // hashed SHA-256 of the raw token
  passwordResetExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface ControlPlaneSession {
  tokenHash: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
}

interface PaymentMethod {
  last4: string;
  brand: string;
  expMonth: number;
  expYear: number;
}

interface BillingInvoice {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'failed';
  downloadUrl?: string;
}

interface ControlPlaneTenant {
  id: string;
  userId: string;
  plan: PricingTier;
  region: string;
  billingPeriod: BillingPeriod;
  status: InstanceStatus;
  instanceUrl: string;
  ssoTokenHash?: string;
  ssoTokenExpiresAt?: string;
  billingStartedAt?: string;
  paymentMethod?: PaymentMethod;
  invoices?: BillingInvoice[];
  usage: {
    runsThisMonth: number;
    maxRuns: number;
    scenariosUsed: number;
    maxScenarios: number;
  };
  lastHeartbeatAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface ControlPlaneState {
  users: ControlPlaneUser[];
  sessions: ControlPlaneSession[];
  tenants: ControlPlaneTenant[];
  deletedAccounts: DeletedAccountRecord[];
  pendingHistoryWrites: PendingHistoryWrite[];
}

interface DeletedAccountRecord {
  id: string;
  userId: string;
  email: string;
  name: string;
  authProvider: string;
  plan: PricingTier | null;
  billingPeriod: BillingPeriod | null;
  tenantId: string | null;
  accountCreatedAt: string;
  deletedAt: string;
}

interface PendingHistoryWrite {
  id: string;
  record: DeletedAccountRecord;
  failedAt: string;
  attempts: number;
}

interface ControlPlaneUserResponse {
  id: string;
  email: string;
  name: string;
  authProvider?: AuthProvider;
  role: 'owner' | 'admin' | 'member';
  tenantId?: string;
  accessToken?: string;
  isNewUser?: boolean;
}

interface TenantSummaryResponse {
  tenantId: string | null;
  status: InstanceStatus;
  plan: PricingTier | null;
  region: string | null;
  billingPeriod: BillingPeriod | null;
  instanceUrl: string | null;
  usage: {
    runsThisMonth: number;
    maxRuns: number;
    scenariosUsed: number;
    maxScenarios: number;
  };
  provisionedAt?: string;
}

interface RegisterBody {
  name?: string;
  email?: string;
  password?: string;
  company?: string;
}

interface LoginBody {
  email?: string;
  password?: string;
}

interface OAuthSignInBody {
  provider?: AuthProvider;
  email?: string;
  name?: string | null;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number.parseInt(process.env['CONTROL_PLANE_PORT'] ?? '3002', 10) || 3002;
const STATE_DIR = process.env['CONTROL_PLANE_STATE_DIR']?.trim() || join(process.cwd(), 'data', 'control-plane');
const STATE_FILE = join(STATE_DIR, 'state.json');
const SESSION_TTL_HOURS = Math.max(1, Number.parseInt(process.env['CONTROL_PLANE_SESSION_TTL_HOURS'] ?? '168', 10) || 168);
const STATE_TMP_SUFFIX = `.tmp-${process.pid}`;
const DEPLOY_ENV = (process.env['ARIA_DEPLOY_ENV'] ?? process.env['ENVIRONMENT'] ?? '').trim().toLowerCase();
const LOCAL_SEED_ENABLED = (process.env['CONTROL_PLANE_ENABLE_LOCAL_SEED']?.trim().toLowerCase() === 'true') || DEPLOY_ENV === 'local';
const LOCAL_SEED_EMAIL = (process.env['CONTROL_PLANE_LOCAL_TEST_EMAIL']?.trim().toLowerCase() || 'local.tester@aria.local');
const LOCAL_SEED_PASSWORD = process.env['CONTROL_PLANE_LOCAL_TEST_PASSWORD']?.trim() || 'AriaLocal123!';
const LOCAL_SEED_NAME = process.env['CONTROL_PLANE_LOCAL_TEST_NAME']?.trim() || 'Local Test User';
const LOCAL_SEED_TENANT_ID = process.env['CONTROL_PLANE_LOCAL_TEST_TENANT_ID']?.trim() || 'local-demo-tenant';
const LOCAL_SEED_PLAN: PricingTier = 'individual';
const LOCAL_SEED_REGION = 'eu-west-2';
const LOCAL_SEED_BILLING_PERIOD: BillingPeriod = 'monthly';

// ── CodeBuild provisioning config ────────────────────────────────────────────
// When CODEBUILD_PROJECT_NAME is set, real AWS provisioning is triggered.
// When unset (local / dev without AWS), provision falls back to immediate-running.
const CODEBUILD_PROJECT_NAME = process.env['CODEBUILD_PROJECT_NAME']?.trim();
const CODEBUILD_AWS_REGION = process.env['CODEBUILD_AWS_REGION']?.trim()
  ?? process.env['AWS_REGION']?.trim()
  ?? 'eu-west-2';
const CONTROL_PLANE_CALLBACK_URL = process.env['CONTROL_PLANE_INTERNAL_URL']?.trim()
  ?? `http://localhost:${process.env['CONTROL_PLANE_PORT']?.trim() ?? '3002'}`;

// The Secrets Manager ARN for the internal secret.
// Injected by Terraform via SSM parameter lookup — never the raw secret value.
// CodeBuild uses this ARN to fetch the secret at runtime via AWS CLI.
const CONTROL_PLANE_SECRET_ARN = process.env['CONTROL_PLANE_SECRET_ARN']?.trim() ?? '';

// CONTROL_PLANE_INTERNAL_SECRET is still read for the heartbeat/callback receiver side.
// It is injected via ECS secrets (Secrets Manager valueFrom) — not plaintext.
const CONTROL_PLANE_INTERNAL_SECRET = process.env['CONTROL_PLANE_INTERNAL_SECRET']?.trim() ?? '';

// Tier → CodeBuild tfvar mapping
const TIER_PRICING_TRACK: Record<PricingTier, string> = {
  free: 'individual',
  individual: 'individual',
  enterprise_starter: 'enterprise',
  enterprise_pro: 'enterprise',
  enterprise_unlimited: 'enterprise',
};

const PLAN_LIMITS: Record<PricingTier, { maxRuns: number; maxScenarios: number; maxModels: number; maxUsers: number; suspendHours: number }> = {
  free:                 { maxRuns: 5,    maxScenarios: 10,  maxModels: 1,  maxUsers: 1,  suspendHours: 1  },
  individual:           { maxRuns: 200,  maxScenarios: 30,  maxModels: 2,  maxUsers: 1,  suspendHours: 3  },
  enterprise_starter:   { maxRuns: 900,  maxScenarios: 120, maxModels: 8,  maxUsers: 10, suspendHours: 3  },
  enterprise_pro:       { maxRuns: 3000, maxScenarios: 300, maxModels: 20, maxUsers: 50, suspendHours: 3  },
  enterprise_unlimited: { maxRuns: -1,   maxScenarios: -1,  maxModels: -1, maxUsers: -1, suspendHours: -1 },
};

const REGIONS = [
  { id: 'eu-west-2', name: '🇬🇧 UK (London)', flag: '🇬🇧', continent: 'Europe', availableForTiers: ['free', 'individual', 'enterprise_starter', 'enterprise_pro', 'enterprise_unlimited'] },
  { id: 'eu-central-1', name: '🇩🇪 EU (Frankfurt)', flag: '🇩🇪', continent: 'Europe', availableForTiers: ['enterprise_starter', 'enterprise_pro', 'enterprise_unlimited'] },
  { id: 'eu-west-1', name: '🇮🇪 EU (Ireland)', flag: '🇮🇪', continent: 'Europe', availableForTiers: ['enterprise_starter', 'enterprise_pro', 'enterprise_unlimited'] },
  { id: 'us-east-1', name: '🇺🇸 US East (N. Virginia)', flag: '🇺🇸', continent: 'North America', availableForTiers: ['free', 'individual', 'enterprise_starter', 'enterprise_pro', 'enterprise_unlimited'] },
  { id: 'us-west-2', name: '🇺🇸 US West (Oregon)', flag: '🇺🇸', continent: 'North America', availableForTiers: ['enterprise_starter', 'enterprise_pro', 'enterprise_unlimited'] },
  { id: 'ap-southeast-2', name: '🇦🇺 Asia Pacific (Sydney)', flag: '🇦🇺', continent: 'Asia Pacific', availableForTiers: ['enterprise_starter', 'enterprise_pro', 'enterprise_unlimited'] },
  { id: 'ap-southeast-1', name: '🇸🇬 Asia Pacific (Singapore)', flag: '🇸🇬', continent: 'Asia Pacific', availableForTiers: ['enterprise_starter', 'enterprise_pro', 'enterprise_unlimited'] },
  { id: 'ap-northeast-1', name: '🇯🇵 Asia Pacific (Tokyo)', flag: '🇯🇵', continent: 'Asia Pacific', availableForTiers: ['enterprise_starter', 'enterprise_pro', 'enterprise_unlimited'] },
];

const PACKAGES = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'Try ARIA with no commitment',
    price: { monthly: 0, annual: 0 },
    maxScenarios: 10,
    maxRuns: 5,
    maxModels: 1,
    suspendHours: 1,
    regions: 'limited',
  },
  {
    id: 'individual',
    name: 'Individual',
    tagline: 'For solo developers and researchers',
    price: { monthly: 49, annual: 39 },
    maxScenarios: 30,
    maxRuns: 200,
    maxModels: 2,
    suspendHours: 3,
    regions: 'limited',
  },
  {
    id: 'enterprise_starter',
    name: 'Enterprise Starter',
    tagline: 'For growing teams building safe AI',
    price: { monthly: 299, annual: 249 },
    maxScenarios: 120,
    maxRuns: 900,
    maxModels: 8,
    suspendHours: 3,
    regions: 'all',
  },
  {
    id: 'enterprise_pro',
    name: 'Enterprise Pro',
    tagline: 'Full-scale AI safety evaluation',
    price: { monthly: 799, annual: 699 },
    maxScenarios: 300,
    maxRuns: 3000,
    maxModels: 20,
    suspendHours: 3,
    regions: 'all',
  },
  {
    id: 'enterprise_unlimited',
    name: 'Enterprise Unlimited',
    tagline: 'Dedicated infrastructure for enterprises',
    price: { monthly: -1, annual: -1 },
    maxScenarios: -1,
    maxRuns: -1,
    maxModels: -1,
    suspendHours: -1,
    regions: 'all',
  },
];

const app = express();
app.disable('x-powered-by');

function parseJson<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function loadDefaultState(): ControlPlaneState {
  return { users: [], sessions: [], tenants: [], deletedAccounts: [], pendingHistoryWrites: [] };
}

let stateCache: ControlPlaneState | null = null;

function ensureLocalSeedState(state: ControlPlaneState): boolean {
  if (!LOCAL_SEED_ENABLED) return false;

  const now = nowIso();
  const instanceUrl = makeTenantInstanceUrl(LOCAL_SEED_TENANT_ID);
  const limits = PLAN_LIMITS[LOCAL_SEED_PLAN];

  let changed = false;
  let user = state.users.find((entry) => entry.email === LOCAL_SEED_EMAIL);

  if (!user) {
    user = {
      id: 'local-seed-user',
      email: LOCAL_SEED_EMAIL,
      name: LOCAL_SEED_NAME,
      authProvider: 'email',
      role: 'owner',
      passwordHash: passwordHash(LOCAL_SEED_PASSWORD),
      isNewUser: false,
      tenantId: LOCAL_SEED_TENANT_ID,
      createdAt: now,
      updatedAt: now,
    };
    state.users.push(user);
    changed = true;
  } else {
    if (user.id !== 'local-seed-user') {
      user.id = 'local-seed-user';
      changed = true;
    }
    if (user.name !== LOCAL_SEED_NAME) {
      user.name = LOCAL_SEED_NAME;
      changed = true;
    }
    if (user.role !== 'owner') {
      user.role = 'owner';
      changed = true;
    }
    if (resolveAuthProvider(user) !== 'email') {
      user.authProvider = 'email';
      changed = true;
    }
    if (!verifyPassword(user.passwordHash, LOCAL_SEED_PASSWORD)) {
      user.passwordHash = passwordHash(LOCAL_SEED_PASSWORD);
      changed = true;
    }
    if (user.isNewUser) {
      user.isNewUser = false;
      changed = true;
    }
    if (user.tenantId !== LOCAL_SEED_TENANT_ID) {
      user.tenantId = LOCAL_SEED_TENANT_ID;
      changed = true;
    }
    if (changed) {
      user.updatedAt = now;
    }
  }

  const existingTenant = state.tenants.find((entry) => entry.id === LOCAL_SEED_TENANT_ID);
  if (!existingTenant) {
    state.tenants.push({
      id: LOCAL_SEED_TENANT_ID,
      userId: user.id,
      plan: LOCAL_SEED_PLAN,
      region: LOCAL_SEED_REGION,
      billingPeriod: LOCAL_SEED_BILLING_PERIOD,
      status: 'running',
      instanceUrl,
      usage: {
        runsThisMonth: 0,
        maxRuns: limits.maxRuns,
        scenariosUsed: 0,
        maxScenarios: limits.maxScenarios,
      },
      createdAt: now,
      updatedAt: now,
    });
    changed = true;
  } else {
    if (existingTenant.userId !== user.id) {
      existingTenant.userId = user.id;
      changed = true;
    }
    if (existingTenant.plan !== LOCAL_SEED_PLAN) {
      existingTenant.plan = LOCAL_SEED_PLAN;
      changed = true;
    }
    if (existingTenant.region !== LOCAL_SEED_REGION) {
      existingTenant.region = LOCAL_SEED_REGION;
      changed = true;
    }
    if (existingTenant.billingPeriod !== LOCAL_SEED_BILLING_PERIOD) {
      existingTenant.billingPeriod = LOCAL_SEED_BILLING_PERIOD;
      changed = true;
    }
    if (existingTenant.status !== 'running') {
      existingTenant.status = 'running';
      changed = true;
    }
    if (existingTenant.instanceUrl !== instanceUrl) {
      existingTenant.instanceUrl = instanceUrl;
      changed = true;
    }
    if (
      existingTenant.usage.maxRuns !== limits.maxRuns
      || existingTenant.usage.maxScenarios !== limits.maxScenarios
    ) {
      existingTenant.usage.maxRuns = limits.maxRuns;
      existingTenant.usage.maxScenarios = limits.maxScenarios;
      changed = true;
    }
    if (changed) {
      existingTenant.updatedAt = now;
    }
  }

  return changed;
}

async function ensureStateDir(): Promise<void> {
  await mkdir(STATE_DIR, { recursive: true });
}

async function loadState(): Promise<ControlPlaneState> {
  if (stateCache) return stateCache;
  await ensureStateDir();
  if (!existsSync(STATE_FILE)) {
    stateCache = loadDefaultState();
    ensureLocalSeedState(stateCache);
    await saveState(stateCache);
    return stateCache;
  }
  const raw = await readFile(STATE_FILE, 'utf8');
  stateCache = parseJson<ControlPlaneState>(raw, loadDefaultState());
  stateCache.users ??= [];
  stateCache.sessions ??= [];
  stateCache.tenants ??= [];
  stateCache.deletedAccounts ??= [];
  stateCache.pendingHistoryWrites ??= [];
  if (ensureLocalSeedState(stateCache)) {
    await saveState(stateCache);
  }
  return stateCache;
}

async function saveState(nextState: ControlPlaneState): Promise<void> {
  await ensureStateDir();
  const tempFile = `${STATE_FILE}${STATE_TMP_SUFFIX}`;
  await writeFile(tempFile, JSON.stringify(nextState, null, 2), 'utf8');
  await rename(tempFile, STATE_FILE);
  stateCache = nextState;
}

async function mutateState(mutator: (state: ControlPlaneState) => void): Promise<ControlPlaneState> {
  const state = await loadState();
  mutator(state);
  await saveState(state);
  return state;
}

function passwordHash(password: string, salt?: string): string {
  const effectiveSalt = salt ?? randomBytes(16).toString('hex');
  const digest = scryptSync(password, effectiveSalt, 64).toString('hex');
  return `v1$${effectiveSalt}$${digest}`;
}

function verifyPassword(storedHash: string, candidatePassword: string): boolean {
  const [version, salt, expectedHash] = storedHash.split('$');
  if (version !== 'v1' || !salt || !expectedHash) return false;
  const computedHash = passwordHash(candidatePassword, salt).split('$')[2];
  if (!computedHash) return false;
  const expectedBuffer = Buffer.from(expectedHash, 'hex');
  const computedBuffer = Buffer.from(computedHash, 'hex');
  return expectedBuffer.length === computedBuffer.length && timingSafeEqual(expectedBuffer, computedBuffer);
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function issueToken(): { token: string; expiresAt: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, expiresAt: new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString() };
}

function getBearerToken(req: Request): string | null {
  const header = req.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

async function getAuthUser(req: Request): Promise<ControlPlaneUser | null> {
  const token = getBearerToken(req);
  if (!token) return null;
  const state = await loadState();
  const tokenHash = hashToken(token);
  const session = state.sessions.find((entry) => entry.tokenHash === tokenHash);
  if (!session) return null;
  if (Date.parse(session.expiresAt) <= Date.now()) return null;
  return state.users.find((user) => user.id === session.userId) ?? null;
}

function makeUserResponse(user: ControlPlaneUser, accessToken?: string): ControlPlaneUserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    authProvider: resolveAuthProvider(user),
    role: user.role,
    tenantId: user.tenantId,
    accessToken,
    isNewUser: user.isNewUser,
  };
}

function resolveAuthProvider(user: ControlPlaneUser): AuthProvider {
  if (user.authProvider === 'google' || user.authProvider === 'github' || user.authProvider === 'apple' || user.authProvider === 'email') {
    return user.authProvider;
  }
  return 'email';
}

function defaultNameFromEmail(email: string): string {
  const localPart = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
  if (!localPart) return 'ARIA User';
  return localPart
    .split(' ')
    .filter(Boolean)
    .map((token) => token[0]?.toUpperCase() + token.slice(1))
    .join(' ');
}

function makeTenantInstanceUrl(tenantId: string): string {
  const base = process.env['CONTROL_PLANE_INSTANCE_BASE_URL']?.trim() || 'https://ariaeval.io';
  const normalizedBase = base.replace(/\/$/, '');
  if (DEPLOY_ENV === 'local') {
    return normalizedBase;
  }
  return `${normalizedBase}/workspace/${tenantId}`;
}

function buildTenantSummary(user: ControlPlaneUser, state: ControlPlaneState): TenantSummaryResponse {
  const tenant = user.tenantId ? state.tenants.find((entry) => entry.id === user.tenantId) : undefined;
  if (!tenant) {
    return {
      tenantId: null,
      status: 'not_provisioned',
      plan: null,
      region: null,
      billingPeriod: null,
      instanceUrl: null,
      usage: { runsThisMonth: 0, maxRuns: 0, scenariosUsed: 0, maxScenarios: 0 },
    };
  }

  return {
    tenantId: tenant.id,
    status: tenant.status,
    plan: tenant.plan,
    region: tenant.region,
    billingPeriod: tenant.billingPeriod,
    instanceUrl: tenant.instanceUrl,
    usage: tenant.usage,
    provisionedAt: tenant.updatedAt,
  };
}

function validateOrigin(req: Request): boolean {
  const allowed = (process.env['CONTROL_PLANE_CORS_ORIGINS'] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const origin = req.get('origin')?.trim();
  if (!origin) return true;
  if (allowed.includes(origin)) return true;
  if (process.env['NODE_ENV'] !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  const referer = req.get('referer');
  if (!referer) return false;
  try {
    const refererOrigin = new URL(referer).origin;
    return allowed.includes(refererOrigin)
      || (process.env['NODE_ENV'] !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(refererOrigin));
  } catch {
    return false;
  }
}

function enforceOrigin(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }
  if (!validateOrigin(req)) {
    res.status(403).json({ error: 'Untrusted origin' });
    return;
  }
  next();
}

function validateInternalSecret(req: Request): boolean {
  const configured = process.env['CONTROL_PLANE_INTERNAL_SECRET']?.trim();
  if (!configured) return true; // not configured — allow in local/dev
  const provided = req.get('authorization')?.trim() ?? '';
  if (!provided.startsWith('Bearer ')) return false;
  const token = provided.slice('Bearer '.length).trim();
  // constant-time compare
  const a = Buffer.from(token, 'utf-8');
  const b = Buffer.from(configured, 'utf-8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const registerSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  password: z.string().min(8),
  company: z.string().trim().optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const oauthSignInSchema = z.object({
  provider: z.enum(['google', 'github', 'apple']),
  email: z.string().trim().email(),
  name: z.string().trim().optional().nullable(),
});

const provisionSchema = z.object({
  plan: z.enum(['free', 'individual', 'enterprise_starter', 'enterprise_pro', 'enterprise_unlimited']),
  region: z.string().trim().min(3),
  billingPeriod: z.enum(['monthly', 'annual']),
});

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) {
      cb(null, true);
      return;
    }
    cb(null, validateOrigin({ get: (key) => (key === 'origin' ? origin : undefined) } as Request));
  },
  credentials: false,
}));
app.use(express.json({ limit: '1mb' }));
app.use(enforceOrigin);

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    ts: nowIso(),
    uptime: Math.floor(process.uptime()),
    checks: { server: 'ok' },
  });
});

app.get('/ready', (_req, res) => {
  res.json({ ready: true });
});

app.get('/regions', (_req, res) => {
  res.json({ regions: REGIONS });
});

app.get('/packages', (_req, res) => {
  res.json({ packages: PACKAGES });
});

app.post('/auth/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid registration payload' });
    return;
  }

  const existingState = await loadState();
  const existingUser = existingState.users.find((user) => user.email === parsed.data.email.toLowerCase());
  if (existingUser) {
    const existingProvider = resolveAuthProvider(existingUser);
    if (existingProvider !== 'email') {
      res.status(409).json({
        error: 'Email already exists. Use the original sign-in method.',
        code: 'EMAIL_EXISTS_WITH_DIFFERENT_PROVIDER',
        provider: existingProvider,
      });
      return;
    }
    res.status(409).json({ error: 'Account already exists' });
    return;
  }

  const userId = randomBytes(12).toString('hex');
  const { token, expiresAt } = issueToken();
  const createdAt = nowIso();
  const user: ControlPlaneUser = {
    id: userId,
    email: parsed.data.email.toLowerCase(),
    name: parsed.data.name,
    company: parsed.data.company,
    authProvider: 'email',
    role: 'owner',
    passwordHash: passwordHash(parsed.data.password),
    isNewUser: true,
    createdAt,
    updatedAt: createdAt,
  };

  await mutateState((state) => {
    state.users.push(user);
    state.sessions.push({
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      createdAt,
    });
  });

  res.status(201).json({
    ok: true,
    userId,
    token,
    emailVerified: false,
    user: makeUserResponse(user, token),
  });
});

app.post('/auth/oauth', async (req, res) => {
  const parsed = oauthSignInSchema.safeParse(req.body as OAuthSignInBody);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid OAuth sign-in payload' });
    return;
  }

  const provider = parsed.data.provider;
  const normalizedEmail = parsed.data.email.toLowerCase();
  const normalizedName = parsed.data.name?.trim() || defaultNameFromEmail(normalizedEmail);
  const { token, expiresAt } = issueToken();
  const createdAt = nowIso();

  let resolvedUser: ControlPlaneUser | null = null;
  let wasNewUser = false;
  let conflictProvider: AuthProvider | null = null;

  await mutateState((state) => {
    const existingUser = state.users.find((entry) => entry.email === normalizedEmail);
    if (existingUser) {
      const existingProvider = resolveAuthProvider(existingUser);
      if (existingProvider !== provider) {
        conflictProvider = existingProvider;
        return;
      }
      wasNewUser = existingUser.isNewUser;
      existingUser.isNewUser = false;
      existingUser.authProvider = provider;
      existingUser.name = existingUser.name || normalizedName;
      existingUser.lastLoginAt = createdAt;
      existingUser.updatedAt = createdAt;
      resolvedUser = existingUser;
    } else {
      wasNewUser = true;
      const createdUser: ControlPlaneUser = {
        id: randomBytes(12).toString('hex'),
        email: normalizedEmail,
        name: normalizedName,
        authProvider: provider,
        role: 'owner',
        passwordHash: passwordHash(randomBytes(32).toString('base64url')),
        isNewUser: false,
        createdAt,
        updatedAt: createdAt,
        lastLoginAt: createdAt,
      };
      state.users.push(createdUser);
      resolvedUser = createdUser;
    }

    if (!resolvedUser) return;
    state.sessions.push({
      tokenHash: hashToken(token),
      userId: resolvedUser.id,
      expiresAt,
      createdAt,
    });
  });

  if (conflictProvider) {
    res.status(409).json({
      error: 'Email already exists. Use the original sign-in method.',
      code: 'EMAIL_EXISTS_WITH_DIFFERENT_PROVIDER',
      provider: conflictProvider,
    });
    return;
  }

  if (!resolvedUser) {
    res.status(500).json({ error: 'Unable to complete OAuth sign-in' });
    return;
  }

  res.json({
    ok: true,
    user: makeUserResponse(resolvedUser, token),
    token,
    isNewUser: wasNewUser,
  });
});

app.post('/auth/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid login payload' });
    return;
  }

  const state = await loadState();
  const user = state.users.find((entry) => entry.email === parsed.data.email.toLowerCase());
  if (user && resolveAuthProvider(user) !== 'email') {
    res.status(409).json({
      error: 'Email already exists. Use the original sign-in method.',
      code: 'EMAIL_EXISTS_WITH_DIFFERENT_PROVIDER',
      provider: resolveAuthProvider(user),
    });
    return;
  }
  if (!user || !verifyPassword(user.passwordHash, parsed.data.password)) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const { token, expiresAt } = issueToken();
  const wasNewUser = user.isNewUser;
  user.isNewUser = false;
  user.lastLoginAt = nowIso();
  user.updatedAt = nowIso();

  await mutateState((draft) => {
    draft.sessions.push({
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt,
      createdAt: nowIso(),
    });
  });

  res.json({
    ok: true,
    user: makeUserResponse(user, token),
    token,
    isNewUser: wasNewUser,
  });
});

app.post('/auth/logout', async (req, res) => {
  const token = getBearerToken(req);
  if (token) {
    await mutateState((state) => {
      state.sessions = state.sessions.filter((entry) => entry.tokenHash !== hashToken(token));
    });
  }
  res.json({ ok: true });
});

app.get('/tenant/me', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const state = await loadState();
  res.json(buildTenantSummary(user, state));
});

app.post('/internal/tenant-by-user', async (req, res) => {
  if (!validateInternalSecret(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const parsed = z.object({ userId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  const state = await loadState();
  const user = state.users.find((entry) => entry.id === parsed.data.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json(buildTenantSummary(user, state));
});

app.post('/tenant/provision', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const parsed = provisionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid tenant provisioning payload' }); return; }

  const region = REGIONS.find((entry) => entry.id === parsed.data.region);
  if (!region) { res.status(400).json({ error: 'Unknown region' }); return; }
  if (!region.availableForTiers.includes(parsed.data.plan)) {
    res.status(400).json({ error: 'Selected plan is not available in the requested region' }); return;
  }

  const limits = PLAN_LIMITS[parsed.data.plan];
  const tenantId = user.tenantId ?? randomBytes(12).toString('hex');
  const instanceUrl = makeTenantInstanceUrl(tenantId);
  const now = nowIso();

  // Write tenant record immediately as 'provisioning' so status polling works
  await mutateState((state) => {
    const existingTenant = state.tenants.find((entry) => entry.id === tenantId);
    const tenant: ControlPlaneTenant = {
      id: tenantId,
      userId: user.id,
      plan: parsed.data.plan,
      region: parsed.data.region,
      billingPeriod: parsed.data.billingPeriod,
      status: 'provisioning',
      instanceUrl,
      usage: {
        runsThisMonth: existingTenant?.usage.runsThisMonth ?? 0,
        maxRuns: limits.maxRuns,
        scenariosUsed: existingTenant?.usage.scenariosUsed ?? 0,
        maxScenarios: limits.maxScenarios,
      },
      createdAt: existingTenant?.createdAt ?? now,
      updatedAt: now,
    };
    if (existingTenant) {
      Object.assign(existingTenant, tenant);
    } else {
      state.tenants.push(tenant);
    }
    user.tenantId = tenantId;
    user.updatedAt = now;
  });

  // ── Real CodeBuild provisioning (when CODEBUILD_PROJECT_NAME is set) ──────
  if (CODEBUILD_PROJECT_NAME) {
    try {
      const codebuild = new CodeBuildClient({ region: CODEBUILD_AWS_REGION });
      await codebuild.send(new StartBuildCommand({
        projectName: CODEBUILD_PROJECT_NAME,
        environmentVariablesOverride: [
          { name: 'USER_ID',       value: tenantId,                             type: 'PLAINTEXT' },
          { name: 'PLAN_TYPE',     value: parsed.data.plan,                     type: 'PLAINTEXT' },
          { name: 'PRICING_TRACK', value: TIER_PRICING_TRACK[parsed.data.plan], type: 'PLAINTEXT' },
          { name: 'TENANT_REGION', value: parsed.data.region,                   type: 'PLAINTEXT' },
          { name: 'ENVIRONMENT',   value: process.env['ARIA_DEPLOY_ENV'] ?? 'prod', type: 'PLAINTEXT' },
          { name: 'ADMIN_EMAIL',   value: user.email,                           type: 'PLAINTEXT' },
          // Pass secret ARN (not the secret value) — buildspec fetches it at runtime via AWS CLI
          ...(CONTROL_PLANE_SECRET_ARN
            ? [{ name: 'CONTROL_PLANE_SECRET_ARN', value: CONTROL_PLANE_SECRET_ARN, type: 'PLAINTEXT' as const }]
            : []
          ),
        ],
      }));
      console.info(`[provision] CodeBuild build started — tenant: ${tenantId}, plan: ${parsed.data.plan}, region: ${parsed.data.region}`);
    } catch (err) {
      // Mark failed and surface error to caller
      await mutateState((s) => {
        const t = s.tenants.find((x) => x.id === tenantId);
        if (t) { t.status = 'error'; t.updatedAt = nowIso(); }
      });
      console.error(`[provision] CodeBuild start failed: ${(err as Error).message}`);
      res.status(502).json({ error: 'Failed to start provisioning job', detail: (err as Error).message });
      return;
    }
  } else {
    // ── Local / dev fallback — no AWS, mark running immediately ───────────
    console.info(`[provision] Local mode — skipping CodeBuild, marking tenant ${tenantId} as running`);
    await mutateState((s) => {
      const t = s.tenants.find((x) => x.id === tenantId);
      if (t) { t.status = 'running'; t.updatedAt = nowIso(); }
    });
  }

  res.status(201).json({
    ok: true,
    tenantId,
    status: CODEBUILD_PROJECT_NAME ? 'provisioning' : 'running',
    instanceUrl,
    ssoUrl: null,
  });
});

// GET /tenant/provision/status — lightweight polling endpoint for provisioning progress
app.get('/tenant/provision/status', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const state = await loadState();
  const tenant = state.tenants.find((t) => t.id === user.tenantId);
  if (!tenant) { res.status(404).json({ error: 'No tenant found' }); return; }

  // Map internal status to simplified provisioning phases for the UI
  const phase: string = (() => {
    switch (tenant.status) {
      case 'provisioning': return 'provisioning';
      case 'running':      return 'complete';
      case 'error':        return 'failed';
      default:             return tenant.status;
    }
  })();

  res.json({
    tenantId: tenant.id,
    status: tenant.status,
    phase,
    instanceUrl: tenant.status === 'running' ? tenant.instanceUrl : null,
    updatedAt: tenant.updatedAt,
  });
});

app.post('/tenant/suspend', async (req, res) => {
  const user = await getAuthUser(req)
  if (!user) { res.status(401).json({ error: 'Unauthorized' }); return }

  const state = await loadState()
  const tenant = state.tenants.find((t) => t.id === user.tenantId)
  if (!tenant) { res.status(404).json({ error: 'No tenant found' }); return }
  if (tenant.status === 'suspended') { res.json({ ok: true, status: 'suspended' }); return }
  if (tenant.status !== 'running') {
    res.status(409).json({ error: `Cannot suspend instance with status: ${tenant.status}` })
    return
  }

  await mutateState((s) => {
    const t = s.tenants.find((x) => x.id === user.tenantId)
    if (t) { t.status = 'suspended'; t.updatedAt = nowIso() }
  })

  res.json({ ok: true, status: 'suspended' })
})

app.post('/tenant/resume', async (req, res) => {
  const user = await getAuthUser(req)
  if (!user) { res.status(401).json({ error: 'Unauthorized' }); return }

  const state = await loadState()
  const tenant = state.tenants.find((t) => t.id === user.tenantId)
  if (!tenant) { res.status(404).json({ error: 'No tenant found' }); return }
  if (tenant.status === 'running') { res.json({ ok: true, status: 'running' }); return }
  if (tenant.status !== 'suspended') {
    res.status(409).json({ error: `Cannot resume instance with status: ${tenant.status}` })
    return
  }

  await mutateState((s) => {
    const t = s.tenants.find((x) => x.id === user.tenantId)
    if (t) { t.status = 'running'; t.updatedAt = nowIso() }
  })

  res.json({ ok: true, status: 'running', instanceUrl: tenant.instanceUrl })
})

app.get('/tenant/users', async (req, res) => {
  const user = await getAuthUser(req)
  if (!user) { res.status(401).json({ error: 'Unauthorized' }); return }

  const state = await loadState()
  const tenantUsers = state.users.filter((u) => u.tenantId === user.tenantId)
  res.json(tenantUsers.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: 'active',
    invitedAt: u.createdAt,
  })))
})

app.post('/tenant/users/invite', async (req, res) => {
  const user = await getAuthUser(req)
  if (!user) { res.status(401).json({ error: 'Unauthorized' }); return }
  if (user.role !== 'owner' && user.role !== 'admin') {
    res.status(403).json({ error: 'Only owners and admins can invite users' })
    return
  }

  const parsed = z.object({
    email: z.string().email(),
    role: z.enum(['admin', 'member']).default('member'),
  }).safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Invalid payload' }); return }

  const state = await loadState()
  const existing = state.users.find((u) => u.email === parsed.data.email && u.tenantId === user.tenantId)
  if (existing) { res.status(409).json({ error: 'User already in workspace' }); return }

  const newUserId = randomBytes(12).toString('hex')
  const now = nowIso()
  await mutateState((s) => {
    s.users.push({
      id: newUserId,
      email: parsed.data.email,
      name: null as unknown as string,
      role: parsed.data.role,
      authProvider: 'email',
      passwordHash: passwordHash(randomBytes(32).toString('base64url')),
      isNewUser: true,
      tenantId: user.tenantId ?? '',
      createdAt: now,
      updatedAt: now,
    })
  })

  res.status(201).json({ ok: true, userId: newUserId, email: parsed.data.email, role: parsed.data.role })
})

app.delete('/tenant/users/:userId', async (req, res) => {
  const user = await getAuthUser(req)
  if (!user) { res.status(401).json({ error: 'Unauthorized' }); return }
  if (user.role !== 'owner' && user.role !== 'admin') {
    res.status(403).json({ error: 'Only owners and admins can remove users' })
    return
  }

  const { userId } = req.params
  if (userId === user.id) { res.status(400).json({ error: 'Cannot remove yourself' }); return }

  const state = await loadState()
  const target = state.users.find((u) => u.id === userId && u.tenantId === user.tenantId)
  if (!target) { res.status(404).json({ error: 'User not found in workspace' }); return }
  if (target.role === 'owner') { res.status(400).json({ error: 'Cannot remove workspace owner' }); return }

  await mutateState((s) => {
    const idx = s.users.findIndex((u) => u.id === userId)
    if (idx !== -1) s.users.splice(idx, 1)
  })

  res.json({ ok: true })
})

app.post('/instance/sso-token', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const state = await loadState();
  const tenant = user.tenantId ? state.tenants.find((entry) => entry.id === user.tenantId) : undefined;
  if (!tenant) {
    res.status(409).json({ error: 'Tenant not provisioned' });
    return;
  }

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await mutateState((draft) => {
    const current = draft.tenants.find((entry) => entry.id === tenant.id);
    if (current) {
      current.ssoTokenHash = hashToken(token);
      current.ssoTokenExpiresAt = expiresAt;
      current.updatedAt = nowIso();
    }
  });

  const instanceUrl = tenant.instanceUrl;
  res.json({
    ok: true,
    token,
    instanceUrl,
    ssoUrl: `${instanceUrl}/auth/sso?token=${token}`,
    expiresAt,
  });
});

// Internal server-to-server endpoint — called by the evaluator to exchange a
// one-time SSO token for user identity. Requires CONTROL_PLANE_INTERNAL_SECRET.
app.post('/auth/verify-sso-token', async (req, res) => {
  if (!validateInternalSecret(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const rawToken = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!rawToken) {
    res.status(400).json({ error: 'token is required' });
    return;
  }

  const tokenHash = hashToken(rawToken);

  // Atomic verify-and-clear: find, validate, and consume the token in a single
  // mutateState call to prevent TOCTOU races where two concurrent requests both
  // pass the check before either writes the clear.
  let resolvedUser: ControlPlaneUser | null = null;

  await mutateState((draft) => {
    const tenant = draft.tenants.find((entry) => entry.ssoTokenHash === tokenHash);
    if (!tenant) return; // not found — resolvedUser stays null

    if (!tenant.ssoTokenExpiresAt || Date.parse(tenant.ssoTokenExpiresAt) <= Date.now()) {
      // Expired — clear it and leave resolvedUser null
      tenant.ssoTokenHash = undefined;
      tenant.ssoTokenExpiresAt = undefined;
      tenant.updatedAt = nowIso();
      return;
    }

    // Valid — consume immediately (one-time)
    tenant.ssoTokenHash = undefined;
    tenant.ssoTokenExpiresAt = undefined;
    tenant.updatedAt = nowIso();

    resolvedUser = draft.users.find((user) => user.id === tenant.userId) ?? null;
  });

  if (!resolvedUser) {
    res.status(401).json({ error: 'Invalid or expired SSO token' });
    return;
  }

  const user = resolvedUser as ControlPlaneUser;
  res.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name ?? null,
      role: user.role,
      tenantId: user.tenantId ?? null,
    },
  });
});

app.get('/auth/session', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) {
    res.status(401).json({ authenticated: false });
    return;
  }
  res.json({ authenticated: true, user: makeUserResponse(user) });
});

// ── Billing endpoints ────────────────────────────────────────────────────────

const PLAN_PRICES: Record<PricingTier, { monthly: number; annual: number }> = {
  free: { monthly: 0, annual: 0 },
  individual: { monthly: 49, annual: 39 },
  enterprise_starter: { monthly: 299, annual: 249 },
  enterprise_pro: { monthly: 799, annual: 699 },
  enterprise_unlimited: { monthly: -1, annual: -1 },
};

function mockInvoicesForTenant(tenant: ControlPlaneTenant): BillingInvoice[] {
  if (tenant.invoices && tenant.invoices.length > 0) return tenant.invoices;
  const planPrice = PLAN_PRICES[tenant.plan];
  const monthlyAmount = tenant.billingPeriod === 'annual' ? planPrice.annual : planPrice.monthly;
  if (monthlyAmount <= 0) return [];

  const start = new Date(tenant.createdAt);
  const invoices: BillingInvoice[] = [];
  const now = new Date();

  for (let i = 0; i < 6; i++) {
    const invoiceDate = new Date(start);
    invoiceDate.setMonth(invoiceDate.getMonth() + i);
    if (invoiceDate > now) break;

    const plan = PACKAGES.find((p) => p.id === tenant.plan);
    invoices.push({
      id: `inv_${tenant.id.slice(0, 8)}_${i}`,
      date: invoiceDate.toISOString(),
      description: `${plan?.name ?? tenant.plan} — ${tenant.billingPeriod === 'annual' ? 'Annual (monthly)' : 'Monthly'} subscription`,
      amount: monthlyAmount * 100,
      currency: 'usd',
      status: 'paid',
    });
  }
  return invoices;
}

function nextBillingDate(tenant: ControlPlaneTenant): string {
  const start = new Date(tenant.billingStartedAt ?? tenant.createdAt);
  const now = new Date();
  const next = new Date(start);
  while (next <= now) {
    if (tenant.billingPeriod === 'annual') {
      next.setFullYear(next.getFullYear() + 1);
    } else {
      next.setMonth(next.getMonth() + 1);
    }
  }
  return next.toISOString();
}

app.get('/billing/summary', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const state = await loadState();
  const tenant = user.tenantId ? state.tenants.find((t) => t.id === user.tenantId) : undefined;

  if (!tenant) {
    res.json({
      plan: null,
      billingPeriod: null,
      nextBillingDate: null,
      paymentMethod: null,
      planPrice: null,
    });
    return;
  }

  const planPrice = PLAN_PRICES[tenant.plan];
  const priceAmount = tenant.billingPeriod === 'annual' ? planPrice.annual : planPrice.monthly;

  res.json({
    plan: tenant.plan,
    billingPeriod: tenant.billingPeriod,
    nextBillingDate: nextBillingDate(tenant),
    paymentMethod: tenant.paymentMethod ?? null,
    planPrice: priceAmount,
  });
});

app.get('/billing/history', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const state = await loadState();
  const tenant = user.tenantId ? state.tenants.find((t) => t.id === user.tenantId) : undefined;

  res.json({
    invoices: tenant ? mockInvoicesForTenant(tenant) : [],
  });
});

const changePlanSchema = z.object({
  plan: z.enum(['free', 'individual', 'enterprise_starter', 'enterprise_pro', 'enterprise_unlimited']),
  billingPeriod: z.enum(['monthly', 'annual']).optional(),
});

app.post('/billing/change-plan', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const parsed = changePlanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload' });
    return;
  }

  const state = await loadState();
  const tenant = user.tenantId ? state.tenants.find((t) => t.id === user.tenantId) : undefined;
  if (!tenant) {
    res.status(409).json({ error: 'No provisioned workspace' });
    return;
  }

  const newPlan = parsed.data.plan;
  const newBillingPeriod = parsed.data.billingPeriod ?? tenant.billingPeriod;
  const limits = PLAN_LIMITS[newPlan];

  await mutateState((draft) => {
    const t = draft.tenants.find((entry) => entry.id === tenant.id);
    if (!t) return;
    t.plan = newPlan;
    t.billingPeriod = newBillingPeriod;
    t.usage.maxRuns = limits.maxRuns;
    t.usage.maxScenarios = limits.maxScenarios;
    t.updatedAt = nowIso();
  });

  res.json({ ok: true, plan: newPlan, billingPeriod: newBillingPeriod });
});

const updatePaymentSchema = z.object({
  last4: z.string().length(4),
  brand: z.string().min(1),
  expMonth: z.number().int().min(1).max(12),
  expYear: z.number().int().min(new Date().getFullYear()),
});

app.post('/billing/update-payment-method', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const parsed = updatePaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payment method payload' });
    return;
  }

  const state = await loadState();
  const tenant = user.tenantId ? state.tenants.find((t) => t.id === user.tenantId) : undefined;
  if (!tenant) {
    res.status(409).json({ error: 'No provisioned workspace' });
    return;
  }

  await mutateState((draft) => {
    const t = draft.tenants.find((entry) => entry.id === tenant.id);
    if (!t) return;
    t.paymentMethod = {
      last4: parsed.data.last4,
      brand: parsed.data.brand,
      expMonth: parsed.data.expMonth,
      expYear: parsed.data.expYear,
    };
    t.updatedAt = nowIso();
  });

  res.json({ ok: true });
});

const closeAccountSchema = z.object({
  confirmEmail: z.string().trim().email(),
});

function buildDeletedAccountRecord(
  user: ControlPlaneUser,
  tenant: ControlPlaneTenant | undefined,
): DeletedAccountRecord {
  return {
    id: randomBytes(12).toString('hex'),
    userId: user.id,
    email: user.email,
    name: user.name,
    authProvider: user.authProvider ?? 'email',
    plan: tenant?.plan ?? null,
    billingPeriod: tenant?.billingPeriod ?? null,
    tenantId: tenant?.id ?? null,
    accountCreatedAt: user.createdAt,
    deletedAt: nowIso(),
  };
}

async function processPendingHistoryWrites(): Promise<void> {
  const state = await loadState();
  if (!state.pendingHistoryWrites.length) return;

  for (const pending of [...state.pendingHistoryWrites]) {
    try {
      await mutateState((draft) => {
        draft.deletedAccounts.push(pending.record);
        draft.pendingHistoryWrites = draft.pendingHistoryWrites.filter((p) => p.id !== pending.id);
      });
      console.log(`[history] Retry succeeded for pending history write ${pending.id}`);
    } catch (err: unknown) {
      await mutateState((draft) => {
        const item = draft.pendingHistoryWrites.find((p) => p.id === pending.id);
        if (item) item.attempts += 1;
      });
      console.error(
        `[history] Retry attempt ${pending.attempts + 1} failed for ${pending.id}:`,
        (err as Error).message,
      );
    }
  }
}

app.delete('/account', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const parsed = closeAccountSchema.safeParse(req.body);
  if (!parsed.success || parsed.data.confirmEmail.toLowerCase() !== user.email) {
    res.status(400).json({ error: 'Email confirmation does not match your account email' });
    return;
  }

  const state = await loadState();
  const tenant = state.tenants.find((t) => t.userId === user.id);

  let historyRecord: DeletedAccountRecord | null = null;
  let historyBuildError: string | null = null;

  try {
    historyRecord = buildDeletedAccountRecord(user, tenant);
  } catch (err: unknown) {
    historyBuildError = (err as Error).message;
    console.error(`[history] Failed to build deleted account record for ${user.id}:`, historyBuildError);
  }

  // Delete from main tables. If history record was built successfully, write it
  // atomically in the same mutation. If not, queue a pending write.
  await mutateState((draft) => {
    if (historyRecord) {
      draft.deletedAccounts.push(historyRecord);
    } else {
      // History build failed — queue for async retry so deletion still proceeds
      const pending: PendingHistoryWrite = {
        id: randomBytes(8).toString('hex'),
        record: {
          id: randomBytes(12).toString('hex'),
          userId: user.id,
          email: user.email,
          name: user.name,
          authProvider: user.authProvider ?? 'email',
          plan: tenant?.plan ?? null,
          billingPeriod: tenant?.billingPeriod ?? null,
          tenantId: tenant?.id ?? null,
          accountCreatedAt: user.createdAt,
          deletedAt: nowIso(),
        },
        failedAt: nowIso(),
        attempts: 1,
      };
      draft.pendingHistoryWrites.push(pending);
      console.error(`[history] Queued pending history write ${pending.id} for async retry`);
    }

    draft.tenants = draft.tenants.filter((t) => t.userId !== user.id);
    draft.sessions = draft.sessions.filter((s) => s.userId !== user.id);
    draft.users = draft.users.filter((u) => u.id !== user.id);
  });

  res.json({ ok: true, message: 'Account and workspace permanently deleted' });
});

// ── Auth: email confirm, forgot/reset password ───────────────────────────────

app.post('/auth/confirm', async (req, res) => {
  const parsed = z.object({
    email: z.string().trim().email(),
    code: z.string().min(1),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'email and code are required' }); return; }

  const state = await loadState();
  const user = state.users.find((u) => u.email.toLowerCase() === parsed.data.email.toLowerCase());
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  // In local/dev mode any non-empty code is accepted; production would validate a real OTP.
  await mutateState((s) => {
    const u = s.users.find((x) => x.id === user.id);
    if (u) { u.emailVerified = true; u.updatedAt = nowIso(); }
  });

  res.json({ ok: true });
});

app.post('/auth/forgot-password', async (req, res) => {
  const parsed = z.object({ email: z.string().trim().email() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'email is required' }); return; }

  const state = await loadState();
  const user = state.users.find((u) => u.email.toLowerCase() === parsed.data.email.toLowerCase());

  // Return 200 regardless to avoid email enumeration.
  if (!user || user.authProvider !== 'email') { res.json({ ok: true }); return; }

  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

  await mutateState((s) => {
    const u = s.users.find((x) => x.id === user.id);
    if (u) {
      u.passwordResetToken = tokenHash;
      u.passwordResetExpiresAt = expiresAt;
      u.updatedAt = nowIso();
    }
  });

  // In production this token is emailed; in local/dev we return it directly for testing.
  const isLocalDev = DEPLOY_ENV === 'local' || DEPLOY_ENV === '' || DEPLOY_ENV === 'development';
  res.json({ ok: true, ...(isLocalDev && { resetToken: rawToken, expiresAt }) });
});

app.post('/auth/reset-password', async (req, res) => {
  const parsed = z.object({
    email: z.string().trim().email(),
    token: z.string().min(1),
    newPassword: z.string().min(8),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'email, token, and newPassword are required' }); return; }

  const state = await loadState();
  const user = state.users.find((u) => u.email.toLowerCase() === parsed.data.email.toLowerCase());
  if (!user) { res.status(400).json({ error: 'Invalid or expired reset token' }); return; }
  if (!user.passwordResetToken || !user.passwordResetExpiresAt) {
    res.status(400).json({ error: 'Invalid or expired reset token' }); return;
  }
  if (new Date(user.passwordResetExpiresAt) < new Date()) {
    res.status(400).json({ error: 'Reset token has expired' }); return;
  }

  const providedHash = createHash('sha256').update(parsed.data.token).digest('hex');
  const expectedBuf = Buffer.from(user.passwordResetToken, 'hex');
  const providedBuf = Buffer.from(providedHash, 'hex');
  const valid = expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
  if (!valid) { res.status(400).json({ error: 'Invalid or expired reset token' }); return; }

  const newHash = passwordHash(parsed.data.newPassword);
  await mutateState((s) => {
    const u = s.users.find((x) => x.id === user.id);
    if (u) {
      u.passwordHash = newHash;
      u.passwordResetToken = undefined;
      u.passwordResetExpiresAt = undefined;
      u.updatedAt = nowIso();
    }
  });

  res.json({ ok: true });
});

// ── Tenant usage ──────────────────────────────────────────────────────────────

app.get('/tenant/usage', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const state = await loadState();
  const tenant = state.tenants.find((t) => t.id === user.tenantId);
  if (!tenant) { res.status(404).json({ error: 'No tenant found' }); return; }

  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  res.json({
    period,
    runsThisMonth: tenant.usage.runsThisMonth,
    maxRuns: tenant.usage.maxRuns,
    scenariosUsed: tenant.usage.scenariosUsed,
    maxScenarios: tenant.usage.maxScenarios,
    lastHeartbeatAt: tenant.lastHeartbeatAt ?? null,
  });
});

// ── Instance heartbeat (called by evaluator instances) ────────────────────────

app.post('/instance/heartbeat', async (req, res) => {
  if (!validateInternalSecret(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const parsed = z.object({
    tenantId: z.string().min(1),
    metrics: z.object({
      runsThisMonth: z.number().int().nonnegative().optional(),
      scenariosUsed: z.number().int().nonnegative().optional(),
      activeUsers: z.number().int().nonnegative().optional(),
    }).optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'tenantId is required' }); return; }

  const { tenantId, metrics } = parsed.data;
  const state = await loadState();
  const tenant = state.tenants.find((t) => t.id === tenantId);
  if (!tenant) { res.status(404).json({ error: 'Tenant not found' }); return; }

  await mutateState((s) => {
    const t = s.tenants.find((x) => x.id === tenantId);
    if (!t) return;
    t.lastHeartbeatAt = nowIso();
    // If instance was starting, mark it running now that we received a heartbeat
    if (t.status === 'provisioning' || (t.status as string) === 'starting') t.status = 'running';
    if (metrics) {
      if (metrics.runsThisMonth !== undefined) t.usage.runsThisMonth = metrics.runsThisMonth;
      if (metrics.scenariosUsed !== undefined) t.usage.scenariosUsed = metrics.scenariosUsed;
    }
    t.updatedAt = nowIso();
  });

  res.json({ ok: true });
});

// ── Internal provisioner callbacks ───────────────────────────────────────────

app.post('/internal/provision/complete', async (req, res) => {
  if (!validateInternalSecret(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const parsed = z.object({
    tenantId: z.string().min(1),
    instanceUrl: z.string().url(),
    outputs: z.record(z.unknown()).optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'tenantId and instanceUrl are required' }); return; }

  const { tenantId, instanceUrl } = parsed.data;
  const state = await loadState();
  const tenant = state.tenants.find((t) => t.id === tenantId);
  if (!tenant) { res.status(404).json({ error: 'Tenant not found' }); return; }

  await mutateState((s) => {
    const t = s.tenants.find((x) => x.id === tenantId);
    if (t) {
      t.status = 'running';
      t.instanceUrl = instanceUrl;
      t.updatedAt = nowIso();
    }
  });

  console.info(`[provision] Tenant ${tenantId} provisioned successfully: ${instanceUrl}`);
  res.json({ ok: true });
});

app.post('/internal/provision/failed', async (req, res) => {
  if (!validateInternalSecret(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const parsed = z.object({
    tenantId: z.string().min(1),
    errorMessage: z.string().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'tenantId is required' }); return; }

  const { tenantId, errorMessage } = parsed.data;
  const state = await loadState();
  const tenant = state.tenants.find((t) => t.id === tenantId);
  if (!tenant) { res.status(404).json({ error: 'Tenant not found' }); return; }

  await mutateState((s) => {
    const t = s.tenants.find((x) => x.id === tenantId);
    if (t) { t.status = 'error'; t.updatedAt = nowIso(); }
  });

  console.error(`[provision] Tenant ${tenantId} provisioning failed: ${errorMessage ?? 'unknown error'}`);
  res.json({ ok: true });
});

// ── Background: retry failed history writes every 5 minutes ─────────────────
if (process.env['NODE_ENV'] !== 'test') {
  setInterval(() => {
    processPendingHistoryWrites().catch((err: unknown) => {
      console.error('[history] processPendingHistoryWrites error:', (err as Error).message);
    });
  }, 5 * 60 * 1000);
}

// ── End billing endpoints ────────────────────────────────────────────────────

if (process.env['NODE_ENV'] !== 'test') {
  void (async () => {
    await loadState();
    const server = createServer(app);
    server.listen(PORT, () => {
      console.log(`\n🚀 ARIA Control Plane running at http://localhost:${PORT}`);
      console.log(`   Health: http://localhost:${PORT}/health`);
      console.log(`   API:    http://localhost:${PORT}\n`);
    });
  })().catch((error: unknown) => {
    console.error(`Failed to start control plane: ${(error as Error).message}`);
    process.exit(1);
  });
}
