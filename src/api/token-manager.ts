// src/api/token-manager.ts
// JWT token lifecycle management

import jwt from 'jsonwebtoken';
import redis from '../lib/cache.js';

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  tenantId?: string;
}

/**
 * Generate JWT access token (15 minutes)
 */
export function generateAccessToken(payload: TokenPayload): string {
  const secret = process.env.ACCESS_TOKEN_SECRET;
  if (!secret) throw new Error('ACCESS_TOKEN_SECRET not configured');

  return jwt.sign(payload, secret, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
    algorithm: 'HS256',
  });
}

/**
 * Generate JWT refresh token (7 days) and store in Redis
 */
export async function generateRefreshToken(payload: TokenPayload): Promise<string> {
  const secret = process.env.REFRESH_TOKEN_SECRET;
  if (!secret) throw new Error('REFRESH_TOKEN_SECRET not configured');

  const token = jwt.sign(payload, secret, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
    algorithm: 'HS256',
  });

  // Store refresh token in Redis for revocation
  await redis.setex(`refresh-token:${payload.userId}:${token}`, 7 * 24 * 60 * 60, '1');

  return token;
}

/**
 * Generate token pair (access + refresh)
 */
export async function generateTokenPair(payload: TokenPayload): Promise<TokenPair> {
  const accessToken = generateAccessToken(payload);
  const refreshToken = await generateRefreshToken(payload);

  return {
    accessToken,
    refreshToken,
    expiresIn: 15 * 60, // 15 minutes in seconds
  };
}

/**
 * Verify access token
 */
export function verifyAccessToken(token: string): TokenPayload {
  const secret = process.env.ACCESS_TOKEN_SECRET;
  if (!secret) throw new Error('ACCESS_TOKEN_SECRET not configured');

  try {
    return jwt.verify(token, secret, { algorithms: ['HS256'] }) as TokenPayload;
  } catch (error) {
    throw new Error(`Invalid access token: ${(error as Error).message}`);
  }
}

/**
 * Verify refresh token
 */
export function verifyRefreshToken(token: string): TokenPayload {
  const secret = process.env.REFRESH_TOKEN_SECRET;
  if (!secret) throw new Error('REFRESH_TOKEN_SECRET not configured');

  try {
    return jwt.verify(token, secret, { algorithms: ['HS256'] }) as TokenPayload;
  } catch (error) {
    throw new Error(`Invalid refresh token: ${(error as Error).message}`);
  }
}

/**
 * Refresh tokens (token rotation)
 * Issues new pair, invalidates old refresh token
 */
export async function refreshTokens(refreshToken: string): Promise<TokenPair> {
  try {
    const payload = verifyRefreshToken(refreshToken);

    // Check if token has been revoked
    const isRevoked = await redis.exists(`refresh-token:${payload.userId}:${refreshToken}`);
    if (!isRevoked) {
      throw new Error('Refresh token has been revoked');
    }

    // Revoke old token
    await redis.del(`refresh-token:${payload.userId}:${refreshToken}`);

    // Issue new pair
    return generateTokenPair(payload);
  } catch (error) {
    throw new Error(`Token refresh failed: ${(error as Error).message}`);
  }
}

/**
 * Revoke token (add to blacklist)
 */
export async function revokeToken(token: string): Promise<void> {
  const decoded = verifyAccessToken(token);
  await redis.setex(`token:revoked:${decoded.userId}:${token}`, 15 * 60, '1');
}

/**
 * Check if token is revoked
 */
export async function isTokenRevoked(token: string, userId: string): Promise<boolean> {
  const exists = await redis.exists(`token:revoked:${userId}:${token}`);
  return exists === 1;
}

/**
 * Logout user (revoke all tokens)
 */
export async function logoutUser(userId: string): Promise<void> {
  // Invalidate all refresh tokens for this user
  const pattern = `refresh-token:${userId}:*`;
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
