import { Router } from 'express';
import {
  EDITABLE_SETTING_KEYS,
  getVisibleSettings,
  saveSettings,
} from '../runtime-settings.js';
import { recordAuditEventSafe } from '../audit-log.js';

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
