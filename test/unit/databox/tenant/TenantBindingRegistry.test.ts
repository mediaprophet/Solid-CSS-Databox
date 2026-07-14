import type { TenantBinding } from '../../../../src/databox/tenant/TenantBindingRegistry';
import { InMemoryTenantBindingRegistry } from '../../../../src/databox/tenant/TenantBindingRegistry';
import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';
import { InternalServerError } from '../../../../src/util/errors/InternalServerError';

const NAMESPACE = 'https://databox.example/boxes/';

function binding(overrides: Partial<TenantBinding> = {}): TenantBinding {
  return {
    organisation: 'org-a',
    program: 'prog-a',
    origins: [ 'https://a.databox.example' ],
    audiences: [ 'aud-a' ],
    serviceIdentities: [ 'svc-a' ],
    storageNamespace: NAMESPACE,
    ...overrides,
  };
}

describe('An InMemoryTenantBindingRegistry', (): void => {
  let registry: InMemoryTenantBindingRegistry;

  beforeEach((): void => {
    registry = new InMemoryTenantBindingRegistry();
  });

  it('registers a tenant and resolves it by every program-bound fact.', (): void => {
    registry.register(binding());
    expect(registry.findByTenant('org-a', 'prog-a')).toEqual(binding());
    expect(registry.findByOrigin('https://a.databox.example')).toEqual(binding());
    expect(registry.findByAudience('aud-a')).toEqual(binding());
    expect(registry.findByServiceIdentity('svc-a')).toEqual(binding());
  });

  it('never reveals a binding for an unknown fact (no enumeration leak).', (): void => {
    registry.register(binding());
    expect(registry.findByTenant('org-x', 'prog-x')).toBeUndefined();
    expect(registry.findByOrigin('https://x.example')).toBeUndefined();
    expect(registry.findByAudience('aud-x')).toBeUndefined();
    expect(registry.findByServiceIdentity('svc-x')).toBeUndefined();
  });

  it('registers two distinct tenants without conflict.', (): void => {
    registry.register(binding());
    registry.register(binding({
      organisation: 'org-b',
      program: 'prog-b',
      origins: [ 'https://b.databox.example' ],
      audiences: [ 'aud-b' ],
      serviceIdentities: [ 'svc-b' ],
    }));
    expect(registry.findByServiceIdentity('svc-b')?.program).toBe('prog-b');
  });

  it('refuses to register the same tenant twice (no silent widening).', (): void => {
    registry.register(binding());
    expect((): void => registry.register(binding({ audiences: [ 'aud-extra' ]}))).toThrow(InternalServerError);
  });

  it.each([ 'organisation', 'program', 'storageNamespace' ] as const)(
    'fails closed on an empty %s.',
    (field): void => {
      expect((): void => registry.register(binding({ [field]: '' }))).toThrow(BadRequestHttpError);
    },
  );

  it.each([ 'origins', 'audiences', 'serviceIdentities' ] as const)(
    'fails closed on an empty value inside %s.',
    (field): void => {
      expect((): void => registry.register(binding({ [field]: [ '' ]}))).toThrow(BadRequestHttpError);
    },
  );

  it('refuses a cross-tenant origin — no platform-wide binding (T-31).', (): void => {
    registry.register(binding());
    expect((): void => registry.register(binding({
      organisation: 'org-b',
      program: 'prog-b',
      origins: [ 'https://a.databox.example' ],
      audiences: [ 'aud-b' ],
      serviceIdentities: [ 'svc-b' ],
    }))).toThrow(InternalServerError);
  });

  it('refuses a cross-tenant audience — no platform-wide binding (T-31).', (): void => {
    registry.register(binding());
    expect((): void => registry.register(binding({
      organisation: 'org-b',
      program: 'prog-b',
      origins: [ 'https://b.databox.example' ],
      audiences: [ 'aud-a' ],
      serviceIdentities: [ 'svc-b' ],
    }))).toThrow(InternalServerError);
  });

  it('refuses a cross-tenant service identity — the platform-wide-credential absence proof (T-31).', (): void => {
    registry.register(binding());
    expect((): void => registry.register(binding({
      organisation: 'org-b',
      program: 'prog-b',
      origins: [ 'https://b.databox.example' ],
      audiences: [ 'aud-b' ],
      serviceIdentities: [ 'svc-a' ],
    }))).toThrow(InternalServerError);
  });
});
