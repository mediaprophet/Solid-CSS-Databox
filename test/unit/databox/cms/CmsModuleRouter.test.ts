import { CmsModuleRouter } from '../../../../src/databox/cms/CmsModuleRouter';

describe('A CmsModuleRouter', (): void => {
  const base = 'http://localhost';

  it('registers a handler and resolves it by method and URL.', (): void => {
    const router = new CmsModuleRouter<string>();
    router.register('GET', '/programs', 'list-programs');
    expect(router.resolve('GET', `${base}/.databox/cms/programs`)).toBe('list-programs');
  });

  it('is case-insensitive on the method.', (): void => {
    const router = new CmsModuleRouter<string>();
    router.register('get', '/programs', 'h');
    expect(router.resolve('GET', `${base}/.databox/cms/programs`)).toBe('h');
  });

  it('returns undefined when no route matches.', (): void => {
    const router = new CmsModuleRouter<string>();
    router.register('GET', '/programs', 'h');
    expect(router.resolve('POST', `${base}/.databox/cms/programs`)).toBeUndefined();
    expect(router.resolve('GET', `${base}/.databox/cms/nope`)).toBeUndefined();
  });

  it('rejects an empty method or path.', (): void => {
    const router = new CmsModuleRouter<string>();
    expect((): void => router.register('', '/x', 'h')).toThrow('non-empty method and path');
    expect((): void => router.register('GET', '', 'h')).toThrow('non-empty method and path');
  });

  it('rejects a duplicate route.', (): void => {
    const router = new CmsModuleRouter<string>();
    router.register('GET', '/x', 'h');
    expect((): void => router.register('GET', '/x', 'h2')).toThrow('already registered');
  });

  describe('relative()', (): void => {
    it('strips the base from a path under it.', (): void => {
      expect(new CmsModuleRouter().relative(`${base}/.databox/cms/programs`)).toBe('/programs');
    });

    it('maps the exact base path to the root subpath.', (): void => {
      expect(new CmsModuleRouter().relative(`${base}/.databox/cms`)).toBe('/');
    });

    it('leaves a path outside the base unchanged.', (): void => {
      expect(new CmsModuleRouter().relative(`${base}/other/thing`)).toBe('/other/thing');
    });

    it('treats an empty or root base as no base.', (): void => {
      expect(new CmsModuleRouter('').relative(`${base}/programs`)).toBe('/programs');
      expect(new CmsModuleRouter('/').relative(`${base}/programs`)).toBe('/programs');
    });

    it('normalises a base without a leading slash and with a trailing slash.', (): void => {
      expect(new CmsModuleRouter('cms').relative(`${base}/cms/x`)).toBe('/x');
      expect(new CmsModuleRouter('/cms/').relative(`${base}/cms/x`)).toBe('/x');
    });
  });
});
