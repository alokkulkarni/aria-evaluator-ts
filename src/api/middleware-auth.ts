// src/api/middleware-auth.ts
// Express authentication middleware

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, isTokenRevoked, TokenPayload } from './token-manager.js';
import { getSession } from '../lib/cache.js';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      sessionId?: string;
    }
  }
}

/**
 * Required authentication middleware
 * Validates Bearer token and attaches user to request
 */
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);

    // Check if token is revoked
    const revoked = await isTokenRevoked(token, payload.userId);
    if (revoked) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }

    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: (error as Error).message });
  }
};

/**
 * Optional authentication middleware
 * Attaches user if valid token provided, otherwise continues
 */
export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const payload = verifyAccessToken(token);

      const revoked = await isTokenRevoked(token, payload.userId);
      if (!revoked) {
        req.user = payload;
      }
    }
  } catch (error) {
    // Silently fail optional auth
  }

  next();
};

/**
 * Session-based authentication middleware
 * Validates session from Redis
 */
export const requireSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.cookies?.sessionId || req.headers['x-session-id'];
    if (!sessionId) {
      return res.status(401).json({ error: 'Missing session' });
    }

    const session = await getSession(sessionId);
    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    req.sessionId = sessionId as string;
    next();
  } catch (error) {
    return res.status(401).json({ error: (error as Error).message });
  }
};

/**
 * Role-based access control middleware
 */
export const requireRole = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

/**
 * Rate limiting for auth endpoints
 */
const authRateLimits = new Map<string, { count: number; resetTime: number }>();

export const rateLimitAuth = (maxRequests: number = 5, windowMs: number = 60000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = (req.ip || req.socket.remoteAddress) as string;
    const now = Date.now();

    let limit = authRateLimits.get(ip);
    if (!limit || now > limit.resetTime) {
      limit = { count: 0, resetTime: now + windowMs };
    }

    if (limit.count >= maxRequests) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    limit.count++;
    authRateLimits.set(ip, limit);

    // Cleanup old entries
    if (authRateLimits.size > 10000) {
      for (const [key, value] of authRateLimits.entries()) {
        if (now > value.resetTime) {
          authRateLimits.delete(key);
        }
      }
    }

    next();
  };
};

/**
 * Extract IP address and user agent for session tracking
 */
export const captureSessionMetadata = (req: Request, res: Response, next: NextFunction) => {
  (req as any).ipAddress = req.ip || req.socket.remoteAddress;
  (req as any).userAgent = req.headers['user-agent'];
  next();
};
