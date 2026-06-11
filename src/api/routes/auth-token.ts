// src/api/routes/auth-token.ts
// Token refresh and logout endpoints

import { Router, type Request, type Response } from 'express';
import { refreshTokens, verifyAccessToken, logoutUser } from '../token-manager.js';

export const tokenRouter = Router();

// POST /auth/refresh — rotate refresh token, issue new access token
tokenRouter.post('/refresh', async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refreshToken as string | undefined;

  if (!refreshToken) {
    res.status(401).json({ error: 'No refresh token' });
    return;
  }

  try {
    const tokens = await refreshTokens(refreshToken);

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ accessToken: tokens.accessToken, expiresIn: tokens.expiresIn });
  } catch (error) {
    res.clearCookie('refreshToken');
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// POST /auth/token-logout — revoke tokens via cookie (complements the existing /api/auth/logout)
tokenRouter.post('/token-logout', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const payload = verifyAccessToken(token);
        await logoutUser(payload.userId);
      } catch {
        // Token already invalid — continue with cookie cleanup
      }
    }
  } finally {
    res.clearCookie('refreshToken');
    res.json({ ok: true });
  }
});
