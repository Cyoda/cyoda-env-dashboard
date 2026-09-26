import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getOidcConfig, resetOidcConfigWarning, DEFAULT_SCOPES } from '../oidcConfig';

describe('getOidcConfig', () => {
  beforeEach(() => {
    resetOidcConfigWarning();
    vi.restoreAllMocks();
  });

  it('is disabled when neither issuer nor client id is set, without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getOidcConfig({})).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('is disabled with one warning naming the missing var when only one is set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getOidcConfig({ VITE_APP_OIDC_ISSUER: 'http://idp' })).toBeNull();
    expect(getOidcConfig({ VITE_APP_OIDC_ISSUER: 'http://idp' })).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('VITE_APP_OIDC_CLIENT_ID');
  });

  it('applies defaults', () => {
    expect(getOidcConfig({ VITE_APP_OIDC_ISSUER: ' http://idp ', VITE_APP_OIDC_CLIENT_ID: 'abc' })).toEqual({
      issuer: 'http://idp',
      clientId: 'abc',
      displayName: 'SSO',
      scopes: DEFAULT_SCOPES,
      extraParams: {},
      logoutUrl: undefined,
    });
  });

  it('reads display name, scopes, extra params and logout url', () => {
    const cfg = getOidcConfig({
      VITE_APP_OIDC_ISSUER: 'https://auth.cyoda.net/',
      VITE_APP_OIDC_CLIENT_ID: 'abc',
      VITE_APP_OIDC_DISPLAY_NAME: 'Auth0',
      VITE_APP_OIDC_SCOPES: 'openid offline_access',
      VITE_APP_OIDC_EXTRA_PARAMS: 'audience=https%3A%2F%2Fcloud.cyoda.com%2Fapi&organization=org_1',
      VITE_APP_OIDC_LOGOUT_URL: 'https://auth.cyoda.net/v2/logout?client_id=abc',
    });
    expect(cfg).toMatchObject({
      displayName: 'Auth0',
      scopes: 'openid offline_access',
      extraParams: { audience: 'https://cloud.cyoda.com/api', organization: 'org_1' },
      logoutUrl: 'https://auth.cyoda.net/v2/logout?client_id=abc',
    });
  });

  it('ignores non-string env values', () => {
    expect(getOidcConfig({ VITE_APP_OIDC_ISSUER: true, VITE_APP_OIDC_CLIENT_ID: 'abc' })).toBeNull();
  });
});
