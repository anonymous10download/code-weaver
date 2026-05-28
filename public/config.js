// Runtime config. In the production container this file is regenerated from
// environment variables by /docker-entrypoint.d/30-render-config.sh before
// nginx starts, so values can be changed without rebuilding the image.
// The committed defaults below are what `vite dev` (and the build output)
// ship with when no entrypoint has run.
window.__APP_CONFIG__ = {
  NEXTCLOUD_ENABLED: "true",
};
