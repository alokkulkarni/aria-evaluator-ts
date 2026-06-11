// src/api/routes/auth-oauth.ts
// Google and GitHub OAuth — creates cookie-based sessions (same system as password login)

import { Router, type Request, type Response } from 'express';
import axios from 'axios';
import { prisma } from '../../db/client.js';
import { storeOAuthState, getOAuthState } from '../../lib/cache.js';
import { generateSecureToken } from '../../lib/password.js';
import { captureSessionMetadata } from '../middleware-auth.js';
import { createAndSetOAuthSession } from '../auth.js';

export const authOAuthRouter = Router();

const UI_BASE = () => process.env['UI_BASE_URL'] ?? 'http://localhost:5173';

async function getSessionFromRequest(req: Request): Promise<{ userId: string } | null> {
  try {
    // Read the session cookie — re-use the same cookie name as the evaluator auth system
    const cookieName = process.env['NODE_ENV'] === 'production' ? '__Host-aria_session' : 'aria_session';
    const rawCookies = req.headers.cookie ?? '';
    const entries = rawCookies.split(';');
    let sessionToken: string | null = null;
    for (const entry of entries) {
      const idx = entry.indexOf('=');
      if (idx <= 0) continue;
      const key = entry.slice(0, idx).trim();
      if (key === cookieName || key === 'aria_session' || key === '__Host-aria_session') {
        sessionToken = decodeURIComponent(entry.slice(idx + 1).trim());
        break;
      }
    }
    if (!sessionToken) return null;

    const { createHash } = await import('node:crypto');
    const tokenHash = createHash('sha256').update(sessionToken).digest('hex');
    const session = await prisma.authSession.findUnique({
      where: { tokenHash },
      select: { userId: true, expiresAt: true },
    });
    if (!session || session.expiresAt < new Date()) return null;
    return { userId: session.userId };
  } catch {
    return null;
  }
}
const API_BASE = () => process.env['API_BASE_URL'] ?? 'http://localhost:3001';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://www.googleapis.com/oauth2/v4/token';
const GOOGLE_USER_URL  = 'https://www.googleapis.com/oauth2/v2/userinfo';

const GITHUB_AUTH_URL  = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL  = 'https://api.github.com/user';
const GITHUB_EMAILS_URL = 'https://api.github.com/user/emails';

// ── Google ────────────────────────────────────────────────────────────────────

authOAuthRouter.get('/oauth/google/login', async (_req: Request, res: Response) => {
  try {
    if (!process.env['GOOGLE_CLIENT_ID']) {
      return res.redirect(`${UI_BASE()}?error=google_not_configured`);
    }
    const state = generateSecureToken(32);
    await storeOAuthState(state, { provider: 'google', timestamp: Date.now() });

    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set('client_id', process.env['GOOGLE_CLIENT_ID']);
    url.searchParams.set('redirect_uri', `${API_BASE()}/auth/oauth/google/callback`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'email profile');
    url.searchParams.set('state', state);
    res.redirect(url.toString());
  } catch (err) {
    console.error('[OAuth] Google login error:', err);
    res.redirect(`${UI_BASE()}?error=oauth_failed`);
  }
});

authOAuthRouter.get(
  '/oauth/google/callback',
  captureSessionMetadata,
  async (req: Request, res: Response) => {
    try {
      const { code, state, error } = req.query;

      if (error) return res.redirect(`${UI_BASE()}?error=${encodeURIComponent(String(error))}`);
      if (!code || !state) return res.redirect(`${UI_BASE()}?error=missing_oauth_params`);

      const oauthData = await getOAuthState(state as string);
      if (!oauthData || oauthData.provider !== 'google') {
        return res.redirect(`${UI_BASE()}?error=invalid_oauth_state`);
      }

      const tokenRes = await axios.post(GOOGLE_TOKEN_URL, {
        client_id:     process.env['GOOGLE_CLIENT_ID'],
        client_secret: process.env['GOOGLE_CLIENT_SECRET'],
        code,
        grant_type:    'authorization_code',
        redirect_uri:  `${API_BASE()}/auth/oauth/google/callback`,
      });

      const userRes = await axios.get(GOOGLE_USER_URL, {
        headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
      });

      const { email, name, id: googleSub } = userRes.data as { email: string; name: string; id: string };
      if (!email) return res.redirect(`${UI_BASE()}?error=google_no_email`);

      let user = await prisma.user.findFirst({ where: { OR: [{ googleSub }, { email }] } });

      if (!user) {
        user = await prisma.user.create({
          data: { email, username: (name ?? email.split('@')[0]).slice(0, 64).replace(/[^a-zA-Z0-9._-]/g, '_'), googleSub },
        });
      } else if (!user.googleSub) {
        user = await prisma.user.update({ where: { id: user.id }, data: { googleSub } });
      }

      await createAndSetOAuthSession(user.id, res);
      res.redirect(UI_BASE());
    } catch (err) {
      console.error('[OAuth] Google callback error:', err);
      res.redirect(`${UI_BASE()}?error=oauth_failed`);
    }
  },
);

