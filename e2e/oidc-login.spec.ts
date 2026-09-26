import { test, expect } from '@playwright/test';
import path from 'path';
import { loadEnv } from 'vite';

/**
 * Login page rendering for the configured login methods. Does not drive a real IdP.
 *
 * Expectations come from apps/saas-app/.env* as Vite loads them in development
 * mode. With reuseExistingServer, an already running dev server may have been
 * started with a different env — point BASE_URL at a fresh server if this
 * test disagrees with what you see.
 */
const env = loadEnv('development', path.resolve(__dirname, '../apps/saas-app'), 'VITE_');
const isGo = env.VITE_FEATURE_FLAG_IS_CYODA_GO === 'true';
const oidcName =
  env.VITE_APP_OIDC_ISSUER && env.VITE_APP_OIDC_CLIENT_ID ? env.VITE_APP_OIDC_DISPLAY_NAME || 'SSO' : null;

test.describe('Login page', () => {
  test('renders the configured login methods', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('.login-page')).toBeVisible();

    const passwordField = page.getByPlaceholder('Username');
    if (isGo) {
      await expect(passwordField).toHaveCount(0);
    } else {
      await expect(passwordField).toBeVisible();
    }

    if (oidcName) {
      await expect(page.getByRole('button', { name: `Login with ${oidcName}` })).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: /^Login with / })).toHaveCount(0);
    }

    if (isGo && !oidcName) {
      await expect(page.getByText('No login method is configured')).toBeVisible();
    }

    await page.screenshot({ path: '.playwright-mcp/login-page.png', fullPage: true });
  });

  test('shows the expired notice', async ({ page }) => {
    await page.goto('/login?reason=expired');
    await expect(page.getByText('Your session expired. Please log in again.')).toBeVisible();
  });
});
