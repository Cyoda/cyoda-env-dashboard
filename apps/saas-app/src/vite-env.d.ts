/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_UI_VERSION?: string;
  readonly VITE_APP_UI_BUILD_TIME?: string;
  readonly VITE_APP_UI_BRANCH_NAME?: string;
  readonly VITE_APP_API_BASE?: string;
  readonly VITE_APP_OIDC_ISSUER?: string;
  readonly VITE_APP_OIDC_CLIENT_ID?: string;
  readonly VITE_APP_OIDC_DISPLAY_NAME?: string;
  readonly VITE_APP_OIDC_SCOPES?: string;
  readonly VITE_APP_OIDC_EXTRA_PARAMS?: string;
  readonly VITE_APP_OIDC_LOGOUT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

