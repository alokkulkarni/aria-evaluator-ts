// src/api/auth-oauth.ts
// Google and GitHub OAuth integration

import { Router, Request, Response } from 'express';
import axios from 'axios';
import { prisma } from '../../db/client.js';
import { generateTokenPair } from '../token-manager.js';
import { storeOAuthState, getOAuthState, storeSession } from '../../lib/cache.js';
import { generateSecureToken } from '../../lib/password.js';
import { captureSessionMetadata } from '../middleware-auth.js';

export const authOAuthRouter = Router();

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://www.googleapis.com/oauth2/v4/token';
const GOOGLE_USER_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';

/**
 * GET /auth/oauth/google/login
 * Redirect to Google OAuth
 */
authOAuthRouter.get('/oauth/google/login', async (req: Request, res: Response) => {
  try {
    const state = generateSecureToken(32);
    const redirectUri = `${process.env.API_BASE_URL}/auth/oauth/google/callback`;

    // Store state in Redis for validation
    await storeOAuthState(state, { provider: 'google', timestamp: Date.now() });

    const authUrl = new URL(GOOGLE_AUTH_URL);
    authUrl.searchParams.append('client_id', process.env.GOOGLE_CLIENT_ID || '');
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', 'email profile');
    authUrl.searchParams.append('state', state);

    res.redirect(authUrl.toString());
  } catch (error) {
    console.error('[OAuth] Google login error:', error);
    res.redirect(`${process.env.UI_BASE_URL}?error=oauth_failed`);
  }
});

/**
 * GET /auth/oauth/google/callback
 * Handle Google OAuth callback
 */
authOAuthRouter.get(
  '/oauth/google/callback',
  captureSessionMetadata,
  async (req: Request, res: Response) => {
    try {
      const { code, state } = req.query;

      if (!code || !state) {
        return res.redirect(`${process.env.UI_BASE_URL}?error=missing_oauth_params`);
      }

      // Validate state
      const oauthData = await getOAuthState(state as string);
      if (!oauthData || oauthData.provider !== 'google') {
        return res.redirect(`${process.env.UI_BASE_URL}?error=invalid_oauth_state`);
      }

      // Exchange code for token
      const tokenResponse = await axios.post(GOOGLE_TOKEN_URL, {
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${process.env.API_BASE_URL}/auth/oauth/google/callback`,
      });

      // Get user info
      const userResponse = await axios.get(GOOGLE_USER_URL, {
        headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` },
      });

      const { email, name, id: googleSub } = userResponse.data;

      // Find or create user
      let user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        user = await prisma.user.create({
          data: {
            email,
            username: name || email.split('@')[0],
            googleSub,
          },
        });
      } else if (!user.googleSub) {
        // Link Google account
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleSub },
        });
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

      // Redirect to UI with tokens
      const redirectUrl = new URL(`${process.env.UI_BASE_URL}/auth-callback`);
      redirectUrl.searchParams.append('accessToken', tokens.accessToken);
      redirectUrl.searchParams.append('refreshToken', tokens.refreshToken);
      redirectUrl.searchParams.append('sessionId', sessionId);

      res.redirect(redirectUrl.toString());
    } catch (error) {
      console.error('[OAuth] Google callback error:', error);
      res.redirect(`${process.env.UI_BASE_URL}?error=oauth_failed`);
    }
  }
);

/**
 * GET /auth/oauth/github/login
 * Redirect to GitHub OAuth
 */
authOAuthRouter.get('/oauth/github/login', async (req: Request, res: Response) => {
  try {
    const state = generateSecureToken(32);
    const redirectUri = `${process.env.API_BASE_URL}/auth/oauth/github/callback`;

    // Store state in Redis
    await storeOAuthState(state, { provider: 'github', timestamp: Date.now() });

    const authUrl = new URL(GITHUB_AUTH_URL);
    authUrl.searchParams.append('client_id', process.env.GITHUB_CLIENT_ID || '');
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('scope', 'user:email');
    authUrl.searchParams.append('state', state);

    res.redirect(authUrl.toString());
  } catch (error) {
    console.error('[OAuth] GitHub login error:', error);
    res.redirect(`${process.env.UI_BASE_URL}?error=oauth_failed`);
  }
});

/**
 * GET /auth/oauth/github/callback
 * Handle GitHub OAuth callback
 */
authOAuthRouter.get(
  '/oauth/github/callback',
  captureSessionMetadata,
  async (req: Request, res: Response) => {
    try {
      const { code, state } = req.query;

      if (!code || !state) {
        return res.redirect(`${process.env.UI_BASE_URL}?error=missing_oauth_params`);
      }

      // Validate state
      const oauthData = await getOAuthState(state as string);
      if (!oauthData || oauthData.provider !== 'github') {
        return res.redirect(`${process.env.UI_BASE_URL}?error=invalid_oauth_state`);
      }

      // Exchange code for token
      const tokenResponse = await axios.post(
        GITHUB_TOKEN_URL,
        {
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
        },
        { headers: { Accept: 'application/json' } }
      );

      // Get user info
      const userResponse = await axios.get(GITHUB_USER_URL, {
        headers: { Authorization: `token ${tokenResponse.data.access_token}` },
      });

      const { email, name, login, id: githubId } = userResponse.data;
      const userEmail = email || `${login}@github.local`;

      // Find or create user
      let user = await prisma.user.findUnique({ where: { email: userEmail } });

      if (!user) {
        user = await prisma.user.create({
          data: {
            email: userEmail,
            username: login,
            githubId,
          },
        });
      } else if (!user.githubId) {
        // Link GitHub account
        user = await prisma.user.update({
          where: { id: user.id },
          data: { githubId },
        });
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

      // Redirect to UI with tokens
      const redirectUrl = new URL(`${process.env.UI_BASE_URL}/auth-callback`);
      redirectUrl.searchParams.append('accessToken', tokens.accessToken);
      redirectUrl.searchParams.append('refreshToken', tokens.refreshToken);
      redirectUrl.searchParams.append('sessionId', sessionId);

      res.redirect(redirectUrl.toString());
    } catch (error) {
      console.error('[OAuth] GitHub callback error:', error);
      res.redirect(`${process.env.UI_BASE_URL}?error=oauth_failed`);
    }
  }
);
