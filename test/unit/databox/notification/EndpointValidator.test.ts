import type { HostResolver } from '../../../../src/databox/notification/EndpointValidator';
import { SsrfSafeEndpointValidator } from '../../../../src/databox/notification/EndpointValidator';

/** A resolver that maps a fixed host to fixed IPs; the network is NEVER touched. */
function resolverOf(map: Record<string, readonly string[]>): HostResolver {
  return async(host: string): Promise<readonly string[]> => map[host] ?? [];
}

function validator(map: Record<string, readonly string[]> = {}): SsrfSafeEndpointValidator {
  return new SsrfSafeEndpointValidator({ resolver: resolverOf(map) });
}

describe('SsrfSafeEndpointValidator scheme + URL', (): void => {
  it('rejects a malformed URL.', async(): Promise<void> => {
    await expect(validator().validate('not a url')).rejects.toThrow('valid URL');
  });

  it('rejects a non-HTTPS scheme (http, ftp, file).', async(): Promise<void> => {
    await expect(validator().validate('http://example.com/hook')).rejects.toThrow('HTTPS only');
    await expect(validator().validate('ftp://example.com/hook')).rejects.toThrow('HTTPS only');
    await expect(validator().validate('file:///etc/passwd')).rejects.toThrow('HTTPS only');
  });

  it('honours a custom scheme allowlist.', async(): Promise<void> => {
    const custom = new SsrfSafeEndpointValidator({ resolver: resolverOf({}), allowedSchemes: [ 'http:' ]});
    await expect(custom.validate('http://93.184.216.34/hook')).resolves.toStrictEqual([ '93.184.216.34' ]);
  });

  it('fails closed on a URL with an empty host.', async(): Promise<void> => {
    const custom = new SsrfSafeEndpointValidator({ resolver: resolverOf({}), allowedSchemes: [ 'foo:' ]});
    await expect(custom.validate('foo:///bar')).rejects.toThrow('no host');
  });
});

describe('SsrfSafeEndpointValidator IPv4 literals', (): void => {
  it.each([
    [ 'loopback', 'https://127.0.0.1/hook' ],
    [ 'this-host', 'https://0.0.0.0/hook' ],
    [ 'rfc1918-10', 'https://10.1.2.3/hook' ],
    [ 'rfc1918-172', 'https://172.16.0.1/hook' ],
    [ 'rfc1918-192', 'https://192.168.1.1/hook' ],
    [ 'cgnat', 'https://100.64.0.1/hook' ],
    [ 'link-local', 'https://169.254.1.1/hook' ],
    [ 'cloud-metadata', 'https://169.254.169.254/latest/meta-data/' ],
    [ 'protocol-assignments', 'https://192.0.0.1/hook' ],
    [ 'benchmarking-198.18', 'https://198.18.0.1/hook' ],
    [ 'benchmarking-198.19', 'https://198.19.255.1/hook' ],
    [ 'multicast', 'https://224.0.0.1/hook' ],
    [ 'reserved-240', 'https://240.0.0.1/hook' ],
  ])('blocks the %s address.', async(_label: string, url: string): Promise<void> => {
    await expect(validator().validate(url)).rejects.toThrow('SSRF');
  });

  it.each([
    [ 'decimal', 'https://2130706433/hook' ],
    [ 'hex-octet', 'https://0x7f.0.0.1/hook' ],
    [ 'octal-octet', 'https://0177.0.0.1/hook' ],
    [ 'short-form', 'https://127.1/hook' ],
  ])('blocks alternate-encoded loopback %s (URL normalises to 127.0.0.1).', async(_l: string, url): Promise<void> => {
    await expect(validator().validate(url)).rejects.toThrow('SSRF');
  });

  it('allows a public IPv4 literal without resolving.', async(): Promise<void> => {
    await expect(validator().validate('https://93.184.216.34/hook')).resolves.toStrictEqual([ '93.184.216.34' ]);
  });

  it('rejects a resolved out-of-range IPv4 octet (invalid literal -> fail closed).', async(): Promise<void> => {
    // A resolved '256.1.1.1' is not a valid IPv4 literal and not an IPv6 -> unclassifiable -> blocked.
    await expect(validator({ 'oor.example': [ '256.1.1.1' ]}).validate('https://oor.example/hook'))
      .rejects.toThrow('SSRF');
  });
});

