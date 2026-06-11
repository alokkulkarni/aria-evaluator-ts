// src/api/auth-credentials.ts
// Email/password authentication routes

import { Router, Request, Response } from 'express';
import { prisma } from '../../db/client.js';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../../lib/password.js';
import { generateTokenPair, logoutUser } from '../token-manager.js';
import { requireAuth, rateLimitAuth, captureSessionMetadata } from '../middleware-auth.js';
import { storeSession } from '../../lib/cache.js';

export const authCredentialsRouter = Router();

/**
 * POST /auth/oauth
 * Register or find a user via social OAuth (Google/GitHub).
 * Called server-side by the website auth-backend after NextAuth completes OAuth.
 * Returns an accessToken the frontend can use to call control-plane APIs.
 */
authCredentialsRouter.post(
  '/oauth',
  captureSessionMetadata,
  rateLimitAuth(10, 60000),
  async (req: Request, res: Response) => {
    try {
      const { provider, email, name } = req.body as { provider?: string; email?: string; name?: string };

      if (!email || !provider) {
        return res.status(400).json({ error: 'Provider and email required' });
      }
      if (provider !== 'google' && provider !== 'github') {
        return res.status(400).json({ error: 'Invalid provider' });
      }

      let user = await prisma.user.findUnique({ where: { email } });
      const isNewUser = !user;

      if (!user) {
        const rawUsername = name
          ? name.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '_').slice(0, 64)
          : email.split('@')[0]?.slice(0, 64) ?? 'user';
        const baseUsername = rawUsername || 'user';

        // Ensure username uniqueness
        let username = baseUsername;
        const existing = await prisma.user.findUnique({ where: { username } });
        if (existing) username = `${baseUsername}_${Date.now().toString(36)}`;

        user = await prisma.user.create({
          data: { email, username, role: 'admin' },
        });
      }

      let accessToken: string | undefined;
      try {
        const tokens = await generateTokenPair({
          userId: user.id,
          email: user.email ?? '',
          role: user.role ?? 'admin',
        });
        accessToken = tokens.accessToken;
      } catch {
        // ACCESS_TOKEN_SECRET may not be configured — return user without token
      }

      return res.json({
        user: {
          id: user.id,
          email: user.email,
          name: name ?? null,
          authProvider: provider,
          role: 'owner',
          tenantId: null,
          accessToken,
          isNewUser,
        },
      });
    } catch (error) {
      console.error('[Auth] OAuth registration error:', error);
      return res.status(500).json({ error: 'OAuth registration failed' });
    }
  },
);

/**
 * POST /auth/register
 * Register with email and password (alias for /auth/signup used by website frontend)
 */
authCredentialsRouter.post(
  '/register',
  captureSessionMetadata,
  rateLimitAuth(3, 60000),
  async (req: Request, res: Response) => {
    try {
      const { email, name, password, company } = req.body as {
        email?: string; name?: string; password?: string; company?: string;
      };

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      const strengthCheck = validatePasswordStrength(password);
      if (!strengthCheck.isStrong) {
        return res.status(400).json({ error: 'Password is too weak', feedback: strengthCheck.feedback });
      }

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      const rawUsername = name
        ? name.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '_').slice(0, 64)
        : email.split('@')[0]?.slice(0, 64) ?? 'user';
      let username = rawUsername || 'user';
      const conflict = await prisma.user.findUnique({ where: { username } });
      if (conflict) username = `${username}_${Date.now().toString(36)}`;

      const passwordHash = await hashPassword(password);
      const user = await prisma.user.create({
        data: { email, username, passwordHash, role: 'admin' },
        select: { id: true, email: true, username: true },
      });

      let token: string | undefined;
      try {
        const tokens = await generateTokenPair({ userId: user.id, email: user.email ?? '', role: 'admin' });
        token = tokens.accessToken;
        const sessionId = `sess_${user.id}_${Date.now()}`;
        await storeSession(sessionId, user.id, (req as any).ipAddress, (req as any).userAgent);
      } catch {
        // Token infra may not be configured; caller must handle missing token
      }

      return res.status(201).json({ userId: user.id, token, emailVerified: false });
    } catch (error) {
      console.error('[Auth] Register error:', error);
      return res.status(500).json({ error: 'Registration failed' });
    }
  },
);

/**
 * POST /auth/signup
 * Register with email and password
 */
