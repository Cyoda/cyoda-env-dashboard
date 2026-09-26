import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  redirectToLogin,
  suppressLoginRedirect,
  resumeLoginRedirect,
  isLoginRedirectSuppressed,
} from './redirect';

describe('redirectToLogin', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    resumeLoginRedirect();
    Object.defineProperty(window, 'location', { value: { href: '/workflows' }, writable: true });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
  });

  it('navigates to /login, with the reason when given', () => {
    redirectToLogin();
    expect(window.location.href).toBe('/login');
    redirectToLogin('expired');
    expect(window.location.href).toBe('/login?reason=expired');
  });

  it('does nothing while suppressed, and navigates again once resumed', () => {
    suppressLoginRedirect();
    expect(isLoginRedirectSuppressed()).toBe(true);
    redirectToLogin('expired');
    expect(window.location.href).toBe('/workflows');

    resumeLoginRedirect();
    expect(isLoginRedirectSuppressed()).toBe(false);
    redirectToLogin('expired');
    expect(window.location.href).toBe('/login?reason=expired');
  });
});
