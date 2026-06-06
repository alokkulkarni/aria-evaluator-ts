import { Router } from 'express';

import { ControlPlaneError, controlPlaneInternalFetch, getWebsiteBaseUrl } from '../control-plane.js';
import { getRequestAuth } from '../auth.js';

export const workspaceRouter = Router();

workspaceRouter.get('/', async (req, res) => {
  try {
    const auth = getRequestAuth(req);
    if (!auth) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const websiteUrl = getWebsiteBaseUrl();
    if (!auth.ssoSubject) {
      res.json({
        workspaceEligible: false,
        websiteUrl,
        workspace: null,
      });
      return;
    }

    try {
      const workspace = await controlPlaneInternalFetch<{
        tenantId: string | null;
        status: 'not_provisioned' | 'provisioning' | 'running' | 'suspended' | 'error';
        plan: 'free' | 'individual' | 'enterprise_starter' | 'enterprise_pro' | 'enterprise_unlimited' | null;
        region: string | null;
        billingPeriod: 'monthly' | 'annual' | null;
        instanceUrl: string | null;
        usage: {
          runsThisMonth: number;
          maxRuns: number;
          scenariosUsed: number;
          maxScenarios: number;
        };
        provisionedAt?: string;
      }>('/internal/tenant-by-user', {
        method: 'POST',
        body: JSON.stringify({ userId: auth.ssoSubject }),
      });

      res.json({
        workspaceEligible: true,
        websiteUrl,
        workspace,
      });
    } catch (err) {
      if (err instanceof ControlPlaneError && err.status === 404) {
        res.json({
          workspaceEligible: true,
          websiteUrl,
          workspace: null,
        });
        return;
      }
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
