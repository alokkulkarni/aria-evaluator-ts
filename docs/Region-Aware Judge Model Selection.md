# Region-Aware Judge Model Selection

## Overview
Judge model selection is now fully region-aware and supports cross-region model access. Users can:
1. Select any AWS region where Bedrock is available
2. Use only models available in that region
3. Optionally use cross-region models with automatic prefix handling
4. Seamlessly switch regions without code changes

## Architecture

### Model Registry
All judge models are defined in `MODEL_REGISTRY` in `src/shared/judge-config.ts`:
```typescript
MODEL_REGISTRY: {
  'anthropic.claude-sonnet-4-6': { 
    label: 'Claude Sonnet 4.6',
    regions: ['eu-west-2', 'us-east-1', 'us-west-2'],
    vendor: 'anthropic'
  },
  'anthropic.claude-haiku-4-5-20251001-v1:0': {
    label: 'Claude Haiku 4.5',
    regions: ['eu-west-2', 'us-east-1', 'us-west-2', 'ap-northeast-1'],
    vendor: 'anthropic'
  },
  // ... 17 more models
}
```

### Region Detection
The system detects the current Bedrock region in this order:
1. `BEDROCK_REGION` environment variable (highest priority)
2. `AWS_REGION` setting or environment variable
3. Default: `eu-west-2`

### Model ID Format

**Same-Region (Default):**
```
anthropic.claude-sonnet-4-6
```

**Cross-Region (Auto-Prefixed):**
```
us-west-2.anthropic.claude-sonnet-4-6
```

The system automatically applies/removes prefixes based on region.

## Supported Regions & Models

| Region | Models Available | Highlights |
|--------|------------------|-----------|
| **eu-west-2** (default) | 19/19 (100%) | All models available |
| **us-east-1** | 16/19 (84%) | Missing: Opus 4.8, 3.7 Sonnet, 3 Haiku |
| **us-west-2** | 16/19 (84%) | Missing: Opus 4.8, 3.7 Sonnet, 3 Haiku |
| **ap-northeast-1** | 12/19 (63%) | Has: Opus 4.8, 3.7 Sonnet, 3 Haiku |

### Available Models by Region

**eu-west-2:**
- Claude Sonnet 4.6 ✅
- Claude Sonnet 4.5 ✅
- Claude 3.7 Sonnet ✅
- Claude 3 Sonnet ✅
- Claude Opus 4.8 ✅
- Claude Opus 4.7 ✅
- Claude Opus 4.5 ✅
- Claude Haiku 4.5 ✅
- Claude 3 Haiku ✅
- Nova Pro, Lite, Micro ✅
- Llama 3 70B, 8B ✅
- Mistral Large, Mixtral, 7B ✅
- DeepSeek V3, V3.2 ✅

**us-east-1, us-west-2:**
- All above EXCEPT: Opus 4.8, 3.7 Sonnet, 3 Haiku

**ap-northeast-1:**
- Opus 4.8 ✅
- 3.7 Sonnet ✅
- 3 Haiku ✅
- Haiku 4.5 ✅
- Sonnet 4.5 ✅
- Sonnet 4-20250514 ✅
- Llama 3 70B, 8B ✅
- Mistral models ✅
- DeepSeek models ✅

## API Endpoints

### GET /api/settings/judge-models
Returns region-aware judge model groups.

**Request:**
```
GET /api/settings/judge-models
```

**Response:**
```json
{
  "region": "eu-west-2",
  "models": [
    {
      "label": "Anthropic",
      "options": [
        {"value": "anthropic.claude-sonnet-4-6", "label": "Claude Sonnet 4.6"},
        {"value": "anthropic.claude-haiku-4-5-20251001-v1:0", "label": "Claude Haiku 4.5"}
      ]
    },
    // ... more groups
  ]
}
```

## Key Functions

### getModelsForRegion(region: string)
Returns JudgeModelGroup[] for a region.
```typescript
const models = getModelsForRegion('us-east-1');
// Returns only models available in us-east-1
```

