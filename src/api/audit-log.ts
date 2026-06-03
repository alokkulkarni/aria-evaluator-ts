import type { Request } from 'express';

import { prisma } from '../db/client.js';

interface RequestWithAuth extends Request {
  auth?: {
    userId: string;
  };
}

interface AuditMetadata {
  [key: string]: unknown;
}

const SECRET_KEY_PATTERN = /(secret|token|key|password|bearer|auth)/i;

function redactMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactMetadata(item));
  if (!value || typeof value !== 'object') return value;

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, innerValue] of Object.entries(input)) {
    output[key] = SECRET_KEY_PATTERN.test(key)
      ? '[redacted]'
      : redactMetadata(innerValue);
  }
  return output;
}

function getRequestIp(req: Request): string | null {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (Array.isArray(forwardedFor)) return forwardedFor[0] ?? null;
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0]?.trim() ?? null;
  }
  return req.socket.remoteAddress ?? null;
}

export async function recordAuditEvent(
  req: Request,
  action: string,
  target?: string,
  metadata?: AuditMetadata,
): Promise<void> {
  const auth = (req as RequestWithAuth).auth;
  const safeMetadata = metadata ? redactMetadata(metadata) : null;

  await prisma.auditLog.create({
    data: {
      userId: auth?.userId ?? null,
      action,
      target: target ?? null,
      metadataJson: safeMetadata ? JSON.stringify(safeMetadata) : null,
      ipAddress: getRequestIp(req),
      userAgent: req.get('user-agent') ?? null,
    },
  });
}

export async function recordAuditEventSafe(
  req: Request,
  action: string,
  target?: string,
  metadata?: AuditMetadata,
): Promise<void> {
  try {
    await recordAuditEvent(req, action, target, metadata);
  } catch (err) {
    console.error(`Failed to write audit event (${action}): ${(err as Error).message}`);
  }
}
