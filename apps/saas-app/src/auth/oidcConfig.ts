/**
 * Build-time OIDC provider configuration (one provider per build).
 * The only reader of VITE_APP_OIDC_*.
 */

export interface OidcConfig {
  issuer: string;
  clientId: string;
  displayName: string;
  scopes: string;
  extraParams: Record<string, string>;
  logoutUrl?: string;
}

export const DEFAULT_SCOPES = 'openid profile email offline_access';

let warned = false;
let warnedLeftoverAuth0 = false;

function hasLeftoverAuth0Vars(env: Record<string, unknown>): boolean {
  return Object.keys(env).some(
    (key) => key.startsWith('VITE_APP_AUTH0_') && typeof env[key] === 'string' && env[key] !== ''
  );
}

export function getOidcConfig(
  env: Record<string, unknown> = import.meta.env as unknown as Record<string, unknown>
): OidcConfig | null {
  const read = (key: string): string => {
    const value = env[key];
    return typeof value === 'string' ? value.trim() : '';
  };

  const issuer = read('VITE_APP_OIDC_ISSUER');
  const clientId = read('VITE_APP_OIDC_CLIENT_ID');

  if (!issuer || !clientId) {
    if ((issuer || clientId) && !warned) {
      warned = true;
      const missing = issuer ? 'VITE_APP_OIDC_CLIENT_ID' : 'VITE_APP_OIDC_ISSUER';
      console.warn(`[oidc] OIDC login disabled: ${missing} is not set`);
    }
    if (!warnedLeftoverAuth0 && hasLeftoverAuth0Vars(env)) {
      warnedLeftoverAuth0 = true;
      console.warn(
        '[oidc] VITE_APP_AUTH0_* is no longer read; rename to VITE_APP_OIDC_* (see apps/saas-app/README.md#oidc-login)'
      );
    }
    return null;
  }

  return {
    issuer,
    clientId,
    displayName: read('VITE_APP_OIDC_DISPLAY_NAME') || 'SSO',
    scopes: read('VITE_APP_OIDC_SCOPES') || DEFAULT_SCOPES,
    extraParams: Object.fromEntries(new URLSearchParams(read('VITE_APP_OIDC_EXTRA_PARAMS'))),
    logoutUrl: read('VITE_APP_OIDC_LOGOUT_URL') || undefined,
  };
}

/** Test helper. */
export function resetOidcConfigWarning(): void {
  warned = false;
  warnedLeftoverAuth0 = false;
}
