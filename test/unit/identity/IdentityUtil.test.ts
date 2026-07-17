import { importOidcProvider } from '../../../src/identity/IdentityUtil';

describe('IdentityUtil', (): void => {
  it('avoids dynamic imports when testing with Jest.', async(): Promise<void> => {
    // `jest.requireActual` returns the module itself, while a dynamic import returns a promise
    const result = importOidcProvider();
    expect(result).not.toBeInstanceOf(Promise);

    const oidc = await result;
    expect(typeof oidc.default).toBe('function');
    expect(typeof oidc.interactionPolicy).toBe('object');
  });

  it('imports the oidc-provider package when not running jest.', async(): Promise<void> => {
    // We need to fool the IDP factory into thinking we are not in a test run
    const jestWorkerId = process.env.JEST_WORKER_ID;
    const nodeEnv = process.env.NODE_ENV;
    delete process.env.JEST_WORKER_ID;
    delete process.env.NODE_ENV;

    try {
      const result = importOidcProvider();
      expect(result).toBeInstanceOf(Promise);

      const oidc = await result;
      expect(typeof oidc.default).toBe('function');
      expect(typeof oidc.interactionPolicy).toBe('object');
    } finally {
      // Restore the environment even if an expectation above fails
      process.env.JEST_WORKER_ID = jestWorkerId;
      process.env.NODE_ENV = nodeEnv;
    }
  });
});
