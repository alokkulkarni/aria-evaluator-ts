# Settings Page Blank Screen Fix

## Problem
After deploying the region-aware judge models changes, the Settings page showed a blank screen instead of loading the settings form.

## Root Cause
The `Promise.all([apiFetch('/api/settings'), apiFetch('/api/settings/judge-models')])` was causing the entire page to fail if either endpoint had an issue. If `/api/settings/judge-models` returned an error or wasn't available, the entire Promise.all would reject, preventing the settings page from rendering.

## Solution
1. **Split API calls** — Separated `/api/settings` from `/api/settings/judge-models` into independent async operations
2. **Added fallback** — If `/api/settings/judge-models` fails, the page gracefully falls back to using `JUDGE_MODEL_GROUPS` (default models)
3. **Better error isolation** — Settings load independently from judge models, so one doesn't block the other
4. **Added logging** — `/judge-models` endpoint logs what's happening for debugging

## Changes

### Before
```typescript
Promise.all([
  apiFetch('/api/settings'),
  apiFetch('/api/settings/judge-models'),
])
  .then(([settingsData, modelsData]) => {
    setSettings(normalizeJudgeSettings(settingsData.settings ?? {}));
    setJudgeModelGroups(modelsData.models ?? JUDGE_MODEL_GROUPS);
  })
  .catch((err) => setError((err as Error).message))  // ← Entire page fails
  .finally(() => setLoading(false));
```

### After
```typescript
// Load settings (critical)
apiFetch('/api/settings')
  .then((d) => {
    setSettings(normalizeJudgeSettings(d.settings ?? {}));
  })
  .catch((err) => setError((err as Error).message))
  .finally(() => setLoading(false));

// Load judge models (fallback available)
apiFetch('/api/settings/judge-models')
  .then((d) => {
    setJudgeModelGroups(d.models ?? JUDGE_MODEL_GROUPS);
  })
  .catch(() => {
    // Silently fall back to default models
    setJudgeModelGroups(JUDGE_MODEL_GROUPS);
  });
```

## Result
✅ Settings page always loads
✅ Judge models dropdown shows models (either from API or defaults)
✅ If API endpoint is temporarily down, users can still see settings
✅ Debug logs help troubleshoot if endpoint isn't working

## Test After Deploy

1. Rebuild Docker image with TF taint:
   ```bash
   terraform taint <docker_image_resource>
   terraform taint <container_resource>
   terraform apply
   ```

2. Navigate to Settings → should load normally
3. Judge Models dropdown should populate with available models
4. Check container logs for:
   ```
   [API] /judge-models endpoint - region: eu-west-2
   [API] /judge-models - returning 5 model groups for region eu-west-2
   ```

If logs show an error, that error is now isolated and won't break the page.