authCredentialsRouter.post(
  '/signup',
  captureSessionMetadata,
  rateLimitAuth(3, 60000), // 3 signups per minute
  async (req: Request, res: Response) => {
    try {
      const { email, username, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      // Validate password strength
      const strengthCheck = validatePasswordStrength(password);
      if (!strengthCheck.isStrong) {
        return res.status(400).json({
          error: 'Password is too weak',
          feedback: strengthCheck.feedback,
          score: strengthCheck.score,
        });
      }

      // Check if user exists
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      // Hash password and create user
      const passwordHash = await hashPassword(password);
      const user = await prisma.user.create({
        data: {
          email,
          username: username || email.split('@')[0],
          passwordHash,
        },
        select: { id: true, email: true, username: true },
      });

      // Generate tokens
      const tokens = await generateTokenPair({
        userId: user.id,
        email: user.email ?? '',
        role: 'user',
      });

      // Store session
      const sessionId = `sess_${user.id}_${Date.now()}`;
      await storeSession(sessionId, user.id, (req as any).ipAddress, (req as any).userAgent);

      // Log auth event
      await logAuthEvent('signup', user.id, 'success', (req as any).ipAddress);

      res.status(201).json({
        user,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        sessionId,
      });
    } catch (error) {
      console.error('[Auth] Signup error:', error);
      res.status(500).json({ error: 'Signup failed' });
    }
  }
);

/**
 * POST /auth/login
 * Login with email and password
 */
authCredentialsRouter.post(
  '/login',
  captureSessionMetadata,
  rateLimitAuth(5, 60000), // 5 attempts per minute
  async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      // Find user
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, username: true, passwordHash: true },
      });

      if (!user || !user.passwordHash) {
        await logAuthEvent('login', email, 'failed', (req as any).ipAddress);
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Verify password
      const passwordValid = await verifyPassword(password, user.passwordHash);
      if (!passwordValid) {
        await logAuthEvent('login', user.id, 'failed', (req as any).ipAddress);
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Generate tokens
      const tokens = await generateTokenPair({
        userId: user.id,
        email: user.email ?? '',
        role: 'user',
      });

      // Store session
      const sessionId = `sess_${user.id}_${Date.now()}`;
      await storeSession(sessionId, user.id, (req as any).ipAddress, (req as any).userAgent);

      await logAuthEvent('login', user.id, 'success', (req as any).ipAddress);

      res.json({
        user: { id: user.id, email: user.email, username: user.username },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        sessionId,
      });
    } catch (error) {
      console.error('[Auth] Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

/**
 * POST /auth/password-change
 * Change password (requires authentication)
 */
authCredentialsRouter.post(
  '/password-change',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user!.userId;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Both passwords required' });
      }

      // Validate new password
      const strengthCheck = validatePasswordStrength(newPassword);
      if (!strengthCheck.isStrong) {
        return res.status(400).json({
          error: 'New password is too weak',
          feedback: strengthCheck.feedback,
        });
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true },
      });

      if (!user || !user.passwordHash) {
        return res.status(400).json({ error: 'Cannot change password for OAuth-only account' });
      }

      // Verify current password
      const currentValid = await verifyPassword(currentPassword, user.passwordHash);
      if (!currentValid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      // Update password
      const newHash = await hashPassword(newPassword);
      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newHash },
      });

      await logAuthEvent('password-change', userId, 'success', (req as any).ipAddress);

      res.json({ message: 'Password updated successfully' });
    } catch (error) {
      console.error('[Auth] Password change error:', error);
      res.status(500).json({ error: 'Password change failed' });
    }
  }
);

/**
 * POST /auth/logout
 * Logout user (requires authentication)
 */
authCredentialsRouter.post('/logout', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    await logoutUser(userId);
    await logAuthEvent('logout', userId, 'success', (req as any).ipAddress);

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('[Auth] Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

/**
 * Helper: Log authentication events
 */
async function logAuthEvent(
  action: string,
  userOrEmail: string,
  result: 'success' | 'failed',
  ipAddress?: string
): Promise<void> {
  try {
    // In a real implementation, store in AuditLog table
    console.info(
      `[Auth] Action=${action} User=${userOrEmail} Result=${result} IP=${ipAddress}`
    );
  } catch (error) {
    console.error('[Auth] Failed to log event:', error);
  }
}
