import { describe, it, expect, beforeEach } from 'vitest';
import { isValidSession, purgeLegacyAuth0Cache } from '../session';

const setAuth = (auth: object) => localStorage.setItem('cyoda_auth', JSON.stringify(auth));

describe('isValidSession', () => {
  beforeEach(() => localStorage.clear());

  it('is false without a stored session or token', () => {
    expect(isValidSession()).toBe(false);
    setAuth({ user: 'u', type: 'oidc' });
    expect(isValidSession()).toBe(false);
  });

  it.each(['standard', 'oidc', undefined])('accepts type %s', (type) => {
    setAuth({ token: 't', user: 'u', type });
    expect(isValidSession()).toBe(true);
  });

  it('removes a legacy auth0 session and treats it as invalid', () => {
    setAuth({ token: 't', user: 'u', type: 'auth0' });
    expect(isValidSession()).toBe(false);
    expect(localStorage.getItem('cyoda_auth')).toBeNull();
  });
});

describe('purgeLegacyAuth0Cache', () => {
  beforeEach(() => localStorage.clear());

  it('removes only @@auth0spajs@@ keys', () => {
    localStorage.setItem('@@auth0spajs@@::client::aud::openid', '{"refresh_token":"x"}');
    localStorage.setItem('@@auth0spajs@@::client::@@user@@', '{}');
    localStorage.setItem('cyoda_auth', '{"token":"t"}');
    localStorage.setItem('oidc.user:http://idp:abc', '{}');

    purgeLegacyAuth0Cache();

    expect(Object.keys(localStorage).sort()).toEqual(['cyoda_auth', 'oidc.user:http://idp:abc']);
  });
});
