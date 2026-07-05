import { describe, expect, it } from 'vitest';

import {
  assertPublicHttpUrl,
  BlockedUrlError,
  isBlockedIp,
  safeFetch,
  type HostResolver,
} from '../url-guard.js';

describe('isBlockedIp', () => {
  it('blocks IPv4 loopback / private / link-local / reserved', () => {
    for (const ip of [
      '127.0.0.1',
      '127.5.6.7',
      '10.0.0.1',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // cloud metadata
      '100.64.0.1', // CGNAT
      '0.0.0.0',
      '255.255.255.255',
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it('allows public IPv4', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.0.1', '172.32.0.1']) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });

  it('blocks IPv6 loopback / unique-local / link-local / mapped-private', () => {
    for (const ip of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it('allows public IPv6 and mapped-public', () => {
    expect(isBlockedIp('2606:4700:4700::1111')).toBe(false);
    expect(isBlockedIp('::ffff:8.8.8.8')).toBe(false);
  });

  it('blocks non-IP strings defensively', () => {
    expect(isBlockedIp('not-an-ip')).toBe(true);
  });
});

const publicResolver: HostResolver = async () => ['93.184.216.34'];
const privateResolver: HostResolver = async () => ['169.254.169.254'];

describe('assertPublicHttpUrl', () => {
  it('rejects non-HTTP schemes', async () => {
    await expect(assertPublicHttpUrl('file:///etc/passwd', publicResolver)).rejects.toBeInstanceOf(
      BlockedUrlError,
    );
    await expect(assertPublicHttpUrl('gopher://x/1', publicResolver)).rejects.toBeInstanceOf(
      BlockedUrlError,
    );
  });

  it('rejects invalid URLs', async () => {
    await expect(assertPublicHttpUrl('not a url', publicResolver)).rejects.toBeInstanceOf(
      BlockedUrlError,
    );
  });

  it('blocks localhost and loopback/private IP literals', async () => {
    await expect(assertPublicHttpUrl('http://localhost/x', publicResolver)).rejects.toBeInstanceOf(
      BlockedUrlError,
    );
    await expect(assertPublicHttpUrl('http://127.0.0.1/x', publicResolver)).rejects.toBeInstanceOf(
      BlockedUrlError,
    );
    await expect(
      assertPublicHttpUrl('http://[::1]/x', publicResolver),
    ).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(
      assertPublicHttpUrl('http://169.254.169.254/latest/meta-data/', publicResolver),
    ).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it('blocks a public-looking host that resolves to a private address (rebinding)', async () => {
    await expect(
      assertPublicHttpUrl('http://evil.example.com/x', privateResolver),
    ).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it('allows a public host', async () => {
    const url = await assertPublicHttpUrl('https://example.com/openapi.json', publicResolver);
    expect(url.hostname).toBe('example.com');
  });
});

describe('safeFetch', () => {
  it('rejects before fetching when the initial URL is internal', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response('nope');
    }) as unknown as typeof fetch;
    await expect(
      safeFetch('http://169.254.169.254/', {}, { resolver: publicResolver, fetchImpl }),
    ).rejects.toBeInstanceOf(BlockedUrlError);
    expect(called).toBe(false);
  });

  it('blocks a redirect that points at an internal address', async () => {
    const fetchImpl = (async (input: string) => {
      if (input.includes('example.com')) {
        return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } });
      }
      return new Response('should not reach internal');
    }) as unknown as typeof fetch;
    await expect(
      safeFetch('https://example.com/', {}, { resolver: publicResolver, fetchImpl }),
    ).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it('returns the response for a public URL with no redirect', async () => {
    const fetchImpl = (async () => new Response('ok', { status: 200 })) as unknown as typeof fetch;
    const resp = await safeFetch(
      'https://example.com/spec.json',
      {},
      { resolver: publicResolver, fetchImpl },
    );
    expect(resp.status).toBe(200);
    expect(await resp.text()).toBe('ok');
  });
});