describe('SsrfSafeEndpointValidator IPv6 literals', (): void => {
  it.each([
    [ 'loopback', 'https://[::1]/hook' ],
    [ 'unspecified', 'https://[::]/hook' ],
    [ 'link-local', 'https://[fe80::1]/hook' ],
    [ 'unique-local', 'https://[fc00::1]/hook' ],
    [ 'unique-local-fd', 'https://[fd12:3456::1]/hook' ],
    [ 'v4-mapped-metadata', 'https://[::ffff:169.254.169.254]/hook' ],
    [ 'v4-compatible-loopback', 'https://[::127.0.0.1]/hook' ],
    [ 'v4-compatible-rfc1918', 'https://[::10.0.0.5]/hook' ],
    [ 'nat64', 'https://[64:ff9b::1.2.3.4]/hook' ],
  ])('blocks the %s address.', async(_label: string, url: string): Promise<void> => {
    await expect(validator().validate(url)).rejects.toThrow('SSRF');
  });

  it('allows a public IPv6 literal.', async(): Promise<void> => {
    await expect(validator().validate('https://[2606:2800:220:1:248:1893:25c8:1946]/hook'))
      .resolves.toHaveLength(1);
  });

  it('allows a public IPv4-mapped IPv6 literal.', async(): Promise<void> => {
    await expect(validator().validate('https://[::ffff:93.184.216.34]/hook')).resolves.toHaveLength(1);
  });

  it('treats a malformed IPv6 literal as a name (does not resolve here).', async(): Promise<void> => {
    // Too many '::' groups / bad hextet -> not a parseable IP, so it is resolved as a host name.
    await expect(validator({ 'gggg::1': []}).validate('https://[gggg::1]/hook')).rejects.toThrow('valid URL');
  });
});

describe('SsrfSafeEndpointValidator DNS resolution', (): void => {
  it('rejects a name that does not resolve.', async(): Promise<void> => {
    await expect(validator({}).validate('https://nowhere.example/hook')).rejects.toThrow('did not resolve');
  });

  it('rejects a name that resolves to a private address (DNS rebinding).', async(): Promise<void> => {
    const val = validator({ 'evil.example': [ '93.184.216.34', '10.0.0.5' ]});
    await expect(val.validate('https://evil.example/hook')).rejects.toThrow('SSRF');
  });

  it('rejects a name that resolves to an unparseable address (fail closed).', async(): Promise<void> => {
    const val = validator({ 'weird.example': [ 'not-an-ip' ]});
    await expect(val.validate('https://weird.example/hook')).rejects.toThrow('SSRF');
  });

  it('allows a name that resolves only to public addresses.', async(): Promise<void> => {
    const val = validator({ 'good.example': [ '93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946' ]});
    await expect(val.validate('https://good.example/hook')).resolves.toHaveLength(2);
  });

  it('allows a public IPv6 that uses a "::" run (compressed form).', async(): Promise<void> => {
    const val = validator({ 'v6.example': [ '2606:2800::1946' ]});
    await expect(val.validate('https://v6.example/hook')).resolves.toHaveLength(1);
  });

  it('folds a resolved embedded-IPv4 tail: public tail allowed, metadata tail blocked.', async(): Promise<void> => {
    // A dotted embedded-IPv4 tail only reaches the parser via a RESOLVED address (the URL constructor
    // normalises a literal away from dotted form), exercising the fold branch.
    await expect(validator({ 'm.example': [ '::ffff:8.8.8.8' ]}).validate('https://m.example/hook'))
      .resolves.toHaveLength(1);
    await expect(validator({ 'm.example': [ '::ffff:169.254.169.254' ]}).validate('https://m.example/hook'))
      .rejects.toThrow('SSRF');
  });

  it('strips an IPv6 zone id (resolved fe80::1%eth0 is still blocked link-local).', async(): Promise<void> => {
    await expect(validator({ 'z.example': [ 'fe80::1%eth0' ]}).validate('https://z.example/hook'))
      .rejects.toThrow('SSRF');
  });

  // These malformed IP strings can only reach the parser via RESOLVED addresses (the URL constructor would
  // reject a malformed literal in the URL itself). Each exercises a distinct fail-closed parser branch and,
  // being unparseable, is treated as blocked (SSRF).
  it.each([
    [ 'double "::" run', '1:2:3::4::5' ],
    [ 'bad embedded v4', '::ffff:999.1.1.1' ],
    [ 'bad hextet', '::gg' ],
    [ 'too many groups, no "::"', '1:2:3:4:5:6:7:8:9' ],
    [ 'over-long with "::"', '1:2:3:4:5:6:7:8::9' ],
  ])('rejects a resolved %s address (fail closed).', async(_label: string, ip: string): Promise<void> => {
    await expect(validator({ 'x.example': [ ip ]}).validate('https://x.example/hook')).rejects.toThrow('SSRF');
  });

  it('allows a resolved TEST-NET 192.0.2/24 address (only 192.0.0/24 stays blocked).', async(): Promise<void> => {
    await expect(validator({ 'tn.example': [ '192.0.2.5' ]}).validate('https://tn.example/hook'))
      .resolves.toStrictEqual([ '192.0.2.5' ]);
  });
});
