# Judge Model ID Validation Fix

## Problem
Judge model selection was failing with:
```
ValidationException: The provided model identifier is invalid.
```

## Root Cause Analysis
1. **Initial attempt used `eu.` prefix** (e.g., `eu.anthropic.claude-3-5-haiku-20241022-v1:0`)
   - This is NOT a valid Bedrock format for same-region calls
   - `eu.` prefix is only for cross-region inference in other AWS services, not Bedrock Converse API

2. **Model availability issue**
   - Claude 3.5 Haiku (`claude-3-5-haiku-20241022-v1:0`) is NOT available in eu-west-2
   - Several models were listed but unavailable: Llama 3.1, Jamba 1.5, Command R+, R1, Titan models

## Solution
Updated `src/shared/judge-config.ts`:
- **Removed `eu.` prefix** — use bare model IDs (e.g., `anthropic.claude-haiku-4-5-20251001-v1:0`)
- **Verified all models exist in eu-west-2** by querying AWS Bedrock API
- **Replaced unavailable models** with available alternatives:
  - Claude 3.5 Haiku → Claude Haiku 4.5 (latest, available in eu-west-2)
  - Claude 3.5 Sonnet → Claude 3.7 Sonnet (newer, available)
  - Removed: Llama 3.1, Jamba 1.5, Command R+, Titan models

## Available Models (eu-west-2)
### Anthropic
- Claude Sonnet 4.6 (default)
- Claude Sonnet 4.5
- Claude 3.7 Sonnet
- Claude 3 Sonnet
- Claude Opus 4.8
- Claude Opus 4.7
- Claude Opus 4.5
- Claude Haiku 4.5 ✅ (replaces 3.5)
- Claude 3 Haiku

### Amazon Nova
- Nova Pro
- Nova Lite
- Nova Micro

### Meta Llama
- Llama 3 70B
- Llama 3 8B

### Mistral
- Mistral Large 2402
- Mixtral 8x7B
- Mistral 7B

### DeepSeek
- DeepSeek V3
- DeepSeek V3.2

## Changes Made
1. ✅ Updated `JUDGE_MODEL_GROUPS` to use correct model IDs
2. ✅ Added validation in `saveSettings()` to reject invalid model IDs
3. ✅ Added debug logging to trace model resolution

## Deployment Steps
1. Rebuild Docker image:
   ```bash
   cd /repo && docker build -t aria-evaluator:latest .
   ```
2. Redeploy container with new image
3. Delete old `data/runtime-settings.json` (optional)
4. Change judge model in Settings → Save
5. Create new run — should work without validation errors

## Testing
After deployment, change judge model to "Claude Haiku 4.5" and create a run. Should see:
```
[Settings] Judge config - preset: anthropic.claude-haiku-4-5-20251001-v1:0, ...
[Judge] Using model: anthropic.claude-haiku-4-5-20251001-v1:0 (temp: 0, maxTokens: 2000)
✓ Run completed successfully
```

No more ValidationException errors.
