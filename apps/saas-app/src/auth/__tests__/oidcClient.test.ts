import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  instances: [] as any[],
  setLevel: vi.fn(),
  setLogger: vi.fn(),
}));

vi.mock('oidc-client-ts', () => {
  class UserManager {
    settings: any;
    getUser = vi.fn();
    removeUser = vi.fn().mockResolvedValue(undefined);
    signinRedirect = vi.fn();
    signinRedirectCallback = vi.fn();
    signinSilent = vi.fn();
    storeUser = vi.fn().mockResolvedValue(undefined);
    signoutRedirect = vi.fn().mockResolvedValue(undefined);
    metadataService = { getEndSessionEndpoint: vi.fn() };
    constructor(settings: any) {
      this.settings = settings;
      mocks.instances.push(this);
    }
  }
  class WebStorageStateStore {
    constructor(public opts: any) {}
  }
  const Log = { WARN: 2, DEBUG: 4, setLevel: mocks.setLevel, setLogger: mocks.setLogger };
  return { UserManager, WebStorageStateStore, Log };
});

vi.mock('../oidcConfig', () => ({ getOidcConfig: vi.fn() }));

const DEFAULT_CONFIG = {
  issuer: 'http://idp',
  clientId: 'abc',
  displayName: 'Zitadel',
  scopes: 'openid offline_access',
  extraParams: { audience: 'api' },
  logoutUrl: undefined,
};

import { getOidcConfig } from '../oidcConfig';
import {
  isOidcEnabled, getOidcDisplayName, startLogin, completeLogin, refreshToken, logout, clearSession, resetOidcClient,
} from '../oidcClient';

const um = () => mocks.instances[mocks.instances.length - 1];
const user = (overrides: object = {}) => ({
  access_token: 'at-1',
  refresh_token: 'rt-1',
  id_token: 'id-1',
  expired: false,
  profile: { sub: 'sub-1', preferred_username: 'analyst' },
  ...overrides,
});
const auth = () => JSON.parse(localStorage.getItem('cyoda_auth') ?? 'null');

