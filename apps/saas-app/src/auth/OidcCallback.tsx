import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Result, Spin } from 'antd';
import { completeLogin } from './oidcClient';
import { isValidSession } from './session';
import { getDefaultRoute } from '../utils/defaultRoute';

/**
 * /oidc/callback: finishes the Authorization Code + PKCE exchange.
 */
export const OidcCallback: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const isCallback = params.has('code') || params.has('error');

    // Reload after a successful login: the state was already consumed.
    if (!isCallback && isValidSession()) {
      navigate(getDefaultRoute(), { replace: true });
      return;
    }

    completeLogin()
      .then(() => {
        if (!cancelled) navigate(getDefaultRoute(), { replace: true });
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (error) {
    return (
      <Result
        status="error"
        title="Sign-in failed"
        subTitle={error}
        extra={
          <Button type="primary" onClick={() => navigate('/login', { replace: true })}>
            Back to login
          </Button>
        }
      />
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <Spin size="large" />
    </div>
  );
};
