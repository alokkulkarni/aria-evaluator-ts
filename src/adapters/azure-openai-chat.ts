// src/adapters/azure-openai-chat.ts
// Agent-under-test adapter for Azure OpenAI. The "agent" is a chat-completions
// deployment driven by a configurable system prompt; ARIA sends customer turns
// and the deployment's replies are the agent responses we evaluate.

import OpenAI, { AzureOpenAI } from 'openai';

import type { AdapterMessage, BaseAdapter, ConnectOptions } from './base.js';
import { AdapterError, SessionEndedError } from './base.js';

const DEFAULT_API_VERSION = '2024-10-21';

export interface AzureOpenAIChatAdapterConfig {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export class AzureOpenAIChatAdapter implements BaseAdapter {
  private readonly config: Required<AzureOpenAIChatAdapterConfig>;
  private readonly queue: AdapterMessage[] = [];
  private readonly resolvers: Array<(msg: AdapterMessage | null) => void> = [];
  private readonly messages: ChatMessage[] = [];
  private client: AzureOpenAI | null = null;
  private sessionId = '';
  private ended = false;

  constructor(config: AzureOpenAIChatAdapterConfig) {
    if (!config.endpoint) throw new AdapterError('AZURE_OPENAI_AGENT_ENDPOINT is required');
    if (!config.apiKey) throw new AdapterError('AZURE_OPENAI_AGENT_API_KEY is required');
    if (!config.deployment) throw new AdapterError('AZURE_OPENAI_AGENT_DEPLOYMENT is required');
    this.config = {
      endpoint: config.endpoint,
      apiKey: config.apiKey,
      deployment: config.deployment,
      apiVersion: config.apiVersion || DEFAULT_API_VERSION,
      systemPrompt: config.systemPrompt ?? '',
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 800,
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
    this.queue.length = 0;
    this.messages.length = 0;
    if (this.config.systemPrompt) {
      this.messages.push({ role: 'system', content: this.config.systemPrompt });
    }
    this.client = new AzureOpenAI({
      apiKey: this.config.apiKey,
      endpoint: this.config.endpoint,
      apiVersion: this.config.apiVersion,
      deployment: this.config.deployment,
    });
  }

  async sendMessage(content: string): Promise<void> {
    if (!this.sessionId || !this.client) throw new AdapterError('sendMessage called before connect()');
    if (this.ended) throw new SessionEndedError('Azure OpenAI session ended');

    this.messages.push({ role: 'user', content });

    let reply: string;
    try {
      const resp = await this.client.chat.completions.create({
        model: this.config.deployment,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        messages: this.messages,
      });
      reply = resp.choices[0]?.message?.content?.trim() ?? '';
    } catch (err) {
      throw new AdapterError(
        `Azure OpenAI request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!reply) throw new AdapterError('Azure OpenAI returned an empty response');

    this.messages.push({ role: 'assistant', content: reply });
    this.push({ role: 'agent', content: reply, isNoise: false, timestampMs: Date.now() });
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

  private push(msg: AdapterMessage): void {
    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      resolve(msg);
      return;
    }
    this.queue.push(msg);
  }
}
