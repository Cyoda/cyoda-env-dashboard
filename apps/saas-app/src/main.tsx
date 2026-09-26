import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerTokenRefresher } from '@cyoda/http-api-react';
import App from './App';
import { isOidcEnabled, refreshToken, clearSession } from './auth/oidcClient';
import { purgeLegacyAuth0Cache } from './auth/session';
import 'antd/dist/reset.css';
import './main.scss';


// CRITICAL: Import fixed columns override LAST to ensure maximum specificity
import './fixed-columns-override.css';

// The old @auth0/auth0-react cache holds refresh tokens; drop it.
purgeLegacyAuth0Cache();

if (isOidcEnabled()) {
  registerTokenRefresher('oidc', refreshToken, { clearSession });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