describe('oidcClient', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mocks.instances.length = 0;
    resetOidcClient();
    // Reset per test: the LOGOUT_URL test overrides the config.
    vi.mocked(getOidcConfig).mockReset().mockReturnValue(DEFAULT_CONFIG);
  });

  it('sets the library log level to WARN', () => {
    expect(mocks.setLevel).toHaveBeenCalledWith(2);
  });

  it('reports enabled state and display name', () => {
    expect(isOidcEnabled()).toBe(true);
    expect(getOidcDisplayName()).toBe('Zitadel');
  });

  it('configures UserManager without extraQueryParams and passes them to signinRedirect', async () => {
    await startLogin();
    const s = um().settings;
    expect(s).toMatchObject({
      authority: 'http://idp',
      client_id: 'abc',
      scope: 'openid offline_access',
      redirect_uri: `${window.location.origin}/oidc/callback`,
      post_logout_redirect_uri: `${window.location.origin}/login`,
      response_type: 'code',
      automaticSilentRenew: false,
    });
    expect(s.extraQueryParams).toBeUndefined();
    expect(s.userStore.opts.store).toBe(window.localStorage);
    expect(s.stateStore.opts.store).toBe(window.sessionStorage);
    expect(um().signinRedirect).toHaveBeenCalledWith({ extraQueryParams: { audience: 'api' } });
  });

  it('completeLogin rejects (not throws) when OIDC is not configured', () => {
    vi.mocked(getOidcConfig).mockReturnValue(null);

    let promise: Promise<void>;
    expect(() => {
      promise = completeLogin();
    }).not.toThrow();

    return expect(promise!).rejects.toThrow('OIDC login is not configured');
  });

  it('completeLogin writes cyoda_auth and shares one callback for repeated calls', async () => {
    await startLogin();
    um().signinRedirectCallback.mockResolvedValue(user());

    await Promise.all([completeLogin(), completeLogin()]);

    expect(um().signinRedirectCallback).toHaveBeenCalledTimes(1);
    expect(auth()).toEqual({ token: 'at-1', refreshToken: '', user: 'analyst', userId: 'sub-1', type: 'oidc' });
  });

  it('completeLogin strips scope and stores the user before writing cyoda_auth', async () => {
    await startLogin();
    um().signinRedirectCallback.mockResolvedValue(user({ scope: 'openid offline_access urn:x' }));

    await completeLogin();

    expect(um().storeUser).toHaveBeenCalledWith(expect.objectContaining({ scope: undefined, access_token: 'at-1' }));
    expect(auth()).toEqual({ token: 'at-1', refreshToken: '', user: 'analyst', userId: 'sub-1', type: 'oidc' });
  });

  it('completeLogin does not store the user when it has no scope', async () => {
    await startLogin();
    um().signinRedirectCallback.mockResolvedValue(user());

    await completeLogin();

    expect(um().storeUser).not.toHaveBeenCalled();
  });

  describe('refreshToken', () => {
    beforeEach(async () => {
      await startLogin();
      localStorage.setItem('cyoda_auth', JSON.stringify({ token: 'at-1', user: 'analyst', type: 'oidc' }));
    });

    it('runs the refresh grant and updates the token; concurrent calls share it', async () => {
      um().getUser.mockResolvedValue(user());
      um().signinSilent.mockResolvedValue(user({ access_token: 'at-2', refresh_token: 'rt-2' }));

      const [a, b] = await Promise.all([refreshToken('at-1'), refreshToken('at-1')]);

      expect(a).toBe('at-2');
      expect(b).toBe('at-2');
      expect(um().signinSilent).toHaveBeenCalledTimes(1);
      expect(auth().token).toBe('at-2');
    });

    it('omits scope from the refresh request by storing the user without scope before signinSilent', async () => {
      um().getUser.mockResolvedValue(user({ scope: 'openid offline_access urn:x' }));
      um().signinSilent.mockResolvedValue(user({ access_token: 'at-2', refresh_token: 'rt-2' }));

      await refreshToken('at-1');

      expect(um().storeUser).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: undefined,
          access_token: 'at-1',
          refresh_token: 'rt-1',
        }),
      );
      expect(um().storeUser.mock.invocationCallOrder[0]).toBeLessThan(
        um().signinSilent.mock.invocationCallOrder[0],
      );
    });

    it('does not store the user when it has no scope', async () => {
      um().getUser.mockResolvedValue(user());
      um().signinSilent.mockResolvedValue(user({ access_token: 'at-2', refresh_token: 'rt-2' }));

      await refreshToken('at-1');

      expect(um().storeUser).not.toHaveBeenCalled();
    });

    it('reuses a token another tab already stored, without calling the IdP', async () => {
      um().getUser.mockResolvedValue(user({ access_token: 'at-other-tab', expired: undefined }));

      await expect(refreshToken('at-1')).resolves.toBe('at-other-tab');
      expect(um().signinSilent).not.toHaveBeenCalled();
      expect(auth().token).toBe('at-other-tab');
    });

    it('rejects without signinSilent when there is no refresh token, and clears the session', async () => {
      um().getUser.mockResolvedValue(user({ refresh_token: undefined }));

      await expect(refreshToken('at-1')).rejects.toThrow('No refresh token');
      expect(um().signinSilent).not.toHaveBeenCalled();
      expect(um().removeUser).toHaveBeenCalled();
      expect(auth()).toBeNull();
    });

    it('treats a null signinSilent result as a failure', async () => {
      um().getUser.mockResolvedValue(user());
      um().signinSilent.mockResolvedValue(null);

      await expect(refreshToken('at-1')).rejects.toThrow();
      expect(auth()).toBeNull();
    });

    it('adopts tokens rotated by another tab when its own refresh fails', async () => {
      um().getUser
        .mockResolvedValueOnce(user())
        .mockResolvedValueOnce(user({ access_token: 'at-winner', refresh_token: 'rt-winner' }));
      um().signinSilent.mockRejectedValue(new Error('invalid_grant'));

      await expect(refreshToken('at-1')).resolves.toBe('at-winner');
      expect(um().removeUser).not.toHaveBeenCalled();
      expect(auth().token).toBe('at-winner');
    });

    it('clears and rejects when the refresh fails and nothing changed', async () => {
      um().getUser.mockResolvedValue(user());
      um().signinSilent.mockRejectedValue(new Error('invalid_grant'));

      await expect(refreshToken('at-1')).rejects.toThrow('invalid_grant');
      expect(um().removeUser).toHaveBeenCalled();
      expect(auth()).toBeNull();
    });

    it('clears and rejects when storeUser fails while stripping a legacy scope', async () => {
      um().getUser.mockResolvedValue(user({ scope: 'openid offline_access urn:x' }));
      um().storeUser.mockRejectedValueOnce(new Error('storage full'));

      await expect(refreshToken('at-1')).rejects.toThrow('storage full');
      expect(um().signinSilent).not.toHaveBeenCalled();
      expect(um().removeUser).toHaveBeenCalled();
      expect(auth()).toBeNull();
    });
  });

  describe('logout', () => {
    const originalLocation = window.location;

    beforeEach(async () => {
      await startLogin();
      localStorage.setItem('cyoda_auth', JSON.stringify({ token: 'at-1', user: 'analyst', type: 'oidc' }));
      Object.defineProperty(window, 'location', {
        value: { ...window.location, origin: window.location.origin, assign: vi.fn() },
        writable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
    });

    it('reads id_token before clearing, then redirects to end-session without awaiting', async () => {
      const order: string[] = [];
      um().getUser.mockImplementation(async () => { order.push('getUser'); return user(); });
      um().removeUser.mockImplementation(async () => { order.push('removeUser'); });
      um().metadataService.getEndSessionEndpoint.mockResolvedValue('http://idp/end');
      um().signoutRedirect.mockReturnValue(new Promise(() => {})); // never settles, like a real redirect

      await expect(logout()).resolves.toBe('redirecting');
      expect(order).toEqual(['getUser', 'removeUser']);
      expect(um().signoutRedirect).toHaveBeenCalledWith({ id_token_hint: 'id-1' });
      expect(auth()).toBeNull();
    });

    it('falls back to /login when signoutRedirect rejects later', async () => {
      um().getUser.mockResolvedValue(user());
      um().metadataService.getEndSessionEndpoint.mockResolvedValue('http://idp/end');
      um().signoutRedirect.mockRejectedValue(new Error('boom'));

      await expect(logout()).resolves.toBe('redirecting');
      await vi.waitFor(() => expect(window.location.assign).toHaveBeenCalledWith('/login'));
    });

    it('uses LOGOUT_URL when there is no end-session endpoint', async () => {
      vi.mocked(getOidcConfig).mockReturnValue({
        issuer: 'http://idp', clientId: 'abc', displayName: 'Auth0', scopes: 's', extraParams: {},
        logoutUrl: 'http://idp/v2/logout',
      });
      resetOidcClient();
      await startLogin();
      um().getUser.mockResolvedValue(user());
      um().metadataService.getEndSessionEndpoint.mockResolvedValue(undefined);

      await expect(logout()).resolves.toBe('redirecting');
      expect(window.location.assign).toHaveBeenCalledWith('http://idp/v2/logout');
      expect(um().signoutRedirect).not.toHaveBeenCalled();
    });

    it('is local when discovery fails and no LOGOUT_URL is set', async () => {
      um().getUser.mockResolvedValue(user());
      um().metadataService.getEndSessionEndpoint.mockRejectedValue(new Error('offline'));

      await expect(logout()).resolves.toBe('local');
      expect(window.location.assign).not.toHaveBeenCalled();
    });

    it('uses LOGOUT_URL when discovery fails', async () => {
      vi.mocked(getOidcConfig).mockReturnValue({
        issuer: 'http://idp', clientId: 'abc', displayName: 'Auth0', scopes: 's', extraParams: {},
        logoutUrl: 'http://idp/v2/logout',
      });
      resetOidcClient();
      await startLogin();
      um().getUser.mockResolvedValue(user());
      um().metadataService.getEndSessionEndpoint.mockRejectedValue(new Error('offline'));

      await expect(logout()).resolves.toBe('redirecting');
      expect(window.location.assign).toHaveBeenCalledWith('http://idp/v2/logout');
      expect(um().signoutRedirect).not.toHaveBeenCalled();
    });

    it('falls back to LOGOUT_URL when signoutRedirect rejects later', async () => {
      vi.mocked(getOidcConfig).mockReturnValue({
        issuer: 'http://idp', clientId: 'abc', displayName: 'Auth0', scopes: 's', extraParams: {},
        logoutUrl: 'http://idp/v2/logout',
      });
      resetOidcClient();
      await startLogin();
      um().getUser.mockResolvedValue(user());
      um().metadataService.getEndSessionEndpoint.mockResolvedValue('http://idp/end');
      um().signoutRedirect.mockRejectedValue(new Error('boom'));

      await expect(logout()).resolves.toBe('redirecting');
      await vi.waitFor(() => expect(window.location.assign).toHaveBeenCalledWith('http://idp/v2/logout'));
    });

    it('clearAll wipes all storage after reading the id_token', async () => {
      um().getUser.mockResolvedValue(user());
      um().metadataService.getEndSessionEndpoint.mockResolvedValue(undefined);
      localStorage.setItem('cyoda_other', '1');
      localStorage.setItem('unrelated', '1');

      await expect(logout({ clearAll: true })).resolves.toBe('local');
      expect(localStorage.length).toBe(0);
    });
  });

  it('clearSession removes the stored user and cyoda_auth', async () => {
    await startLogin();
    localStorage.setItem('cyoda_auth', '{"token":"t"}');
    await clearSession();
    expect(um().removeUser).toHaveBeenCalled();
    expect(auth()).toBeNull();
  });
});
