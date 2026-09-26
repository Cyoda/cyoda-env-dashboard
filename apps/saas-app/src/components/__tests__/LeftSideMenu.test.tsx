/**
 * LeftSideMenu Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LeftSideMenu } from '../LeftSideMenu';

const storageMock = vi.hoisted(() => ({
  get: vi.fn(() => null as any),
  remove: vi.fn(),
  clear: vi.fn(),
}));

// Mock the storage helper
vi.mock('@cyoda/http-api-react/utils/storage', () => ({
  HelperStorage: vi.fn().mockImplementation(() => storageMock),
}));

const oidcMock = vi.hoisted(() => ({
  isOidcEnabled: vi.fn(() => false),
  logout: vi.fn(async (): Promise<'redirecting' | 'local'> => 'local'),
}));
vi.mock('../../auth/oidcClient', () => oidcMock);

// Mock the AppLogo component
vi.mock('@cyoda/ui-lib-react', () => ({
  AppLogo: () => <div data-testid="app-logo">Logo</div>,
}));

const renderWithRouter = (
  component: React.ReactElement,
  initialRoute = '/'
) => {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>{component}</MemoryRouter>
  );
};

describe('LeftSideMenu', () => {
  const mockOnCollapse = vi.fn();

  beforeEach(() => {
    mockOnCollapse.mockClear();
  });

  describe('Rendering', () => {
    it('should render the sidebar', () => {
      const { container } = renderWithRouter(
        <LeftSideMenu collapsed={false} onCollapse={mockOnCollapse} />
      );

      const sidebar = container.querySelector('.ant-layout-sider');
      expect(sidebar).toBeInTheDocument();
    });

    it('should render all main menu items', () => {
      // Required feature flags for Trino + Tasks menu items to render
      const env = import.meta.env as Record<string, unknown>;
      const prevTrino = env.VITE_FEATURE_FLAG_TRINO_SQL_SCHEMA;
      const prevTasks = env.VITE_FEATURE_FLAG_TASKS;
      env.VITE_FEATURE_FLAG_TRINO_SQL_SCHEMA = true;
      env.VITE_FEATURE_FLAG_TASKS = true;

      try {
        renderWithRouter(
          <LeftSideMenu collapsed={false} onCollapse={mockOnCollapse} />
        );

        expect(screen.getByText('Trino SQL schemas')).toBeInTheDocument();
        expect(screen.getByText('Reporting')).toBeInTheDocument();
        expect(screen.getByText('Lifecycle')).toBeInTheDocument();
        expect(screen.getByText('Tasks')).toBeInTheDocument();
        expect(screen.getByText('Entity Model Viewer')).toBeInTheDocument();
        expect(screen.getByText('Processing')).toBeInTheDocument();
        expect(screen.getByText('Logout')).toBeInTheDocument();
        expect(screen.getByText('Version App')).toBeInTheDocument();
      } finally {
        env.VITE_FEATURE_FLAG_TRINO_SQL_SCHEMA = prevTrino;
        env.VITE_FEATURE_FLAG_TASKS = prevTasks;
      }
    });

    it('should render menu icons', () => {
      const { container } = renderWithRouter(
        <LeftSideMenu collapsed={false} onCollapse={mockOnCollapse} />
      );

      const icons = container.querySelectorAll('.anticon');
      expect(icons.length).toBeGreaterThan(0);
    });

    it('should render collapse trigger button', () => {
      const { container } = renderWithRouter(
        <LeftSideMenu collapsed={false} onCollapse={mockOnCollapse} />
      );

      const collapseButton = container.querySelector('.sidebar-collapse-trigger');
      expect(collapseButton).toBeInTheDocument();
    });
  });

  describe('Collapsed State', () => {
    it('should apply collapsed class when collapsed', () => {
      const { container } = renderWithRouter(
        <LeftSideMenu collapsed={true} onCollapse={mockOnCollapse} />
      );

      const sidebar = container.querySelector('.ant-layout-sider-collapsed');
      expect(sidebar).toBeInTheDocument();
    });

    it('should have correct width when collapsed', () => {
      const { container } = renderWithRouter(
        <LeftSideMenu collapsed={true} onCollapse={mockOnCollapse} />
      );

      const sidebar = container.querySelector('.ant-layout-sider');
      expect(sidebar).toHaveStyle({ width: '80px' });
    });

    it('should have correct width when expanded', () => {
      const { container } = renderWithRouter(
        <LeftSideMenu collapsed={false} onCollapse={mockOnCollapse} />
      );

      const sidebar = container.querySelector('.ant-layout-sider');
      expect(sidebar).toHaveStyle({ width: '250px' });
    });

    it('should show menu-collapsed class on menu when collapsed', () => {
      const { container } = renderWithRouter(
        <LeftSideMenu collapsed={true} onCollapse={mockOnCollapse} />
      );

      const menu = container.querySelector('.menu-collapsed');
      expect(menu).toBeInTheDocument();
    });

    it('should not show menu-collapsed class when expanded', () => {
      const { container } = renderWithRouter(
        <LeftSideMenu collapsed={false} onCollapse={mockOnCollapse} />
      );

      const menu = container.querySelector('.menu-collapsed');
      expect(menu).not.toBeInTheDocument();
    });
  });

  describe('Submenu Behavior', () => {
    it('should render submenu items for Reporting', async () => {
      const user = userEvent.setup({ delay: null });
      renderWithRouter(
        <LeftSideMenu collapsed={false} onCollapse={mockOnCollapse} />
      );

      const reportingMenu = screen.getByText('Reporting');
      await user.click(reportingMenu);

      await waitFor(() => {
        expect(screen.getByText('Report config editor')).toBeInTheDocument();
        expect(screen.getByText('Stream Reports')).toBeInTheDocument();
        expect(screen.getByText('Catalog of aliases')).toBeInTheDocument();
      });
    });

    it('should render submenu items for Lifecycle', async () => {
      const user = userEvent.setup({ delay: null });
      renderWithRouter(
        <LeftSideMenu collapsed={false} onCollapse={mockOnCollapse} />
      );

      const lifecycleMenu = screen.getByText('Lifecycle');
      await user.click(lifecycleMenu);

      await waitFor(() => {
        expect(screen.getByText('Workflow')).toBeInTheDocument();
        expect(screen.getByText('Instances')).toBeInTheDocument();
      });
    });

    it('should allow multiple submenus to be open simultaneously', async () => {
      const user = userEvent.setup({ delay: null });
      renderWithRouter(
        <LeftSideMenu collapsed={false} onCollapse={mockOnCollapse} />
      );

      // Open Reporting
      const reportingMenu = screen.getByText('Reporting');
      await user.click(reportingMenu);

      await waitFor(() => {
        expect(screen.getByText('Report config editor')).toBeInTheDocument();
      });

      // Open Lifecycle
      const lifecycleMenu = screen.getByText('Lifecycle');
      await user.click(lifecycleMenu);

      await waitFor(() => {
        expect(screen.getByText('Workflow')).toBeInTheDocument();
      });

      // Both should still be visible
      expect(screen.getByText('Report config editor')).toBeInTheDocument();
      expect(screen.getByText('Workflow')).toBeInTheDocument();
    });

    it('should close submenu when clicked again', async () => {
      const user = userEvent.setup({ delay: null });
      const { container } = renderWithRouter(
        <LeftSideMenu collapsed={false} onCollapse={mockOnCollapse} />
      );

      const reportingMenu = screen.getByText('Reporting');

      // Open submenu
      await user.click(reportingMenu);
      await waitFor(() => {
        const submenu = container.querySelector('#rc-menu-uuid-test-reporting-popup');
        expect(submenu).not.toHaveClass('ant-menu-hidden');
      });

      // Close submenu
      await user.click(reportingMenu);
      await waitFor(() => {
        const submenu = container.querySelector('#rc-menu-uuid-test-reporting-popup');
        expect(submenu).toHaveClass('ant-menu-hidden');
      });
    });
  });

  describe('Collapsed Submenu Behavior', () => {
    it('should show submenu items inline when collapsed and submenu is opened', async () => {
      const user = userEvent.setup({ delay: null });
      const { container } = renderWithRouter(
        <LeftSideMenu collapsed={true} onCollapse={mockOnCollapse} />
      );

      // Find the Reporting submenu title (clickable element)
      const reportingSubmenuTitle = container.querySelector('.ant-menu-submenu .ant-menu-submenu-title');
      expect(reportingSubmenuTitle).toBeInTheDocument();

      // Click to open submenu
      await user.click(reportingSubmenuTitle!);

      await waitFor(() => {
        // Check that submenu has 'open' class
        const reportingSubmenu = container.querySelector('.ant-menu-submenu');
        expect(reportingSubmenu).toHaveClass('ant-menu-submenu-open');

        // Check that submenu items exist in DOM (even if hidden by CSS)
        const submenu = container.querySelector('.ant-menu-sub');
        expect(submenu).toBeInTheDocument();
      });
    });

    it('should show dots for submenu items in collapsed mode', async () => {
      const user = userEvent.setup({ delay: null });
      const { container } = renderWithRouter(
        <LeftSideMenu collapsed={true} onCollapse={mockOnCollapse} />
      );

      // Open a submenu by clicking on the title
      const reportingSubmenuTitle = container.querySelector('.ant-menu-submenu .ant-menu-submenu-title');
      expect(reportingSubmenuTitle).toBeInTheDocument();

      await user.click(reportingSubmenuTitle!);

      await waitFor(() => {
        // Check that submenu is open
        const reportingSubmenu = container.querySelector('.ant-menu-submenu');
        expect(reportingSubmenu).toHaveClass('ant-menu-submenu-open');

        // Check for submenu items (dots are styled via CSS ::before pseudo-elements)
        const submenuItems = container.querySelectorAll('.ant-menu-sub .ant-menu-item');
        expect(submenuItems.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Active Menu Item', () => {
    it('should highlight active menu item based on route', () => {
      // Tasks menu item only renders when VITE_FEATURE_FLAG_TASKS is enabled
      const env = import.meta.env as Record<string, unknown>;
      const prevTasks = env.VITE_FEATURE_FLAG_TASKS;
      env.VITE_FEATURE_FLAG_TASKS = true;

      try {
        const { container } = renderWithRouter(
          <LeftSideMenu collapsed={false} onCollapse={mockOnCollapse} />,
          '/tasks'
        );

        const selectedItem = container.querySelector('.ant-menu-item-selected');
        expect(selectedItem).toBeInTheDocument();
      } finally {
        env.VITE_FEATURE_FLAG_TASKS = prevTasks;
      }
    });

    it('should open parent submenu when on submenu route', () => {
      const { container } = renderWithRouter(
        <LeftSideMenu collapsed={false} onCollapse={mockOnCollapse} />,
        '/reporting/reports'
      );

      // Reporting submenu should be open
      const openSubmenu = container.querySelector('.ant-menu-submenu-open');
      expect(openSubmenu).toBeInTheDocument();
    });
  });

  describe('Logout Modal', () => {
    it('should open logout modal when clicking logout menu item', async () => {
      const user = userEvent.setup({ delay: null });
      renderWithRouter(
        <LeftSideMenu collapsed={false} onCollapse={mockOnCollapse} />
      );

      const logoutMenuItem = screen.getByText('Logout');
      await user.click(logoutMenuItem);

      await waitFor(() => {
        expect(screen.getByText('Confirm Logout')).toBeInTheDocument();
        expect(screen.getByText('Do you really want to logout?')).toBeInTheDocument();
      });
    });

    it('should show both logout buttons in modal', async () => {
      const user = userEvent.setup({ delay: null });
      renderWithRouter(
        <LeftSideMenu collapsed={false} onCollapse={mockOnCollapse} />
      );

      const logoutMenuItem = screen.getByText('Logout');
      await user.click(logoutMenuItem);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^Logout$/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Logout and Clear Data/ })).toBeInTheDocument();
      });
    });
  });

  describe('Active Child Indicator', () => {
    it('should show indicator dot on Reporting parent when on reporting route and collapsed', () => {
      const { container } = renderWithRouter(
        <LeftSideMenu collapsed={true} onCollapse={mockOnCollapse} />,
        '/reporting/reports'
      );

      // Find the indicator dot
      const indicator = container.querySelector('.submenu-active-indicator');
      expect(indicator).toBeInTheDocument();
    });

    it('should show indicator dot on Lifecycle parent when on workflows route and collapsed', () => {
      const { container } = renderWithRouter(
        <LeftSideMenu collapsed={true} onCollapse={mockOnCollapse} />,
        '/workflows'
      );

      // Find the indicator dot
      const indicator = container.querySelector('.submenu-active-indicator');
      expect(indicator).toBeInTheDocument();
    });

    it('should show indicator dot on Lifecycle parent when on instances route and collapsed', () => {
      const { container } = renderWithRouter(
        <LeftSideMenu collapsed={true} onCollapse={mockOnCollapse} />,
        '/instances'
      );

      // Find the indicator dot
      const indicator = container.querySelector('.submenu-active-indicator');
      expect(indicator).toBeInTheDocument();
    });

    it('should NOT show indicator dot when menu is expanded', () => {
      const { container } = renderWithRouter(
        <LeftSideMenu collapsed={false} onCollapse={mockOnCollapse} />,
        '/reporting/reports'
      );

      // Indicator should not be present when expanded
      const indicator = container.querySelector('.submenu-active-indicator');
      expect(indicator).not.toBeInTheDocument();
    });

    it('should NOT show indicator dot when not on a submenu route', () => {
      const { container } = renderWithRouter(
        <LeftSideMenu collapsed={true} onCollapse={mockOnCollapse} />,
        '/tasks'
      );

      // Indicator should not be present
      const indicator = container.querySelector('.submenu-active-indicator');
      expect(indicator).not.toBeInTheDocument();
    });

    it('should hide indicator dot when submenu is opened in collapsed mode', async () => {
      const user = userEvent.setup({ delay: null });
      const { container } = renderWithRouter(
        <LeftSideMenu collapsed={true} onCollapse={mockOnCollapse} />,
        '/reporting/reports'
      );

      // Initially, indicator should be visible
      let indicator = container.querySelector('.submenu-active-indicator');
      expect(indicator).toBeInTheDocument();

      // Open the submenu
      const reportingSubmenuTitle = container.querySelector('.ant-menu-submenu .ant-menu-submenu-title');
      await user.click(reportingSubmenuTitle!);

      await waitFor(() => {
        // After opening submenu, indicator should be hidden
        indicator = container.querySelector('.submenu-active-indicator');
        expect(indicator).not.toBeInTheDocument();
      });
    });
  });

  describe('Cyoda-Go feature gating', () => {
    const setEnv = (key: string, value: unknown) => {
      (import.meta.env as any)[key] = value;
    };
    const clearEnv = (key: string) => {
      delete (import.meta.env as any)[key];
    };

    beforeEach(() => {
      // Default: all relevant flags off
      clearEnv('VITE_FEATURE_FLAG_IS_CYODA_GO');
      clearEnv('VITE_FEATURE_FLAG_IS_CYODA_CLOUD');
      clearEnv('VITE_FEATURE_FLAG_TRINO_SQL_SCHEMA');
      clearEnv('VITE_FEATURE_FLAG_TASKS');
    });

    it('hides Reporting, Tasks, and Processing when IS_CYODA_GO is true', () => {
      setEnv('VITE_FEATURE_FLAG_IS_CYODA_GO', true);
      setEnv('VITE_FEATURE_FLAG_TRINO_SQL_SCHEMA', true);
      // Even with TASKS explicitly enabled, the GO flag must take precedence:
      setEnv('VITE_FEATURE_FLAG_TASKS', true);

      renderWithRouter(
        <LeftSideMenu collapsed={false} onCollapse={mockOnCollapse} />
      );

      expect(screen.queryByText('Reporting')).not.toBeInTheDocument();
      expect(screen.queryByText('Tasks')).not.toBeInTheDocument();
      expect(screen.queryByText('Processing')).not.toBeInTheDocument();

      // Surviving items
      expect(screen.getByText('Trino SQL schemas')).toBeInTheDocument();
      expect(screen.getByText('Lifecycle')).toBeInTheDocument();
      expect(screen.getByText('Entity Model Viewer')).toBeInTheDocument();
    });

    it('keeps Reporting and Processing visible when IS_CYODA_GO is not set', () => {
      // Same setup as the existing "should render all main menu items" test
      setEnv('VITE_FEATURE_FLAG_TRINO_SQL_SCHEMA', true);
      setEnv('VITE_FEATURE_FLAG_TASKS', true);

      renderWithRouter(
        <LeftSideMenu collapsed={false} onCollapse={mockOnCollapse} />
      );

      expect(screen.getByText('Reporting')).toBeInTheDocument();
      expect(screen.getByText('Tasks')).toBeInTheDocument();
      expect(screen.getByText('Processing')).toBeInTheDocument();
    });
  });

  describe('OIDC logout', () => {
    beforeEach(() => {
      oidcMock.isOidcEnabled.mockReturnValue(true);
      oidcMock.logout.mockReset();
      storageMock.get.mockReturnValue({ token: 't', user: 'u', type: 'oidc' });
    });

    async function openLogoutModal() {
      const user = userEvent.setup();
      renderWithRouter(<LeftSideMenu collapsed={false} onCollapse={mockOnCollapse} />);
      await user.click(screen.getByText('Logout'));
      await screen.findByText('Do you really want to logout?');
      return user;
    }

    it('Logout calls oidc logout without clearAll', async () => {
      oidcMock.logout.mockResolvedValue('redirecting');
      const user = await openLogoutModal();
      await user.click(screen.getByRole('button', { name: /^Logout$/ }));
      await waitFor(() => expect(oidcMock.logout).toHaveBeenCalledWith());
      expect(storageMock.remove).not.toHaveBeenCalled();
    });

    it('Logout and clear calls oidc logout with clearAll', async () => {
      oidcMock.logout.mockResolvedValue('local');
      const user = await openLogoutModal();
      await user.click(screen.getByRole('button', { name: /Logout and Clear Data/ }));
      await waitFor(() => expect(oidcMock.logout).toHaveBeenCalledWith({ clearAll: true }));
    });
  });
});

