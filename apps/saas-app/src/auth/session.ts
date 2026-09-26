import { HelperStorage } from '@cyoda/http-api-react';

export type AuthType = 'standard' | 'oidc';

/** Shape of the `cyoda_auth` storage entry. 'auth0' only appears in stale sessions. */
export interface AuthData {
  token: string;
  refreshToken?: string;
  user: string;
  userId?: string;
  legalEntityId?: string;
  type?: AuthType | 'auth0';
}

const helperStorage = new HelperStorage();

/**
 * True when a usable session is stored. A stale Auth0 session (from before the
 * OIDC migration) is removed and counts as logged out.
 */
export function isValidSession(): boolean {
  const auth = helperStorage.get<AuthData>('auth');
  if (!auth?.token) {
    return false;
  }
  if (auth.type === 'auth0') {
    helperStorage.remove('auth');
    return false;
  }
  return auth.type === undefined || auth.type === 'standard' || auth.type === 'oidc';
}

const LEGACY_AUTH0_PREFIX = '@@auth0spajs@@';

/** Removes the old @auth0/auth0-react cache, which holds refresh tokens. */
export function purgeLegacyAuth0Cache(storage: Storage = window.localStorage): void {
  Object.keys(storage)
    .filter((key) => key.startsWith(LEGACY_AUTH0_PREFIX))
    .forEach((key) => storage.removeItem(key));
}
