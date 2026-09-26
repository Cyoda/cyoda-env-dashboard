import React, { useState, useEffect } from 'react';
import { Layout, Menu, Modal, Button, Tooltip, Switch } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  DatabaseOutlined,
  FileTextOutlined,
  ApartmentOutlined,
  CheckSquareOutlined,
  EyeOutlined,
  ClusterOutlined,
  LogoutOutlined,
  InfoCircleOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BarChartOutlined,
  LineChartOutlined,
  TagsOutlined,
  ProjectOutlined,
  AppstoreOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { HelperStorage, HelperFeatureFlags } from '@cyoda/http-api-react';
import { AppLogo } from '@cyoda/ui-lib-react';
import { useThemeStore } from '../stores/themeStore';
import { isOidcEnabled, logout as oidcLogout } from '../auth/oidcClient';
import './LeftSideMenu.scss';

const { Sider } = Layout;
const helperStorage = new HelperStorage();

type MenuItem = Required<MenuProps>['items'][number];

interface LeftSideMenuProps {
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
}

export const LeftSideMenu: React.FC<LeftSideMenuProps> = ({ collapsed, onCollapse }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [versionModalVisible, setVersionModalVisible] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const { mode, toggleMode } = useThemeStore();

  const handleLogoutClick = () => {
    setLogoutModalVisible(true);
  };

  const isOidcSession = () => isOidcEnabled() && helperStorage.get('auth')?.type === 'oidc';

  const handleLogout = async () => {
    setLogoutModalVisible(false);
    if (isOidcSession()) {
      if ((await oidcLogout()) === 'local') navigate('/login');
      return;
    }
    // Logout without clearing data
    helperStorage.remove('auth');
    navigate('/login');
  };

  const handleLogoutAndClear = async () => {
    setLogoutModalVisible(false);
    if (isOidcSession()) {
      // oidcLogout reads the id_token first, then clears all storage.
      if ((await oidcLogout({ clearAll: true })) === 'local') navigate('/login');
      return;
    }
    // Logout and clear all data
    helperStorage.clear();
    localStorage.clear(); // Also clear non-prefixed items
    navigate('/login');
  };

  const handleLogoutCancel = () => {
    // Just close the modal without any action
    setLogoutModalVisible(false);
  };

  const handleVersionClick = () => {
    setVersionModalVisible(true);
  };

  // Handle menu item clicks (left-click only).
  // `MenuInfo` widens `domEvent` to `KeyboardEvent | MouseEvent` — we only
  // ever use the mouse variant here, but take it loosely and narrow below.
  const handleMenuClick: MenuProps['onClick'] = (info) => {
    const { key, domEvent } = info;

    // Special handlers for non-navigation items
    if (key === 'logout') {
      handleLogoutClick();
      return;
    }
    if (key === 'version') {
      handleVersionClick();
      return;
    }
    if (key === 'theme') {
      // Toggle theme when clicking on the menu item (useful in collapsed mode)
      toggleMode();
      return;
    }

    // Skip parent menu items (they don't navigate)
    if (key === 'reporting' || key === 'lifecycle') {
      return;
    }

    // Check if ctrl/cmd + click
    const isCtrlClick = domEvent.ctrlKey || domEvent.metaKey;

    if (isCtrlClick) {
      // Open in new tab
      window.open(key, '_blank');
    } else {
      // Normal navigation
      navigate(key);
    }
  };

  // Handle mouse up to capture middle-click
  const handleMouseUp = (e: React.MouseEvent) => {
    // Only handle middle-click (button 1)
    if (e.button !== 1) return;

    // Find the menu item element first
    let target = e.target as HTMLElement;
    let menuItem: HTMLElement | null = null;

    // Traverse up to find the ant-menu-item element
    while (target && target !== e.currentTarget) {
      if (target.classList && target.classList.contains('ant-menu-item')) {
        menuItem = target;
        break;
      }
      target = target.parentElement as HTMLElement;
    }

    if (!menuItem) return;

    // Now find the element with data-path within the menu item
    const spanWithPath = menuItem.querySelector('[data-path]') as HTMLElement;

    if (!spanWithPath) return;

    const path = spanWithPath.getAttribute('data-path');

    if (!path) return;

    // Open in new tab
    window.open(path, '_blank');
    e.preventDefault();
  };

  // Handle submenu click - toggle submenu open/close
  const handleSubMenuClick = (key: string) => {
    if (collapsed) {
      // In collapsed mode, toggle the submenu inline (show/hide submenu icons)
      setOpenKeys(prevKeys => {
        if (prevKeys.includes(key)) {
          // Close the submenu
          return prevKeys.filter(k => k !== key);
        } else {
          // Open the submenu (close others)
          return [key];
        }
      });
    }
  };

  // Check if a submenu has an active child (for indicator dot)
  const hasActiveChild = (submenuKey: string): boolean => {
    const path = location.pathname;

    if (submenuKey === 'reporting') {
      return path.startsWith('/reporting');
    }
    if (submenuKey === 'lifecycle') {
      return path.startsWith('/workflows') || path.startsWith('/instances') ||
             path.startsWith('/workflow/') || path.startsWith('/instance/');
    }

    return false;
  };

  const isTrinoEnabled = HelperFeatureFlags.isTrinoSqlSchemaEnabled();
  const isTasksAvailable = HelperFeatureFlags.isTasksAvailable();
  const isReportingAvailable = HelperFeatureFlags.isReportingAvailable();
  const isProcessingManagerAvailable = HelperFeatureFlags.isProcessingManagerAvailable();

  const menuItems: MenuItem[] = [
    // Trino SQL Schemas - conditionally shown based on feature flag
    ...(isTrinoEnabled ? [{
      key: '/trino',
      icon: <DatabaseOutlined />,
      label: <span data-path="/trino">Trino SQL schemas</span>,
      title: 'Trino SQL schemas',
    }] : []),
    // Reporting - hidden under cyoda-go (uses /platform-* endpoints)
    ...(isReportingAvailable ? [{
      key: 'reporting',
      icon: collapsed ? (
        <Tooltip title="Reporting" placement="right">
          <span style={{ position: 'relative', display: 'inline-block' }}>
            <FileTextOutlined />
            {hasActiveChild('reporting') && !openKeys.includes('reporting') && (
              <span
                className="submenu-active-indicator"
                style={{
                  position: 'absolute',
                  top: '50%',
                  right: -12,
                  transform: 'translateY(-50%)',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #00d4aa 0%, #4d9fff 100%)',
                  boxShadow: '0 0 4px rgba(0, 212, 170, 0.6)',
                }}
              />
            )}
          </span>
        </Tooltip>
      ) : (
        <FileTextOutlined />
      ),
      label: 'Reporting',
      onTitleClick: () => handleSubMenuClick('reporting'),
      children: [
        {
          key: '/reporting/reports',
          icon: <BarChartOutlined />,
          label: <span data-path="/reporting/reports">Report config editor</span>,
          title: 'Report config editor',
        },
        {
          key: '/reporting/reports/stream',
          icon: <LineChartOutlined />,
          label: <span data-path="/reporting/reports/stream">Stream Reports</span>,
          title: 'Stream Reports',
        },
        {
          key: '/reporting/catalogue-of-aliases',
          icon: <TagsOutlined />,
          label: <span data-path="/reporting/catalogue-of-aliases">Catalog of aliases</span>,
          title: 'Catalog of aliases',
        },
      ],
    }] : []),
    {
      key: 'lifecycle',
      icon: collapsed ? (
        <Tooltip title="Lifecycle" placement="right">
          <span style={{ position: 'relative', display: 'inline-block' }}>
            <ApartmentOutlined />
            {hasActiveChild('lifecycle') && !openKeys.includes('lifecycle') && (
              <span
                className="submenu-active-indicator"
                style={{
                  position: 'absolute',
                  top: '50%',
                  right: -12,
                  transform: 'translateY(-50%)',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #00d4aa 0%, #4d9fff 100%)',
                  boxShadow: '0 0 4px rgba(0, 212, 170, 0.6)',
                }}
              />
            )}
          </span>
        </Tooltip>
      ) : (
        <ApartmentOutlined />
      ),
      label: 'Lifecycle',
      onTitleClick: () => handleSubMenuClick('lifecycle'),
      children: [
        {
          key: '/workflows',
          icon: <ProjectOutlined />,
          label: <span data-path="/workflows">Workflow</span>,
          title: 'Workflow',
        },
        {
          key: '/instances',
          icon: <AppstoreOutlined />,
          label: <span data-path="/instances">Instances</span>,
          title: 'Instances',
        },
      ],
    },
    // Tasks - hidden under cyoda-go and gated by VITE_FEATURE_FLAG_TASKS
    ...(isTasksAvailable ? [{
      key: '/tasks',
      icon: <CheckSquareOutlined />,
      label: <span data-path="/tasks">Tasks</span>,
      title: 'Tasks',
    }] : []),
    {
      key: '/entity-viewer',
      icon: <EyeOutlined />,
      label: <span data-path="/entity-viewer">Entity Model Viewer</span>,
      title: 'Entity Model Viewer',
    },
    // Processing - hidden under cyoda-go (uses /platform-processing endpoints)
    ...(isProcessingManagerAvailable ? [{
      key: '/processing-ui',
      icon: <ClusterOutlined />,
      label: <span data-path="/processing-ui">Processing</span>,
      title: 'Processing',
    }] : []),
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      title: 'Logout',
      danger: true,
    },
    {
      key: 'version',
      icon: <InfoCircleOutlined />,
      label: 'Version App',
      title: 'Version App',
    },
    {
      key: 'theme',
      icon: collapsed ? (
        <Tooltip title={mode === 'light' ? 'Light Theme' : 'Dark Theme'} placement="right">
          <BulbOutlined />
        </Tooltip>
      ) : (
        <BulbOutlined />
      ),
      label: collapsed ? (
        <span data-path="">Theme</span>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            paddingRight: 8,
          }}
          onClick={(e) => {
            e.stopPropagation();
            toggleMode();
          }}
        >
          <span>Theme</span>
          <Switch
            checked={mode === 'light'}
            size="small"
            checkedChildren="Light"
            unCheckedChildren="Dark"
            onClick={(checked, e) => {
              e.stopPropagation();
              toggleMode();
            }}
            style={{
              backgroundColor: mode === 'light' ? '#1DD1FF' : '#8B5CF6',
            }}
          />
        </div>
      ),
      title: 'Theme',
    },
  ];

  // Determine selected key based on current path
  const getSelectedKey = (): string[] => {
    const path = location.pathname;

    // Check for exact matches first
    if (path.startsWith('/trino')) return ['/trino'];
    if (path.startsWith('/reporting/reports/stream')) return ['/reporting/reports/stream'];
    if (path.startsWith('/reporting/catalogue-of-aliases')) return ['/reporting/catalogue-of-aliases'];
    if (path.startsWith('/reporting/reports')) return ['/reporting/reports'];
    if (path.startsWith('/workflows') || path.startsWith('/workflow/')) return ['/workflows'];
    if (path.startsWith('/instances') || path.startsWith('/instance/')) return ['/instances'];
    if (path.startsWith('/tasks')) return ['/tasks'];
    if (path.startsWith('/entity-viewer')) return ['/entity-viewer'];
    if (path.startsWith('/processing-ui')) return ['/processing-ui'];

    return [];
  };

  // Initialize openKeys on mount and when collapsed state changes
  useEffect(() => {
    if (collapsed) {
      // When collapsed, close all submenus
      setOpenKeys([]);
    } else {
      // When expanded (or on initial mount if not collapsed), open appropriate submenu
      const path = location.pathname;
      const keys: string[] = [];

      if (path.startsWith('/reporting')) {
        keys.push('reporting');
      }
      if (path.startsWith('/workflows') || path.startsWith('/instances') || path.startsWith('/workflow/') || path.startsWith('/instance/')) {
        keys.push('lifecycle');
      }

      setOpenKeys(keys);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed]); // Only react to collapsed state changes, not route changes

  // Handle submenu open/close
  const handleOpenChange = (keys: string[]) => {
    // Update openKeys in both collapsed and expanded modes
    // In collapsed mode, this shows submenu items inline
    // In expanded mode, this shows submenu items normally
    // Allow multiple submenus to be open in both modes
    setOpenKeys(keys);
  };



  return (
    <>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={onCollapse}
        width={250}
        collapsedWidth={80}
        theme="dark"
        className="saas-left-side-menu"
        trigger={null}
        style={{
          overflow: 'auto',
          height: 'calc(100vh - 64px)',
          position: 'fixed',
          left: 0,
          top: 64, // Below header
          bottom: 0,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }} onMouseUp={handleMouseUp}>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={getSelectedKey()}
            openKeys={openKeys}
            onOpenChange={handleOpenChange}
            onClick={handleMenuClick}
            items={menuItems}
            rootClassName={collapsed ? 'menu-collapsed' : ''}
            inlineIndent={0}
            inlineCollapsed={false}
            style={{
              borderRight: 0,
              borderInlineEnd: 0,
              flex: 1,
              border: 'none',
            }}
          />
          <div className="sidebar-collapse-trigger">
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => onCollapse(!collapsed)}
              style={{
                width: '100%',
                height: 48,
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 0,
                color: 'var(--refine-text-secondary)',
              }}
            />
          </div>
        </div>
      </Sider>

      {/* Logout Confirmation Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LogoutOutlined style={{ color: '#F59E0B', fontSize: 20 }} />
            <span>Confirm Logout</span>
          </div>
        }
        open={logoutModalVisible}
        onCancel={handleLogoutCancel}
        closable={true}
        footer={[
          <Button key="clear" onClick={handleLogoutAndClear}>
            Logout and Clear Data
          </Button>,
          <Button key="logout" danger onClick={handleLogout}>
            Logout
          </Button>,
        ]}
        width={500}
      >
        <p>Do you really want to logout?</p>
      </Modal>

      {/* Version Info Modal */}
      <Modal
        title=""
        open={versionModalVisible}
        onCancel={() => setVersionModalVisible(false)}
        footer={null}
        width={600}
      >
        <div>
          <h2>Platform</h2>
          <div className="detail-tree-item">
            <div className="title-value">
              <div className="name">Version:</div>
              <div className="value">-</div>
            </div>
          </div>
          <div className="detail-tree-item">
            <div className="title-value">
              <div className="name">Build Time:</div>
              <div className="value">-</div>
            </div>
          </div>
          <div className="detail-tree-item">
            <div className="title-value">
              <div className="name">Branch Name:</div>
              <div className="value">-</div>
            </div>
          </div>

          <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #d9d9d9' }} />

          <h2>Client</h2>
          <div className="detail-tree-item">
            <div className="title-value">
              <div className="name">Version:</div>
              <div className="value">-</div>
            </div>
          </div>
          <div className="detail-tree-item">
            <div className="title-value">
              <div className="name">Build Time:</div>
              <div className="value">-</div>
            </div>
          </div>
          <div className="detail-tree-item">
            <div className="title-value">
              <div className="name">Branch Name:</div>
              <div className="value">-</div>
            </div>
          </div>

          <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #d9d9d9' }} />

          <h2>UI</h2>
          <div className="detail-tree-item">
            <div className="title-value">
              <div className="name">Version:</div>
              <div className="value">{import.meta.env.VITE_APP_UI_VERSION || '1.0.0'}</div>
            </div>
          </div>
          <div className="detail-tree-item">
            <div className="title-value">
              <div className="name">Build Time:</div>
              <div className="value">{import.meta.env.VITE_APP_UI_BUILD_TIME || new Date().toISOString()}</div>
            </div>
          </div>
          <div className="detail-tree-item">
            <div className="title-value">
              <div className="name">Branch Name:</div>
              <div className="value">{import.meta.env.VITE_APP_UI_BRANCH_NAME || 'main'}</div>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
};

