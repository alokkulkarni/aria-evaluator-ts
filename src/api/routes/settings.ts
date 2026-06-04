import { Router } from 'express';
import {
  EDITABLE_SETTING_KEYS,
  getVisibleSettings,
  saveSettings,
  getEffectiveSettings,
} from '../runtime-settings.js';
import { recordAuditEventSafe } from '../audit-log.js';
import { getModelsForRegion } from '../../shared/judge-config.js';

export const settingsRouter = Router();

settingsRouter.get('/', (_req, res) => {
  try {
    res.json({
      settings: getVisibleSettings(),
      editableKeys: EDITABLE_SETTING_KEYS,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

settingsRouter.get('/judge-models', (req, res) => {
  try {
    const effective = getEffectiveSettings();
    // Allow explicit ?region= override from UI (for live region switching before save)
    const queryRegion = typeof req.query['region'] === 'string' ? req.query['region'].trim() : '';
    const region = (
      queryRegion ||
      effective['JUDGE_BEDROCK_REGION']?.trim() ||
      process.env['BEDROCK_REGION'] ||
      effective['AWS_REGION'] ||
      'eu-west-2'
    ).trim();
    console.log(`[API] /judge-models endpoint - region: ${region}`);
    const models = getModelsForRegion(region);
    console.log(`[API] /judge-models - returning ${models.length} model groups for region ${region}`);
    res.json({ region, models });
  } catch (err) {
    console.error('[API] /judge-models error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

settingsRouter.put('/', async (req, res) => {
  try {
    const payload = (req.body as { settings?: Record<string, unknown> })?.settings ?? {};
    const changedKeys = EDITABLE_SETTING_KEYS.filter((key) => key in payload);
    saveSettings(payload);
    await recordAuditEventSafe(req, 'settings.update', 'runtime-settings', {
      changedKeys,
      changedCount: changedKeys.length,
    });
    res.json({ ok: true, settings: getVisibleSettings() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
