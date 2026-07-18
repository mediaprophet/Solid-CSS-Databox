import { planHosting } from '../../../../../../src/databox/cms/modules/hosting/HostingConfig';

describe('planHosting', (): void => {
  it('derives databox + devices hosts, baseUrl and an A record from an IPv4 origin.', (): void => {
    const plan = planHosting({ apexDomain: 'acme.org', originTarget: '203.0.113.7' });
    expect(plan.databoxHost).toBe('databox.acme.org');
    expect(plan.devicesHost).toBe('devices.acme.org');
    expect(plan.wwwHost).toBeUndefined();
    expect(plan.baseUrl).toBe('https://databox.acme.org/');
    expect(plan.launchCommand).toContain('--baseUrl https://databox.acme.org/');
    expect(plan.dnsRecords).toEqual([
      { type: 'A', name: 'databox.acme.org', content: '203.0.113.7', proxied: true, ttl: 1 },
      { type: 'A', name: 'devices.acme.org', content: '203.0.113.7', proxied: false, ttl: 1 },
    ]);
  });

  it('always emits the devices host non-proxied, even when databox is proxied.', (): void => {
    const plan = planHosting({ apexDomain: 'acme.org', originTarget: '203.0.113.7', proxied: true });
    const devices = plan.dnsRecords.find((record): boolean => record.name === 'devices.acme.org');
    expect(devices?.proxied).toBe(false);
  });

  it('honours a custom databox label and a disabled proxy.', (): void => {
    const plan = planHosting({
      apexDomain: 'acme.org',
      databoxLabel: 'pod',
      originTarget: '203.0.113.7',
      proxied: false,
    });
    expect(plan.databoxHost).toBe('pod.acme.org');
    expect(plan.dnsRecords[0]).toEqual(
      { type: 'A', name: 'pod.acme.org', content: '203.0.113.7', proxied: false, ttl: 1 },
    );
  });

  it('adds a www record when enabled.', (): void => {
    const plan = planHosting({ apexDomain: 'acme.org', originTarget: '203.0.113.7', wwwEnabled: true });
    expect(plan.wwwHost).toBe('www.acme.org');
    expect(plan.dnsRecords).toHaveLength(3);
    expect(plan.dnsRecords[2].name).toBe('www.acme.org');
  });

  it('uses an AAAA record for an IPv6 origin and a CNAME for a hostname.', (): void => {
    expect(planHosting({ apexDomain: 'acme.org', originTarget: '2001:db8::1' }).dnsRecords[0].type).toBe('AAAA');
    expect(planHosting({ apexDomain: 'acme.org', originTarget: 'host.example.net' }).dnsRecords[0].type)
      .toBe('CNAME');
  });

  it('rejects an invalid apex domain or an empty origin.', (): void => {
    expect((): unknown => planHosting({ apexDomain: 'acme', originTarget: '203.0.113.7' }))
      .toThrow('apex domain');
    expect((): unknown => planHosting({ apexDomain: '  ', originTarget: '203.0.113.7' }))
      .toThrow('apex domain');
    expect((): unknown => planHosting({ apexDomain: 'acme.org', originTarget: '   ' }))
      .toThrow('origin target');
  });
});