// ── GitHub ────────────────────────────────────────────────────────────────────

authOAuthRouter.get('/oauth/github/login', async (_req: Request, res: Response) => {
  try {
    if (!process.env['GITHUB_CLIENT_ID']) {
      return res.redirect(`${UI_BASE()}?error=github_not_configured`);
    }
    const state = generateSecureToken(32);
    await storeOAuthState(state, { provider: 'github', timestamp: Date.now() });

    const url = new URL(GITHUB_AUTH_URL);
    url.searchParams.set('client_id', process.env['GITHUB_CLIENT_ID']);
    url.searchParams.set('redirect_uri', `${API_BASE()}/auth/oauth/github/callback`);
    url.searchParams.set('scope', 'user:email');
    url.searchParams.set('state', state);
    res.redirect(url.toString());
  } catch (err) {
    console.error('[OAuth] GitHub login error:', err);
    res.redirect(`${UI_BASE()}?error=oauth_failed`);
  }
});

authOAuthRouter.get(
  '/oauth/github/callback',
  captureSessionMetadata,
  async (req: Request, res: Response) => {
    try {
      const { code, state, error } = req.query;

      if (error) return res.redirect(`${UI_BASE()}?error=${encodeURIComponent(String(error))}`);
      if (!code || !state) return res.redirect(`${UI_BASE()}?error=missing_oauth_params`);

      const oauthData = await getOAuthState(state as string);
      if (!oauthData || oauthData.provider !== 'github') {
        return res.redirect(`${UI_BASE()}?error=invalid_oauth_state`);
      }

      const tokenRes = await axios.post(
        GITHUB_TOKEN_URL,
        { client_id: process.env['GITHUB_CLIENT_ID'], client_secret: process.env['GITHUB_CLIENT_SECRET'], code },
        { headers: { Accept: 'application/json' } },
      );

      const accessToken = tokenRes.data.access_token as string;
      const headers = { Authorization: `token ${accessToken}` };

      const userRes = await axios.get(GITHUB_USER_URL, { headers });
      const { login, id: githubId } = userRes.data as { login: string; email: string | null; id: number };

      // GitHub may not expose email publicly — fetch verified primary email
      let email: string | null = userRes.data.email as string | null;
      if (!email) {
        const emailsRes = await axios.get(GITHUB_EMAILS_URL, { headers });
        const primary = (emailsRes.data as Array<{ email: string; primary: boolean; verified: boolean }>)
          .find((e) => e.primary && e.verified);
        email = primary?.email ?? null;
      }
      if (!email) return res.redirect(`${UI_BASE()}?error=github_no_email`);

      const safeUsername = login.slice(0, 64).replace(/[^a-zA-Z0-9._-]/g, '_');
      let user = await prisma.user.findFirst({ where: { OR: [{ githubId }, { email }] } });

      if (!user) {
        // Ensure username is unique
        const existing = await prisma.user.findUnique({ where: { username: safeUsername } });
        const username = existing ? `${safeUsername}_gh` : safeUsername;
        user = await prisma.user.create({ data: { email, username, githubId } });
      } else if (!user.githubId) {
        user = await prisma.user.update({ where: { id: user.id }, data: { githubId } });
      }

      await createAndSetOAuthSession(user.id, res);
      res.redirect(UI_BASE());
    } catch (err) {
      console.error('[OAuth] GitHub callback error:', err);
      res.redirect(`${UI_BASE()}?error=oauth_failed`);
    }
  },
);

// ── Account linking (attach a provider to an existing authenticated session) ──

/**
 * GET /auth/link/google
 * Redirects to Google to link a Google account to the currently signed-in user.
 * Stores the current user's ID in the OAuth state so the callback knows who to link.
 */
authOAuthRouter.get('/link/google', async (req: Request, res: Response) => {
  try {
    if (!process.env['GOOGLE_CLIENT_ID']) {
      return res.redirect(`${UI_BASE()}?error=google_not_configured`);
    }
    const state = generateSecureToken(32);
    await storeOAuthState(state, { provider: 'google', action: 'link', timestamp: Date.now() });

    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set('client_id', process.env['GOOGLE_CLIENT_ID']);
    url.searchParams.set('redirect_uri', `${API_BASE()}/auth/oauth/link/google/callback`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'email profile');
    url.searchParams.set('state', state);
    res.redirect(url.toString());
  } catch (err) {
    console.error('[OAuth] Google link error:', err);
    res.redirect(`${UI_BASE()}?error=oauth_failed`);
  }
});

