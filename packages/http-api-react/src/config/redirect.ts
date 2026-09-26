export type LoginReason = 'expired' | 'rejected';

// Set while the app is navigating away to end a session (e.g. an OIDC
// end-session redirect), so a stray 401 can't override that navigation.
let suppressed = false;

/** Full-page navigation to the login page, optionally with a reason notice. */
export function redirectToLogin(reason?: LoginReason): void {
  if (suppressed) {
    return;
  }
  window.location.href = reason ? `/login?reason=${reason}` : '/login';
}

export function suppressLoginRedirect(): void {
  suppressed = true;
}

export function resumeLoginRedirect(): void {
  suppressed = false;
}

export function isLoginRedirectSuppressed(): boolean {
  return suppressed;
}
