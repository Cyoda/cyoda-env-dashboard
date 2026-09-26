import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import { HelperFeatureFlags } from '@cyoda/http-api-react';

vi.mock('../../auth/oidcClient', () => ({
  isOidcEnabled: vi.fn(() => true),
  getOidcDisplayName: vi.fn(() => 'Zitadel'),
  startLogin: vi.fn(),
}));

import { isOidcEnabled, startLogin } from '../../auth/oidcClient';
import Login from '../Login';

function renderLogin(search = '') {
  return render(
    <App>
      <MemoryRouter initialEntries={[`/login${search}`]}>
        <Login />
      </MemoryRouter>
    </App>,
  );
}

describe('Login page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(isOidcEnabled).mockReturnValue(true);
    vi.mocked(startLogin).mockReset();
  });

  it('Cloud mode with OIDC: password form, divider and OIDC button', () => {
    vi.spyOn(HelperFeatureFlags, 'isCyodaGo').mockReturnValue(false);
    renderLogin();
    expect(screen.getByPlaceholderText('Username')).toBeInTheDocument();
    expect(screen.getByText('OR')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Login with Zitadel' })).toBeInTheDocument();
  });

  it('Go mode with OIDC: only the OIDC button', () => {
    vi.spyOn(HelperFeatureFlags, 'isCyodaGo').mockReturnValue(true);
    renderLogin();
    expect(screen.queryByPlaceholderText('Username')).not.toBeInTheDocument();
    expect(screen.queryByText('OR')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Login with Zitadel' })).toBeInTheDocument();
  });

  it('Cloud mode without OIDC: only the password form', () => {
    vi.spyOn(HelperFeatureFlags, 'isCyodaGo').mockReturnValue(false);
    vi.mocked(isOidcEnabled).mockReturnValue(false);
    renderLogin();
    expect(screen.getByPlaceholderText('Username')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Login with/ })).not.toBeInTheDocument();
  });

  it('Go mode without OIDC: explains that OIDC must be configured', () => {
    vi.spyOn(HelperFeatureFlags, 'isCyodaGo').mockReturnValue(true);
    vi.mocked(isOidcEnabled).mockReturnValue(false);
    renderLogin();
    expect(screen.getByText(/VITE_APP_OIDC_\*/)).toBeInTheDocument();
  });

  it('shows the expired notice', () => {
    renderLogin('?reason=expired');
    expect(screen.getByText('Your session expired. Please log in again.')).toBeInTheDocument();
  });

  it('shows the rejected notice', () => {
    renderLogin('?reason=rejected');
    expect(
      screen.getByText('The server rejected your credentials. If this persists, check that the backend trusts this identity provider.'),
    ).toBeInTheDocument();
  });

  it('starts the OIDC login and shows the real error when it fails', async () => {
    vi.spyOn(HelperFeatureFlags, 'isCyodaGo').mockReturnValue(true);
    vi.mocked(startLogin).mockRejectedValue(new Error('Crypto.subtle is available only in secure contexts'));
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: 'Login with Zitadel' }));
    expect(startLogin).toHaveBeenCalled();
    expect(
      await screen.findByText('Login with Zitadel failed: Crypto.subtle is available only in secure contexts'),
    ).toBeInTheDocument();
  });

  it('clears the OIDC button loading state on pageshow (bfcache restore)', async () => {
    vi.spyOn(HelperFeatureFlags, 'isCyodaGo').mockReturnValue(true);
    vi.mocked(startLogin).mockReturnValue(new Promise(() => {}));
    renderLogin();
    const button = screen.getByRole('button', { name: 'Login with Zitadel' });
    await userEvent.click(button);
    await waitFor(() => expect(button.className).toContain('ant-btn-loading'));
    fireEvent(window, new Event('pageshow'));
    await waitFor(() => expect(button.className).not.toContain('ant-btn-loading'));
  });
});
