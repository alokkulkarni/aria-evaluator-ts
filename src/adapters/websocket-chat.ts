import WebSocket from 'ws';
import type { AdapterMessage, BaseAdapter, ConnectOptions } from './base.js';
import { AdapterError, SessionEndedError } from './base.js';

export interface WebSocketChatAdapterConfig {
  url: string;
  authHeaderName?: string;
  authHeaderValue?: string;
  /** WebSocket sub-protocol (e.g. "chat", "json") */
  subprotocol?: string;
  /** JSON string sent immediately after the socket opens (optional handshake) */
  initJson?: string;
  /**
   * Template for outgoing messages. Use {{message}} as placeholder.
   * The placeholder is always JSON-string-escaped before substitution so the
   * result is safe inside a JSON object.
   * If empty, the message text is sent as a raw text frame.
   */
  sendTemplate?: string;
  /**
   * Comma-separated event type values (from the JSON "type" field) that should
   * be treated as agent replies. If empty, all non-empty text frames are accepted.
   */
  agentEventTypes?: string;
  /**
   * Dot-notation path to extract the reply text from the JSON payload
   * (e.g. "body.text" or "message.content").
   * If empty, the raw text frame content is used as-is.
   */
  messagePath?: string;
}

interface PendingReceive {
  resolve: (msg: AdapterMessage | null) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class WebSocketChatAdapter implements BaseAdapter {
  private readonly config: Required<WebSocketChatAdapterConfig>;
  private ws: WebSocket | null = null;
  private ended = false;
  private endReason = 'Session ended';
  private sessionId = '';
  private queue: AdapterMessage[] = [];
  private pending: PendingReceive[] = [];

  constructor(config: WebSocketChatAdapterConfig) {
    this.config = {
      url: config.url,
      authHeaderName: config.authHeaderName ?? '',
      authHeaderValue: config.authHeaderValue ?? '',
      subprotocol: config.subprotocol ?? '',
      initJson: config.initJson ?? '',
      sendTemplate: config.sendTemplate ?? '',
      agentEventTypes: config.agentEventTypes ?? '',
      messagePath: config.messagePath ?? '',
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
    this.ended = false;
    this.endReason = 'Session ended';
    this.queue = [];
    this.pending = [];

    if (this.config.initJson.trim()) {
      try {
        JSON.parse(this.config.initJson);
      } catch {
        throw new AdapterError('WS_CHAT_INIT_JSON is not valid JSON');
      }
    }

    const wsOptions: WebSocket.ClientOptions = {};
    if (this.config.authHeaderName && this.config.authHeaderValue) {
      wsOptions.headers = { [this.config.authHeaderName]: this.config.authHeaderValue };
    }
    const protocols = this.config.subprotocol.trim()
      ? [this.config.subprotocol.trim()]
      : undefined;

    this.ws = protocols
      ? new WebSocket(this.config.url, protocols, wsOptions)
      : new WebSocket(this.config.url, wsOptions);

    await waitForSocketOpen(this.ws, 12_000);

    this.ws.on('message', (data, isBinary) => this.handleMessage(data, isBinary));
    this.ws.on('close', (_code, reasonBuf) => {
      this.ended = true;
      const reason = Buffer.isBuffer(reasonBuf) ? reasonBuf.toString('utf-8') : String(reasonBuf ?? '');
      this.endReason = reason || 'WebSocket closed';
      this.flushError(new SessionEndedError(this.endReason));
    });
    this.ws.on('error', (err) => {
      this.ended = true;
      this.endReason = `WebSocket error: ${err.message}`;
      this.flushError(new SessionEndedError(this.endReason));
    });

    if (this.config.initJson.trim()) {
      this.ws.send(this.config.initJson.trim());
    }
  }

  async sendMessage(content: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new AdapterError('WebSocket chat is not connected');
    }
    if (this.ended) throw new SessionEndedError(this.endReason);

    const template = this.config.sendTemplate.trim();
    if (!template) {
      this.ws.send(content);
    } else {
      // JSON-escape the message so it is safe inside a JSON string field
      const escaped = escapeJsonString(content);
      this.ws.send(template.replaceAll('{{message}}', escaped));
    }
  }

  async receive(timeoutMs = 40_000): Promise<AdapterMessage | null> {
    if (this.queue.length > 0) return this.queue.shift()!;
    if (this.ended) throw new SessionEndedError(this.endReason);

    return new Promise<AdapterMessage | null>((resolve, reject) => {
      const entry: PendingReceive = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const idx = this.pending.indexOf(entry);
          if (idx >= 0) this.pending.splice(idx, 1);
          resolve(null); // timeout → null (per BaseAdapter contract)
        }, timeoutMs),
      };
      this.pending.push(entry);
    });
  }

  async disconnect(): Promise<void> {
    this.ended = true;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    this.ws = null;
    this.flushResolve(null);
  }

  private handleMessage(data: WebSocket.RawData, isBinary: boolean): void {
    if (isBinary) return;

    const text = Buffer.isBuffer(data) ? data.toString('utf-8') : String(data);
    if (!text.trim()) return;

    const usePath = this.config.messagePath.trim();
    const allowedTypes = new Set(
      this.config.agentEventTypes.split(',').map((s) => s.trim()).filter(Boolean),
    );

    // If no messagePath set, treat frame as raw text
    if (!usePath) {
      const content = text.trim();
      if (!content) return;
      this.push({ role: 'agent', content, isNoise: false, timestampMs: Date.now() });
      return;
    }

    // Parse as JSON and extract via dot-path
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      // Non-JSON frame with messagePath configured — fall back to raw text
      this.push({ role: 'agent', content: text.trim(), isNoise: false, timestampMs: Date.now() });
      return;
    }

    // Event-type filtering
    if (allowedTypes.size > 0) {
      const type = typeof payload['type'] === 'string' ? payload['type'] : '';
      if (!allowedTypes.has(type)) return;
    }

    const reply = extractPath(payload, usePath);
    if (!reply) return;
    this.push({ role: 'agent', content: reply, isNoise: false, timestampMs: Date.now() });
  }

  private push(msg: AdapterMessage): void {
    if (this.pending.length > 0) {
      const entry = this.pending.shift()!;
      clearTimeout(entry.timer);
      entry.resolve(msg);
      return;
    }
    this.queue.push(msg);
  }

  private flushResolve(msg: AdapterMessage | null): void {
    while (this.pending.length > 0) {
      const entry = this.pending.shift()!;
      clearTimeout(entry.timer);
      entry.resolve(msg);
    }
  }

  private flushError(err: Error): void {
    while (this.pending.length > 0) {
      const entry = this.pending.shift()!;
      clearTimeout(entry.timer);
      entry.reject(err);
    }
  }
}

function waitForSocketOpen(ws: WebSocket, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new AdapterError('WebSocket connect timeout')),
      timeoutMs,
    );
    ws.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
    ws.once('error', (err) => {
      clearTimeout(timer);
      reject(new AdapterError(`WebSocket connect failed: ${err.message}`));
    });
  });
}

function extractPath(payload: Record<string, unknown>, path: string): string {
  const value = path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, payload);
  return typeof value === 'string' ? value.trim() : '';
}

function escapeJsonString(input: string): string {
  // Remove surrounding quotes that JSON.stringify adds
  return JSON.stringify(input).slice(1, -1);
}
