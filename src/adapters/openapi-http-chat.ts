import type { AdapterMessage, BaseAdapter, ConnectOptions } from './base.js';
import { AdapterError, SessionEndedError } from './base.js';

export type OpenApiAuthType = 'none' | 'bearer' | 'apikey' | 'basic';

export interface OpenApiHttpChatAdapterConfig {
  endpoint: string;
  method?: 'POST' | 'PUT';
  authType?: OpenApiAuthType;
  authValue?: string;
  authHeaderName?: string; // for apikey: the header name to use (e.g. "X-API-Key")
  messageField?: string;
  responseField?: string;
  extraHeadersJson?: string;
}

export class OpenApiHttpChatAdapter implements BaseAdapter {
  private readonly config: Required<OpenApiHttpChatAdapterConfig>;
  private readonly queue: AdapterMessage[] = [];
  private readonly resolvers: Array<(msg: AdapterMessage | null) => void> = [];
  private readonly history: Array<{ role: 'customer' | 'agent'; content: string }> = [];
  private sessionId = '';
  private ended = false;
  private connectOptions: ConnectOptions | null = null;

  constructor(config: OpenApiHttpChatAdapterConfig) {
    this.config = {
      endpoint: config.endpoint,
      method: config.method ?? 'POST',
      authType: config.authType ?? 'none',
      authValue: config.authValue ?? '',
      authHeaderName: config.authHeaderName ?? 'X-API-Key',
      messageField: config.messageField ?? 'message',
      responseField: config.responseField ?? 'reply',
      extraHeadersJson: config.extraHeadersJson ?? '',
    };
  }

  get channel(): 'chat' {
    return 'chat';
  }

  get contactId(): string | null {
    return this.sessionId || null;
  }

  async connect(options: ConnectOptions): Promise<void> {
    this.sessionId = options.sessionId;
    this.connectOptions = options;
    this.ended = false;
    this.history.length = 0;
    this.queue.length = 0;
  }

  async sendMessage(content: string): Promise<void> {
    if (!this.sessionId) throw new AdapterError('sendMessage called before connect()');
    if (this.ended) throw new SessionEndedError('OpenAPI chat session ended');

    this.history.push({ role: 'customer', content });

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    this.applyAuth(headers);

    if (this.config.extraHeadersJson) {
      try {
        Object.assign(headers, JSON.parse(this.config.extraHeadersJson) as Record<string, string>);
      } catch {
        throw new AdapterError('OPENAPI_HEADERS_JSON must be valid JSON');
      }
    }

    const body: Record<string, unknown> = {
      sessionId: this.sessionId,
      channel: 'chat',
      customerId: this.connectOptions?.customerId ?? null,
      authenticated: this.connectOptions?.authenticated ?? false,
      scenarioName: this.connectOptions?.scenarioName ?? '',
      history: this.history,
    };
    body[this.config.messageField] = content;

    const resp = await fetch(this.config.endpoint, {
      method: this.config.method,
      headers,
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      throw new AdapterError(`OpenAPI chat endpoint failed (${resp.status})`);
    }
    const data = await resp.json() as Record<string, unknown>;
    const reply = extractStringField(data, this.config.responseField);
    if (!reply) throw new AdapterError(`OpenAPI chat response missing "${this.config.responseField}"`);

    this.history.push({ role: 'agent', content: reply });
    this.push({
      role: 'agent',
      content: reply,
      isNoise: false,
      timestampMs: Date.now(),
    });
  }

  async receive(timeoutMs = 40_000): Promise<AdapterMessage | null> {
    if (this.queue.length > 0) return this.queue.shift()!;
    return new Promise<AdapterMessage | null>((resolve) => {
      const timer = setTimeout(() => {
        const idx = this.resolvers.indexOf(resolve);
        if (idx >= 0) this.resolvers.splice(idx, 1);
        resolve(null);
      }, timeoutMs);
      this.resolvers.push((msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
    });
  }

  async disconnect(): Promise<void> {
    this.ended = true;
    this.queue.length = 0;
    while (this.resolvers.length > 0) {
      const resolver = this.resolvers.shift()!;
      resolver(null);
    }
  }

  private applyAuth(headers: Record<string, string>): void {
    const { authType, authValue, authHeaderName } = this.config;
    if (!authValue) return;
    switch (authType) {
      case 'bearer':
        headers['Authorization'] = `Bearer ${authValue}`;
        break;
      case 'apikey':
        headers[authHeaderName] = authValue;
        break;
      case 'basic':
        headers['Authorization'] = `Basic ${Buffer.from(authValue).toString('base64')}`;
        break;
      default:
        break;
    }
  }

  private push(msg: AdapterMessage): void {
    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      resolve(msg);
      return;
    }
    this.queue.push(msg);
  }
}

function extractStringField(obj: Record<string, unknown>, path: string): string {
  const value = path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
  return typeof value === 'string' ? value.trim() : '';
}
