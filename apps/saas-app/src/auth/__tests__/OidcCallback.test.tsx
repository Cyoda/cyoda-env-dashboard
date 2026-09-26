import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../oidcClient', () => ({ completeLogin: vi.fn() }));
vi.mock('../session', () => ({ isValidSession: vi.fn(() => false) }));
vi.mock('../../utils/defaultRoute', () => ({ getDefaultRoute: () => '/workflows' }));

import { completeLogin } from '../oidcClient';
import { isValidSession } from '../session';
import { OidcCallback } from '../OidcCallback';

function renderAt(search: string) {
  window.history.pushState({}, '', `/oidc/callback${search}`);
  return render(
    <MemoryRouter initialEntries={[`/oidc/callback${search}`]}>
      <Routes>
        <Route path="/oidc/callback" element={<OidcCallback />} />
        <Route path="/workflows" element={<div>workflows page</div>} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OidcCallback', () => {
  beforeEach(() => {
    vi.mocked(completeLogin).mockReset();
    vi.mocked(isValidSession).mockReturnValue(false);
  });

  it('completes the login and navigates to the default route', async () => {
    vi.mocked(completeLogin).mockResolvedValue();
    renderAt('?code=c&state=s');
    expect(await screen.findByText('workflows page')).toBeInTheDocument();
    expect(completeLogin).toHaveBeenCalled();
  });

  it('shows the error with a way back to login', async () => {
    vi.mocked(completeLogin).mockRejectedValue(new Error('No matching state found in storage'));
    renderAt('?code=c&state=s');
    expect(await screen.findByText('No matching state found in storage')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back to login' }));
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });

  it('reload after login: no code in URL and a valid session navigates without completeLogin', async () => {
    vi.mocked(isValidSession).mockReturnValue(true);
    renderAt('');
    expect(await screen.findByText('workflows page')).toBeInTheDocument();
    await waitFor(() => expect(completeLogin).not.toHaveBeenCalled());
  });
});
