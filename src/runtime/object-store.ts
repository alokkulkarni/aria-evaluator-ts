// src/runtime/object-store.ts
// Object-storage abstraction for run artifacts (reports, transcripts, audio, run
// logs, runtime settings). Phase 2 of the multi-tenant migration moves these off
// each task's local filesystem so any autoscaled instance can read what another
// instance wrote. Keys are artifact refs, e.g. "reports/report_2026-..-..html".
//
//   LocalObjectStore — roots keys under the managed state dir (current behavior;
//                      used for local dev and as a fallback).
//   S3ObjectStore    — stores under s3://$AWS_S3_STATE_BUCKET/$AWS_S3_STATE_PREFIX/<key>.
//
// Tenant-prefixing of keys (s3://…/<tenantId>/…) is layered on in Phase 3 once the
// per-request tenant context is wired. See docs/MULTI_TENANT_SPEC.md.

import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { appPaths } from './paths.js';

export interface ObjectStore {
  put(key: string, body: Buffer | string, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  getStream(key: string): Promise<Readable | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
  /** A time-limited read URL, or null when unsupported (local store). */
  presignedUrl(key: string, expiresSeconds?: number): Promise<string | null>;
}

class LocalObjectStore implements ObjectStore {
  constructor(private readonly root: string) {}
  private resolve(key: string): string {
    return join(this.root, key);
  }

  async put(key: string, body: Buffer | string): Promise<void> {
    const p = this.resolve(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body);
  }
  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolve(key));
    } catch {
      return null;
    }
  }
  async getStream(key: string): Promise<Readable | null> {
    const p = this.resolve(key);
    return existsSync(p) ? createReadStream(p) : null;
  }
  async exists(key: string): Promise<boolean> {
    return existsSync(this.resolve(key));
  }
  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
  async list(prefix: string): Promise<string[]> {
    try {
      const names = await readdir(this.resolve(prefix), { recursive: true });
      const base = prefix.replace(/\/$/, '');
      return names.map((n) => `${base}/${String(n).replace(/\\/g, '/')}`);
    } catch {
      return [];
    }
  }
  async presignedUrl(): Promise<string | null> {
    return null;
  }
}

class S3ObjectStore implements ObjectStore {
  private readonly client: S3Client;
  private readonly prefix: string;
  constructor(
    private readonly bucket: string,
    prefix: string,
  ) {
    this.client = new S3Client({});
    this.prefix = prefix.replace(/\/$/, '');
  }
  private fullKey(key: string): string {
    return this.prefix ? `${this.prefix}/${key}` : key;
  }
  async put(key: string, body: Buffer | string, contentType?: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.fullKey(key),
        Body: typeof body === 'string' ? Buffer.from(body) : body,
        ContentType: contentType,
      }),
    );
  }
  async get(key: string): Promise<Buffer | null> {
    try {
      const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.fullKey(key) }));
      if (!r.Body) return null;
      return Buffer.from(await r.Body.transformToByteArray());
    } catch {
      return null;
    }
  }
  async getStream(key: string): Promise<Readable | null> {
    try {
      const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.fullKey(key) }));
      return (r.Body as Readable | undefined) ?? null;
    } catch {
      return null;
    }
  }
  async exists(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }
  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.fullKey(key) }));
  }
  async list(prefix: string): Promise<string[]> {
    const out: string[] = [];
    let token: string | undefined;
    do {
      const r = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: this.fullKey(prefix), ContinuationToken: token }),
      );
      for (const o of r.Contents ?? []) {
        if (!o.Key) continue;
        out.push(this.prefix ? o.Key.slice(this.prefix.length + 1) : o.Key);
      }
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
    return out;
  }
  async presignedUrl(key: string, expiresSeconds = 900): Promise<string | null> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: this.fullKey(key) }), {
      expiresIn: expiresSeconds,
    });
  }
}

let store: ObjectStore | null = null;

/** The process-wide object store: S3 when AWS_S3_STATE_BUCKET is set, else local. */
export function getObjectStore(): ObjectStore {
  if (store) return store;
  const bucket = process.env['AWS_S3_STATE_BUCKET']?.trim();
  if (bucket) {
    store = new S3ObjectStore(bucket, process.env['AWS_S3_STATE_PREFIX']?.trim() ?? 'aria-evaluator');
  } else {
    store = new LocalObjectStore(appPaths.managedStateRoot);
  }
  return store;
}