authOAuthRouter.get(
  '/link/google/callback',
  async (req: Request, res: Response) => {
    try {
      const { code, state, error } = req.query;
      if (error) return res.redirect(`${UI_BASE()}?error=${encodeURIComponent(String(error))}`);
      if (!code || !state) return res.redirect(`${UI_BASE()}?error=missing_oauth_params`);

      const oauthData = await getOAuthState(state as string);
      if (!oauthData || oauthData.provider !== 'google') {
        return res.redirect(`${UI_BASE()}?error=invalid_oauth_state`);
      }

      const tokenRes = await axios.post(GOOGLE_TOKEN_URL, {
        client_id:     process.env['GOOGLE_CLIENT_ID'],
        client_secret: process.env['GOOGLE_CLIENT_SECRET'],
        code,
        grant_type:    'authorization_code',
        redirect_uri:  `${API_BASE()}/auth/oauth/link/google/callback`,
      });

      const userRes = await axios.get(GOOGLE_USER_URL, {
        headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
      });

      const { id: googleSub } = userRes.data as { email: string; id: string };

      // Read the current session to find who is linking
      const session = await getSessionFromRequest(req);
      if (!session) return res.redirect(`${UI_BASE()}?error=not_authenticated`);

      // Check the googleSub is not already used by another account
      const existing = await prisma.user.findUnique({ where: { googleSub } });
      if (existing && existing.id !== session.userId) {
        return res.redirect(`${UI_BASE()}/settings?error=provider_already_linked`);
      }

      await prisma.user.update({ where: { id: session.userId }, data: { googleSub } });
      res.redirect(`${UI_BASE()}/settings?linked=google`);
    } catch (err) {
      console.error('[OAuth] Google link callback error:', err);
      res.redirect(`${UI_BASE()}?error=oauth_failed`);
    }
  },
);

/**
 * GET /auth/link/github
 * Same pattern for GitHub.
 */
authOAuthRouter.get('/link/github', async (_req: Request, res: Response) => {
  try {
    if (!process.env['GITHUB_CLIENT_ID']) {
      return res.redirect(`${UI_BASE()}?error=github_not_configured`);
    }
    const state = generateSecureToken(32);
    await storeOAuthState(state, { provider: 'github', action: 'link', timestamp: Date.now() });

    const url = new URL(GITHUB_AUTH_URL);
    url.searchParams.set('client_id', process.env['GITHUB_CLIENT_ID']);
    url.searchParams.set('redirect_uri', `${API_BASE()}/auth/oauth/link/github/callback`);
    url.searchParams.set('scope', 'user:email');
    url.searchParams.set('state', state);
    res.redirect(url.toString());
  } catch (err) {
    console.error('[OAuth] GitHub link error:', err);
    res.redirect(`${UI_BASE()}?error=oauth_failed`);
  }
});

authOAuthRouter.get(
  '/link/github/callback',
  async (req: Request, res: Response) => {
    try {
      const { code, state, error } = req.query;
      if (error) return res.redirect(`${UI_BASE()}?error=${encodeURIComponent(String(error))}`);
      if (!code || !state) return res.redirect(`${UI_BASE()}?error=missing_oauth_params`);

      const oauthData = await getOAuthState(state as string);
      if (!oauthData || oauthData.provider !== 'github') {
        return res.redirect(`${UI_BASE()}?error=invalid_oauth_state`);
      }

      const tokenRes = await axios.post(
        GITHUB_TOKEN_URL,
        { client_id: process.env['GITHUB_CLIENT_ID'], client_secret: process.env['GITHUB_CLIENT_SECRET'], code },
        { headers: { Accept: 'application/json' } },
      );

      const userRes = await axios.get(GITHUB_USER_URL, {
        headers: { Authorization: `token ${tokenRes.data.access_token}` },
      });
      const { id: githubId } = userRes.data as { login: string; id: number };

      const session = await getSessionFromRequest(req);
      if (!session) return res.redirect(`${UI_BASE()}?error=not_authenticated`);

      const existing = await prisma.user.findFirst({ where: { githubId } });
      if (existing && existing.id !== session.userId) {
        return res.redirect(`${UI_BASE()}/settings?error=provider_already_linked`);
      }

      await prisma.user.update({ where: { id: session.userId }, data: { githubId } });
      res.redirect(`${UI_BASE()}/settings?linked=github`);
    } catch (err) {
      console.error('[OAuth] GitHub link callback error:', err);
      res.redirect(`${UI_BASE()}?error=oauth_failed`);
    }
  },
);
