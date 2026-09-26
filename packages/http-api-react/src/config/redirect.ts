export type LoginReason = 'expired' | 'rejected';

/** Full-page navigation to the login page, optionally with a reason notice. */
export function redirectToLogin(reason?: LoginReason): void {
  window.location.href = reason ? `/login?reason=${reason}` : '/login';
}
