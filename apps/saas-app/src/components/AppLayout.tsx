import React from 'react';
import { Layout } from 'antd';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { AppHeader } from './AppHeader';
import { LeftSideMenu } from './LeftSideMenu';
import { useAppStore } from '@cyoda/cyoda-sass-react';
import { isValidSession } from '../auth/session';
import './AppLayout.scss';

const { Content } = Layout;

export const AppLayout: React.FC = () => {
  // Use persisted store for menu collapse state
  const isToggledMenu = useAppStore((state) => state.isToggledMenu);
  const toggleMenu = useAppStore((state) => state.toggleMenu);
  // Subscribe to navigation so the guard re-runs on every route change.
  useLocation();

  // Synchronous guard: never render children (and their API calls) without a session.
  if (!isValidSession()) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Layout className="saas-app-layout">
      <AppHeader />
      <Layout hasSider>
        <LeftSideMenu collapsed={isToggledMenu} onCollapse={toggleMenu} />
        <Layout
          style={{
            marginLeft: isToggledMenu ? 80 : 250,
            marginTop: 56,
            transition: 'margin-left 0.2s',
          }}
        >
          <Content className="saas-app-content">
            <div className="content-wrapper">
              <Outlet />
            </div>
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
};

