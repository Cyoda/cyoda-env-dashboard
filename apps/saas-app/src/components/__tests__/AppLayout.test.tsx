import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('@cyoda/cyoda-sass-react', () => ({
  useAppStore: (selector: (s: any) => unknown) => selector({ isToggledMenu: false, toggleMenu: () => {} }),
}));
vi.mock('../AppHeader', () => ({ AppHeader: () => <div>header</div> }));
vi.mock('../LeftSideMenu', () => ({ LeftSideMenu: () => <div>menu</div> }));

import { AppLayout } from '../AppLayout';

const child = vi.fn(() => <div>protected child</div>);
const Child = () => child();

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/workflows']}>
      <Routes>
        <Route path="/login" element={<div>login page</div>} />
        <Route path="/" element={<AppLayout />}>
          <Route path="workflows" element={<Child />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppLayout guard', () => {
  beforeEach(() => {
    localStorage.clear();
    child.mockClear();
  });

  it('redirects to /login without a session and never renders the outlet', () => {
    renderApp();
    expect(screen.getByText('login page')).toBeInTheDocument();
    expect(child).not.toHaveBeenCalled();
  });

  it('redirects a legacy auth0 session to /login', () => {
    localStorage.setItem('cyoda_auth', JSON.stringify({ token: 't', user: 'u', type: 'auth0' }));
    renderApp();
    expect(screen.getByText('login page')).toBeInTheDocument();
    expect(child).not.toHaveBeenCalled();
  });

  it('renders the layout and outlet for a valid session', () => {
    localStorage.setItem('cyoda_auth', JSON.stringify({ token: 't', user: 'u', type: 'oidc' }));
    renderApp();
    expect(screen.getByText('protected child')).toBeInTheDocument();
  });
});
