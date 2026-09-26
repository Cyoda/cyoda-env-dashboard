import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerTokenRefresher, getTokenRefresher, clearTokenRefreshers } from './tokenRefresh';

describe('tokenRefresh registry', () => {
  beforeEach(() => clearTokenRefreshers());

  it('returns undefined for unknown or missing types', () => {
    expect(getTokenRefresher('oidc')).toBeUndefined();
    expect(getTokenRefresher(undefined)).toBeUndefined();
  });

  it('returns the registered refresher and clearSession hook', async () => {
    const refresh = vi.fn().mockResolvedValue('new-token');
    const clearSession = vi.fn();
    registerTokenRefresher('oidc', refresh, { clearSession });

    const entry = getTokenRefresher('oidc');
    expect(entry?.clearSession).toBe(clearSession);
    await expect(entry?.refresh('old')).resolves.toBe('new-token');
    expect(refresh).toHaveBeenCalledWith('old');
  });

  it('re-registering a type replaces the previous entry', () => {
    const first = vi.fn();
    const second = vi.fn();
    registerTokenRefresher('oidc', first);
    registerTokenRefresher('oidc', second);
    expect(getTokenRefresher('oidc')?.refresh).toBe(second);
  });
});
