#!/bin/sh
# Regenerate /usr/share/nginx/html/config.js from environment variables before
# nginx starts. Dropped into /docker-entrypoint.d/ by the Dockerfile so the
# nginx image's standard entrypoint runs it on every container start.
#
# Vite inlines `import.meta.env.*` at build time, so to keep config changes
# rebuild-free the SPA reads window.__APP_CONFIG__ — populated by this file.
set -eu

: "${NEXTCLOUD_ENABLED:=true}"

CONFIG_PATH=/usr/share/nginx/html/config.js

cat > "${CONFIG_PATH}" <<EOF
// Generated at container start by /docker-entrypoint.d/30-render-config.sh.
window.__APP_CONFIG__ = {
  NEXTCLOUD_ENABLED: "${NEXTCLOUD_ENABLED}",
};
EOF
