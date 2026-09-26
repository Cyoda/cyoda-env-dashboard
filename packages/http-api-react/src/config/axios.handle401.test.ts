import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios, { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';

vi.mock('./redirect', () => ({ redirectToLogin: vi.fn() }));

import instance, { axiosPublic, axiosPlatform, axiosProcessing, axiosAI, axiosGrafana, handle401 } from './axios';
import { redirectToLogin } from './redirect';
import { registerTokenRefresher, clearTokenRefreshers } from './tokenRefresh';

const AUTH_KEY = 'cyoda_auth';

function setAuth(auth: object | null) {
  if (auth) localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
  else localStorage.removeItem(AUTH_KEY);
}
function getAuth() {
  const raw = localStorage.getItem(AUTH_KEY);
  return raw ? JSON.parse(raw) : null;
}
function makeConfig(token = 'old'): InternalAxiosRequestConfig {
  return { url: '/x', method: 'get', headers: new AxiosHeaders({ Authorization: `Bearer ${token}` }) };
}
function make401(config: InternalAxiosRequestConfig): AxiosError {
  return new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, {
    status: 401, statusText: 'Unauthorized', data: {}, headers: {}, config,
  });
}

describe('handle401', () => {
  beforeEach(() => {
    localStorage.clear();
    clearTokenRefreshers();
    vi.restoreAllMocks();
    vi.mocked(redirectToLogin).mockClear();
  });

  it('refreshes an oidc session via the registered refresher, passing the failed token, then retries', async () => {
    setAuth({ token: 'old', type: 'oidc', user: 'u' });
    const refresh = vi.fn(async () => {
      setAuth({ token: 'new', type: 'oidc', user: 'u' });
      return 'new';
    });
    registerTokenRefresher('oidc', refresh);
    const request = vi.spyOn(axios, 'request').mockResolvedValue({ data: 'ok', status: 200 } as any);

    const config = makeConfig('old');
    const res = await handle401(make401(config));

    expect(res.data).toBe('ok');
    expect(refresh).toHaveBeenCalledWith('old');
    const retried = request.mock.calls[0][0] as InternalAxiosRequestConfig & { __isRetryRequest?: boolean };
    expect(retried.headers.Authorization).toBe('Bearer new');
    expect(retried.__isRetryRequest).toBe(true);
  });

  it('concurrent 401s share one refresh', async () => {
    setAuth({ token: 'old', type: 'oidc', user: 'u' });
    let resolve!: (t: string) => void;
    const refresh = vi.fn(() => new Promise<string>((r) => { resolve = r; }));
    registerTokenRefresher('oidc', refresh);
    vi.spyOn(axios, 'request').mockResolvedValue({ data: 'ok', status: 200 } as any);

    const a = handle401(make401(makeConfig()));
    const b = handle401(make401(makeConfig()));
    await Promise.resolve();
    setAuth({ token: 'new', type: 'oidc', user: 'u' });
    resolve('new');
    await Promise.all([a, b]);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('standard sessions still use /auth/token', async () => {
    setAuth({ token: 'old', refreshToken: 'rt', type: 'standard', user: 'u' });
    const get = vi.spyOn(axiosPublic, 'get').mockResolvedValue({ data: { token: 'fresh' } } as any);
    vi.spyOn(axios, 'request').mockResolvedValue({ data: 'ok', status: 200 } as any);

    await handle401(make401(makeConfig()));

    expect(get).toHaveBeenCalledWith('/auth/token', { headers: { Authorization: 'Bearer rt' } });
    expect(getAuth().token).toBe('fresh');
  });

  it('a failed refresh with a session clears auth and redirects to ?reason=expired', async () => {
    setAuth({ token: 'old', type: 'oidc', user: 'u' });
    registerTokenRefresher('oidc', vi.fn().mockRejectedValue(new Error('invalid_grant')));

    await expect(handle401(make401(makeConfig()))).rejects.toThrow('invalid_grant');
    expect(getAuth()).toBeNull();
    expect(redirectToLogin).toHaveBeenCalledWith('expired');
  });

  it('401 without a session redirects to plain /login', async () => {
    setAuth(null);

    await expect(handle401(make401(makeConfig()))).rejects.toThrow();
    expect(redirectToLogin).toHaveBeenCalledWith(undefined);
  });

  it('a 401 on the retried request does not refresh again, calls clearSession and redirects to ?reason=rejected', async () => {
    setAuth({ token: 'old', type: 'oidc', user: 'u' });
    const clearSession = vi.fn();
    const refresh = vi.fn(async () => {
      setAuth({ token: 'new', type: 'oidc', user: 'u' });
      return 'new';
    });
    registerTokenRefresher('oidc', refresh, { clearSession });
    vi.spyOn(axios, 'request').mockImplementation(async (cfg: any) => {
      throw make401(cfg);
    });

    await expect(handle401(make401(makeConfig()))).rejects.toMatchObject({ response: { status: 401 } });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(getAuth()).toBeNull();
    expect(redirectToLogin).toHaveBeenCalledWith('rejected');
  });

  it('a non-401 error on the retry is rethrown unchanged', async () => {
    setAuth({ token: 'old', type: 'oidc', user: 'u' });
    registerTokenRefresher('oidc', vi.fn().mockResolvedValue('new'));
    const boom = new Error('network down');
    vi.spyOn(axios, 'request').mockRejectedValue(boom);

    await expect(handle401(make401(makeConfig()))).rejects.toBe(boom);
    expect(redirectToLogin).not.toHaveBeenCalled();
  });
});

describe('interceptor wiring', () => {
  beforeEach(() => {
    localStorage.clear();
    clearTokenRefreshers();
    vi.restoreAllMocks();
    vi.mocked(redirectToLogin).mockClear();
  });

  it.each([
    ['instance', instance],
    ['axiosPlatform', axiosPlatform],
    ['axiosProcessing', axiosProcessing],
    ['axiosAI', axiosAI],
  ])('%s routes a 401 through the refresher', async (_name, client) => {
    setAuth({ token: 'old', type: 'oidc', user: 'u' });
    const refresh = vi.fn(async () => {
      setAuth({ token: 'new', type: 'oidc', user: 'u' });
      return 'new';
    });
    registerTokenRefresher('oidc', refresh);
    vi.spyOn(axios, 'request').mockResolvedValue({ data: 'ok', status: 200 } as any);

    const adapter = async (config: InternalAxiosRequestConfig) => {
      throw make401(config);
    };
    const res = await client.get('/x', { adapter });

    expect(res.data).toBe('ok');
    expect(refresh).toHaveBeenCalledWith('old');
  });

  it('axiosGrafana does not refresh on 401', async () => {
    setAuth({ token: 'old', type: 'oidc', user: 'u' });
    const refresh = vi.fn();
    registerTokenRefresher('oidc', refresh);

    const adapter = async (config: InternalAxiosRequestConfig) => {
      throw make401(config);
    };
    await expect(axiosGrafana.get('/x', { adapter })).rejects.toMatchObject({ response: { status: 401 } });
    expect(refresh).not.toHaveBeenCalled();
    expect(getAuth()?.token).toBe('old');
  });
});
