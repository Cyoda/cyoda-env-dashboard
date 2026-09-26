#!/usr/bin/env bash
# Registers the Cyoda dashboard as a public OIDC client (auth code + PKCE, no secret)
# named "cyoda-dashboard" under the ctcc Zitadel project "ctcc-app", and prints the
# VITE_APP_OIDC_* lines to paste into apps/saas-app/.env.development.local.
#
# Idempotent: an existing cyoda-dashboard app is reused and its OIDC config updated,
# so a changed DASHBOARD_URL takes effect. Zitadel answers an unchanged update with a
# "No changes" precondition error (COMMAND-1m88i), which counts as success.
#
# Requires the ctcc stack running and ctcc's infra/zitadel/seed.sh already run.
#
# Env:
#   CTCC_DIR           ctcc-management checkout   (default: ../ctcc-management next to this repo)
#   CTCC_ZITADEL_BASE  Zitadel base URL           (default: http://auth.localtest.me:8081)
#   DASHBOARD_URL      dashboard origin           (default: http://localhost:5180)
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CTCC_DIR="${CTCC_DIR:-$REPO_ROOT/../ctcc-management}"
Z="${CTCC_ZITADEL_BASE:-http://auth.localtest.me:8081}"; Z="${Z%/}"
DASHBOARD_URL="${DASHBOARD_URL:-http://localhost:5180}"
while [[ $DASHBOARD_URL == */ ]]; do DASHBOARD_URL="${DASHBOARD_URL%/}"; done
APP_NAME="cyoda-dashboard"

command -v jq >/dev/null || { echo "ERROR: jq is required" >&2; exit 1; }

PAT_FILE="$CTCC_DIR/infra/zitadel/machinekey/ctcc-seeder.pat"
if [ ! -s "$PAT_FILE" ]; then
  echo "ERROR: $PAT_FILE is empty/missing — run ctcc's infra/zitadel/seed.sh first (or set CTCC_DIR)" >&2
  exit 1
fi
PAT=$(cat "$PAT_FILE")

api() { curl -s -H "Authorization: Bearer $PAT" -H 'Content-Type: application/json' "$@"; }

PID=$(api -X POST "$Z/management/v1/projects/_search" -d '{}' \
  | jq -r '.result[]? | select(.name=="ctcc-app") | .id' | head -n1)
if [ -z "$PID" ] || [ "$PID" = "null" ]; then
  echo "ERROR: project ctcc-app not found at $Z (run ctcc's infra/zitadel/seed.sh first)" >&2
  exit 1
fi

# Public user-agent client: PKCE, no secret. JWT access tokens so cyoda-go can
# validate them; role/userinfo assertions so tokens carry roles and a display name.
# devMode permits http redirect URIs on localhost.
OIDC_CONFIG=$(jq -n \
  --arg cb "$DASHBOARD_URL/oidc/callback" \
  --arg lo "$DASHBOARD_URL/login" \
  '{
    redirectUris: [$cb],
    postLogoutRedirectUris: [$lo],
    responseTypes: ["OIDC_RESPONSE_TYPE_CODE"],
    grantTypes: ["OIDC_GRANT_TYPE_AUTHORIZATION_CODE", "OIDC_GRANT_TYPE_REFRESH_TOKEN"],
    appType: "OIDC_APP_TYPE_USER_AGENT",
    authMethodType: "OIDC_AUTH_METHOD_TYPE_NONE",
    devMode: true,
    accessTokenType: "OIDC_TOKEN_TYPE_JWT",
    accessTokenRoleAssertion: true,
    idTokenRoleAssertion: true,
    idTokenUserinfoAssertion: true
  }')

EXISTING=$(api -X POST "$Z/management/v1/projects/$PID/apps/_search" -d '{}' \
  | jq -c --arg n "$APP_NAME" '[.result[]? | select(.name==$n)][0] // empty')

if [ -n "$EXISTING" ]; then
  APP_ID=$(jq -r '.id' <<<"$EXISTING")
  CLIENT_ID=$(jq -r '.oidcConfig.clientId // empty' <<<"$EXISTING")
  RESP=$(api -X PUT "$Z/management/v1/projects/$PID/apps/$APP_ID/oidc_config" -d "$OIDC_CONFIG")
  if jq -e 'has("code")' >/dev/null 2>&1 <<<"$RESP" && ! grep -qE 'COMMAND-1m88i|No changes' <<<"$RESP"; then
    echo "ERROR: updating $APP_NAME failed:" >&2
    jq '.' <<<"$RESP" >&2
    exit 1
  fi
  echo "reused $APP_NAME app $APP_ID (config updated for $DASHBOARD_URL)" >&2
else
  RESP=$(api -X POST "$Z/management/v1/projects/$PID/apps/oidc" \
    -d "$(jq --arg n "$APP_NAME" '. + {name: $n}' <<<"$OIDC_CONFIG")")
  CLIENT_ID=$(jq -r '.clientId // empty' <<<"$RESP")
  if [ -z "$CLIENT_ID" ]; then
    echo "ERROR: creating $APP_NAME failed:" >&2
    jq '.' <<<"$RESP" >&2
    exit 1
  fi
  echo "created $APP_NAME app $(jq -r '.appId' <<<"$RESP")" >&2
fi

if [ -z "$CLIENT_ID" ]; then
  echo "ERROR: could not determine the client id of $APP_NAME" >&2
  exit 1
fi

cat <<EOF
# Paste into apps/saas-app/.env.development.local, then run: pnpm dev --port ${DASHBOARD_URL##*:} --strictPort
VITE_FEATURE_FLAG_IS_CYODA_GO=true
VITE_APP_OIDC_DISPLAY_NAME=Zitadel
VITE_APP_OIDC_ISSUER=$Z
VITE_APP_OIDC_CLIENT_ID=$CLIENT_ID
VITE_APP_OIDC_SCOPES=openid profile email offline_access urn:zitadel:iam:org:project:roles
EOF