### formatModelIdForRegion(modelId: string, region: string)
Formats a model ID for the target region.
```typescript
formatModelIdForRegion('anthropic.claude-sonnet-4-6', 'eu-west-2')
// Returns: 'anthropic.claude-sonnet-4-6' (same-region, no prefix)

formatModelIdForRegion('anthropic.claude-opus-4-8', 'eu-west-2')
// Returns: 'eu-west-2.anthropic.claude-opus-4-8' (cross-region, adds prefix)
```

### isValidModelId(modelId: string, region: string)
Validates if a model is available in a region.
```typescript
isValidModelId('anthropic.claude-sonnet-4-6', 'eu-west-2') // true
isValidModelId('anthropic.claude-opus-4-8', 'us-east-1')   // false (not in region)
isValidModelId('us-east-1.anthropic.claude-opus-4-8', 'eu-west-2') // true (cross-region)
```

### extractBareModelId(modelId: string)
Extracts bare model ID from potentially region-prefixed ID.
```typescript
extractBareModelId('anthropic.claude-sonnet-4-6')
// Returns: 'anthropic.claude-sonnet-4-6'

extractBareModelId('us-west-2.anthropic.claude-sonnet-4-6')
// Returns: 'anthropic.claude-sonnet-4-6'
```

## Usage Examples

### 1. Default: Use same-region model
```bash
# Container starts with BEDROCK_REGION=eu-west-2
# User selects "Claude Haiku 4.5" from Settings
# Judge receives: anthropic.claude-haiku-4-5-20251001-v1:0
✓ Works - model is available in eu-west-2
```

### 2. Switch regions
```bash
# Container starts with BEDROCK_REGION=eu-west-2
# Admin changes BEDROCK_REGION=us-east-1
# UI automatically shows only 16 models available in us-east-1
# User selects "Claude Haiku 4.5"
# Judge receives: anthropic.claude-haiku-4-5-20251001-v1:0
✓ Works - model is available in us-east-1
```

### 3. Try cross-region model (optional)
```bash
# Container runs in us-east-1
# User manually enters: us-east-1.anthropic.claude-opus-4-8
# But Opus 4.8 is only in ap-northeast-1
# System auto-prefixes: ap-northeast-1.anthropic.claude-opus-4-8
✓ Works - Bedrock handles cross-region call
```

## Settings Integration

### Save Settings
When user changes JUDGE_MODEL_ID in Settings:
1. Model ID is validated against current region
2. Bare model ID is stored (prefix is added at runtime based on region)
3. If region changes, model is re-formatted automatically

### Load Settings
When Judge runs:
1. Reads JUDGE_MODEL_ID from settings (bare format)
2. Detects current region (BEDROCK_REGION env var)
3. Formats model ID for region (adds prefix if cross-region)
4. Sends to Bedrock Converse API with correct format

## Logging

Judge logs show region and model details:
```
[Settings] Judge config - region: eu-west-2, preset: anthropic.claude-haiku-4-5-20251001-v1:0, final: anthropic.claude-haiku-4-5-20251001-v1:0
[Judge] Using model: anthropic.claude-haiku-4-5-20251001-v1:0 (temp: 0, maxTokens: 2000)
```

Cross-region call:
```
[Settings] Judge config - region: eu-west-2, preset: anthropic.claude-opus-4-8, final: eu-west-2.anthropic.claude-opus-4-8
[Judge] Using model: eu-west-2.anthropic.claude-opus-4-8 (temp: 0, maxTokens: 2000)
```

## Benefits

✅ **No more validation errors** - Only valid models per region shown
✅ **Flexible region switching** - Change region, models auto-update
✅ **Cross-region support** - Advanced users can access models from other regions
✅ **Future-proof** - Easy to add new regions/models to MODEL_REGISTRY
✅ **User-friendly UI** - Settings dropdown always shows available options
✅ **Automatic formatting** - Region prefix applied transparently

## Migration Notes

If you have existing settings with model IDs saved in the old format:
- Old: `eu.anthropic.claude-sonnet-4-6`
- New: `anthropic.claude-sonnet-4-6`

The system will automatically normalize them:
1. extractBareModelId removes old `eu.` prefix
2. formatModelIdForRegion re-applies prefix only if cross-region
3. Settings are transparently migrated

No action needed - existing setups will work seamlessly.
