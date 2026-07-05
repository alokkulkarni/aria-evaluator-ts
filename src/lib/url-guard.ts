// src/lib/url-guard.ts
// SSRF / URL-egress guard.
//
// When the server fetches a URL supplied (directly or indirectly) by a user,
// an attacker can point it at internal services — cloud metadata endpoints
// (169.254.169.254), loopback, or private-network hosts. This module validates
// that a URL uses http(s) and resolves only to public addresses before any
// fetch, and re-validates every redirect hop (defeats redirect-based bypass and
// DNS-rebinding-to-redirect tricks).

import { lookup } from 'node:dns/promises';
import net from 'node:net';

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockedUrlError';
  }
}

/** Resolves a hostname to a list of IP-address literals. Injectable for tests. */
export type HostResolver = (hostname: string) => Promise<string[]>;

const defaultResolver: HostResolver = async (hostname) => {
  const results = await lookup(hostname, { all: true });
  return results.map((r) => r.address);
};

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    n = n * 256 + octet;
  }
  return n >>> 0;
}

function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true;
  const inRange = (base: string, bits: number): boolean => {
    const b = ipv4ToInt(base)!;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (b & mask);
  };
  return (
    inRange('0.0.0.0', 8) || // "this" network / 0.0.0.0
    inRange('10.0.0.0', 8) || // private
    inRange('100.64.0.0', 10) || // carrier-grade NAT
    inRange('127.0.0.0', 8) || // loopback
    inRange('169.254.0.0', 16) || // link-local (incl. cloud metadata 169.254.169.254)
    inRange('172.16.0.0', 12) || // private
    inRange('192.0.0.0', 24) || // IETF protocol assignments
    inRange('192.168.0.0', 16) || // private
    inRange('198.18.0.0', 15) || // benchmarking
    inRange('224.0.0.0', 4) || // multicast
    inRange('240.0.0.0', 4) // reserved (incl. 255.255.255.255 broadcast)
  );
}

function isBlockedIpv6(ip: string): boolean {
  const addr = (ip.toLowerCase().split('%')[0] ?? ''); // strip zone id
  if (addr === '::1' || addr === '::') return true; // loopback / unspecified
  const mapped = addr.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isBlockedIpv4(mapped[1]!); // IPv4-mapped
  if (/^f[cd]/.test(addr)) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(addr)) return true; // fe80::/10 link-local
  return false;
}

/** True if `ip` is a loopback/private/link-local/reserved (SSRF-unsafe) address. */
export function isBlockedIp(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return isBlockedIpv4(ip);
  if (kind === 6) return isBlockedIpv6(ip);
  return true; // not a valid IP literal → block defensively
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
]);

/**
 * Validates that `rawUrl` is an http(s) URL whose host resolves only to public
 * addresses. Returns the parsed URL, or throws {@link BlockedUrlError}.
 */
export async function assertPublicHttpUrl(
  rawUrl: string,
  resolver: HostResolver = defaultResolver,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BlockedUrlError(`Blocked non-HTTP URL scheme: ${url.protocol}`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  if (BLOCKED_HOSTNAMES.has(host.toLowerCase())) {
    throw new BlockedUrlError(`Blocked host: ${host}`);
  }
  let addresses: string[];
  if (net.isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = await resolver(host);
    } catch {
      throw new BlockedUrlError(`Could not resolve host: ${host}`);
    }
  }
  if (addresses.length === 0) {
    throw new BlockedUrlError(`Host did not resolve: ${host}`);
  }
  for (const addr of addresses) {
    if (isBlockedIp(addr)) {
      throw new BlockedUrlError(`Host ${host} resolves to blocked address ${addr}`);
    }
  }
  return url;
}

export interface SafeFetchOptions {
  /** Maximum redirect hops to follow (each re-validated). Default 3. */
  maxRedirects?: number;
  /** Injectable resolver (tests). */
  resolver?: HostResolver;
  /** Injectable fetch (tests). */
  fetchImpl?: typeof fetch;
}

/**
 * SSRF-safe replacement for `fetch()` when the URL is user-influenced. Validates
 * the URL (and every redirect target) against {@link assertPublicHttpUrl} before
 * making the request. Redirects are followed manually so each hop is checked.
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
  opts: SafeFetchOptions = {},
): Promise<Response> {
  const maxRedirects = opts.maxRedirects ?? 3;
  const doFetch = opts.fetchImpl ?? fetch;
  let currentUrl = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicHttpUrl(currentUrl, opts.resolver);
    const resp = await doFetch(currentUrl, { ...init, redirect: 'manual' });
    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get('location');
      if (!location) return resp;
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    return resp;
  }
  throw new BlockedUrlError(`Too many redirects (> ${maxRedirects})`);
}
