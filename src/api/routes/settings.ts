import { Router } from 'express';
import {
  EDITABLE_SETTING_KEYS,
  getVisibleSettings,
  saveSettings,
} from '../runtime-settings.js';

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

settingsRouter.put('/', (req, res) => {
  try {
    const payload = (req.body as { settings?: Record<string, unknown> })?.settings ?? {};
    saveSettings(payload);
    res.json({ ok: true, settings: getVisibleSettings() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
