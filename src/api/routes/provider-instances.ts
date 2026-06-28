import { Router } from 'express';
import {
  listInstances,
  getInstance,
  createInstance,
  updateInstance,
  deleteInstance,
  ProviderInstanceError,
} from '../provider-instances.js';
import { recordAuditEventSafe } from '../audit-log.js';
import { MAX_INSTANCES_PER_PROVIDER, PROVIDER_DEFS, RUN_PROVIDERS } from '../../shared/provider-fields.js';

export const providerInstancesRouter = Router();

function handleError(err: unknown, res: import('express').Response): void {
  if (err instanceof ProviderInstanceError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: (err as Error).message });
}

// Static metadata so the UI can render editors/selectors without hard-coding fields.
providerInstancesRouter.get('/meta', (_req, res) => {
  res.json({
    providers: RUN_PROVIDERS.map((type) => PROVIDER_DEFS[type]),
    maxPerProvider: MAX_INSTANCES_PER_PROVIDER,
  });
});

providerInstancesRouter.get('/', async (req, res) => {
  try {
    const provider = typeof req.query['provider'] === 'string' ? req.query['provider'] : undefined;
    res.json({ instances: await listInstances(provider) });
  } catch (err) {
    handleError(err, res);
  }
});

providerInstancesRouter.get('/:id', async (req, res) => {
  try {
    res.json({ instance: await getInstance(req.params.id) });
  } catch (err) {
    handleError(err, res);
  }
});

providerInstancesRouter.post('/', async (req, res) => {
  try {
    const body = (req.body ?? {}) as {
      providerType?: string;
      nickname?: string;
      config?: Record<string, unknown>;
      isDefault?: boolean;
    };
    const instance = await createInstance({
      providerType: body.providerType ?? '',
      nickname: body.nickname ?? '',
      config: body.config,
      isDefault: body.isDefault,
    });
    await recordAuditEventSafe(req, 'provider-instance.create', instance.id, {
      providerType: instance.providerType,
      nickname: instance.nickname,
    });
    res.status(201).json({ instance });
  } catch (err) {
    handleError(err, res);
  }
});

providerInstancesRouter.put('/:id', async (req, res) => {
  try {
    const body = (req.body ?? {}) as {
      nickname?: string;
      config?: Record<string, unknown>;
      isDefault?: boolean;
    };
    const instance = await updateInstance(req.params.id, body);
    await recordAuditEventSafe(req, 'provider-instance.update', instance.id, {
      providerType: instance.providerType,
      nickname: instance.nickname,
    });
    res.json({ instance });
  } catch (err) {
    handleError(err, res);
  }
});

providerInstancesRouter.delete('/:id', async (req, res) => {
  try {
    await deleteInstance(req.params.id);
    await recordAuditEventSafe(req, 'provider-instance.delete', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    handleError(err, res);
  }
});
