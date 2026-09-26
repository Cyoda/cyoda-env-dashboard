import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Form, Input, Button, Card, App, Divider, Alert } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { login, HelperStorage, HelperFeatureFlags } from '@cyoda/http-api-react';
import { isOidcEnabled, getOidcDisplayName, startLogin } from '../auth/oidcClient';
import { getDefaultRoute } from '../utils/defaultRoute';
import './Login.scss';

const helperStorage = new HelperStorage();

const REASON_NOTICES: Record<string, { type: 'info' | 'warning'; text: string }> = {
  expired: { type: 'info', text: 'Your session expired. Please log in again.' },
  rejected: {
    type: 'warning',
    text: 'The server rejected your credentials. If this persists, check that the backend trusts this identity provider.',
  },
};

interface LoginFormValues {
  username: string;
  password: string;
}

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [oidcLoading, setOidcLoading] = useState(false);
  const { message } = App.useApp();

  const showPasswordForm = !HelperFeatureFlags.isCyodaGo();
  const showOidc = isOidcEnabled();
  const displayName = getOidcDisplayName();
  const notice = REASON_NOTICES[searchParams.get('reason') ?? ''];

  // A back-forward-cache restore after starting the redirect must not leave the button spinning.
  useEffect(() => {
    const reset = () => setOidcLoading(false);
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  // Standard username/password login
  const onFinish = async (values: LoginFormValues) => {
    setLoading(true);
    try {
      const response = await login(values.username, values.password);
      const authData = response.data;

      helperStorage.set('auth', {
        token: authData.token,
        refreshToken: authData.refreshToken,
        user: authData.username,
        userId: authData.userId,
        legalEntityId: authData.legalEntityId,
        type: 'standard'
      });

      navigate(getDefaultRoute());
    } catch (error: any) {
      console.error('Login error:', error);
      const errorMessage = error?.response?.data?.message || 'Login failed. Please check your credentials.';
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleOidcLogin = () => {
    setOidcLoading(true);
    startLogin()
      .catch((err: unknown) => {
        const reason = err instanceof Error ? err.message : String(err);
        message.error(`Login with ${displayName} failed: ${reason}`);
      })
      .finally(() => setOidcLoading(false));
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <div className="logo-container">
            <img
              src="/assets/images/cyoda-logo-green.svg"
              alt="CYODA"
              className="logo"
            />
          </div>
        </div>

        <Card className="login-card" variant="borderless">
          {notice && (
            <Alert type={notice.type} message={notice.text} showIcon style={{ marginBottom: 24 }} />
          )}

          {!showPasswordForm && !showOidc && (
            <Alert
              type="error"
              showIcon
              message="No login method is configured"
              description="This build runs against cyoda-go, which needs OIDC login. Set VITE_APP_OIDC_* (see ENV_FILES_GUIDE.md)."
            />
          )}

          {showPasswordForm && (
            <Form
              name="login"
              onFinish={onFinish}
              autoComplete="off"
              layout="vertical"
            >
              <Form.Item
                name="username"
                rules={[{ required: true, message: 'Please input your username!' }]}
              >
                <Input
                  prefix={<UserOutlined />}
                  placeholder="Username"
                  size="large"
                />
              </Form.Item>

              <Form.Item
                name="password"
                rules={[{ required: true, message: 'Please input your password!' }]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="Password"
                  size="large"
                />
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  size="large"
                  block
                >
                  Log in
                </Button>
              </Form.Item>
            </Form>
          )}

          {showPasswordForm && showOidc && (
            <Divider style={{ margin: '24px 0' }}>
              <span style={{ fontSize: '13px' }}>OR</span>
            </Divider>
          )}

          {showOidc && (
            <Button
              type="default"
              size="large"
              block
              loading={oidcLoading}
              onClick={handleOidcLogin}
            >
              Login with {displayName}
            </Button>
          )}
        </Card>

        <div className="login-footer">
          <p>&copy; {new Date().getFullYear()} Cyoda. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
