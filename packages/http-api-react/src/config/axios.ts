import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { HelperStorage } from '../utils/storage';
import { HelperErrors } from '../utils/errors';
import { serializeParams } from '../utils/serializeParams';
import { getTokenRefresher } from './tokenRefresh';
import { redirectToLogin } from './redirect';

// Configure default params serializer
axios.defaults.paramsSerializer = { serialize: serializeParams };

type RetryableConfig = InternalAxiosRequestConfig & { __isRetryRequest?: boolean; muteErrors?: boolean };

let refreshAccessTokenPromise: Promise<void> | null = null;

const helperStorage = new HelperStorage();

/**
 * Main axios instance for API calls
 */
const instance: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_APP_API_BASE,
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
  },
  // Treat 303 as success - Cyoda backend returns 303 with response body
  validateStatus: (status) => (status >= 200 && status < 300) || status === 303,
  // Don't follow redirects - we want to handle 303 responses directly
  maxRedirects: 0,
});

/**
 * Request interceptor - adds authentication token
 */
instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const auth = helperStorage.get('auth');
  const token = auth?.token;
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  // Handle processing API base URL
  if (config.url && import.meta.env.VITE_APP_API_BASE_PROCESSING && config.url.indexOf('platform-processing') > -1) {
    config.baseURL = import.meta.env.VITE_APP_API_BASE_PROCESSING;
  }
  
  return config;
});

/**
 * Bearer token that the failing request carried, if any.
 */
function bearerOf(config: InternalAxiosRequestConfig): string | undefined {
  const header = config.headers?.Authorization ?? config.headers?.authorization;
  return typeof header === 'string' && header.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
}

/**
 * Refresh the access token for the current session.
 * Registered refreshers (e.g. OIDC) take precedence; otherwise the legacy
 * /auth/token flow is used (migrated from Vue: cyoda-ui-lib/src/stores/auth.ts).
 * On failure: clear auth and go to /login, with ?reason=expired only when a
 * session existed.
 */
async function refreshAccessToken(failedToken?: string): Promise<void> {
  const auth = helperStorage.get('auth');
  try {
    const entry = getTokenRefresher(auth?.type);
    if (entry) {
      await entry.refresh(failedToken);
      return;
    }

    const refreshToken = auth?.refreshToken;
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await axiosPublic.get('/auth/token', {
      headers: {
        Authorization: `Bearer ${refreshToken}`,
      },
    });

    helperStorage.set('auth', { ...auth, token: response.data.token });
  } catch (error) {
    helperStorage.remove('auth');
    redirectToLogin(auth?.token ? 'expired' : undefined);
    throw error;
  }
}

/**
 * Shared 401 handling for every token-bearing instance: single-flight refresh,
 * one retry, and a loop guard when the backend rejects the refreshed token.
 */
export async function handle401(error: AxiosError): Promise<AxiosResponse> {
  const config = error.config as RetryableConfig;
  // Snapshot before anything is removed, so the loop guard can still find the hook.
  const entry = getTokenRefresher(helperStorage.get('auth')?.type);

  if (!refreshAccessTokenPromise) {
    refreshAccessTokenPromise = refreshAccessToken(bearerOf(config)).finally(() => {
      refreshAccessTokenPromise = null;
    });
  }
  await refreshAccessTokenPromise;

  config.__isRetryRequest = true;
  const token = helperStorage.get('auth')?.token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  try {
    // Global axios has none of these interceptors, so this cannot recurse.
    return await axios.request(config);
  } catch (retryError) {
    if ((retryError as AxiosError)?.response?.status === 401) {
      helperStorage.remove('auth');
      await entry?.clearSession?.();
      redirectToLogin('rejected');
    }
    throw retryError;
  }
}

/**
 * Response error handler shared by the token-bearing instances.
 */
async function onResponseError(error: AxiosError): Promise<AxiosResponse> {
  const config = error.config as RetryableConfig | undefined;
  if (!config?.muteErrors) {
    HelperErrors.handler(error);
  }
  if (error.response?.status === 401 && config && !config.__isRetryRequest) {
    return handle401(error);
  }
  return Promise.reject(error);
}

/**
 * Response interceptor - handles errors and token refresh
 */
instance.interceptors.response.use((response: AxiosResponse) => response, onResponseError);

/**
 * Public axios instance (no auth required)
 */
export const axiosPublic: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_APP_API_BASE,
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
  },
});

/**
 * Platform API axios instance (for /platform-api endpoints)
 * No baseURL prefix - allows full paths like /platform-api/...
 */
export const axiosPlatform: AxiosInstance = axios.create({
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
  },
  // Treat 303 as success - Cyoda backend returns 303 with response body
  validateStatus: (status) => (status >= 200 && status < 300) || status === 303,
  // Don't follow redirects - we want to handle 303 responses directly
  maxRedirects: 0,
});

axiosPlatform.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const auth = helperStorage.get('auth');
  const token = auth?.token;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

axiosPlatform.interceptors.response.use((response: AxiosResponse) => response, onResponseError);

/**
 * Processing API axios instance
 */
export const axiosProcessing: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_APP_API_BASE_PROCESSING,
  headers: {
    'Content-Type': 'application/json',
  },
});

axiosProcessing.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const auth = helperStorage.get('auth');
  const token = auth?.token;
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  return config;
});

axiosProcessing.interceptors.response.use((response: AxiosResponse) => response, onResponseError);

/**
 * Grafana API axios instance
 */
export const axiosGrafana: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_APP_GRAFANA_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  auth: {
    username: import.meta.env.VITE_APP_GRAFANA_USERNAME || '',
    password: import.meta.env.VITE_APP_GRAFANA_PASSWORD || '',
  },
});

// Grafana uses basic auth: a 401 says nothing about the cyoda token, so never refresh.
axiosGrafana.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    if (!(error.config as RetryableConfig | undefined)?.muteErrors) {
      HelperErrors.handler(error);
    }
    return Promise.reject(error);
  }
);

/**
 * AI API axios instance
 */
export const axiosAI: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_APP_AI_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

axiosAI.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const auth = helperStorage.get('auth');
  const token = auth?.token;
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  return config;
});

axiosAI.interceptors.response.use((response: AxiosResponse) => response, onResponseError);

export default instance;

