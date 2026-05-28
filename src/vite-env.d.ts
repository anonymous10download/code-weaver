/// <reference types="vite/client" />

// Runtime config injected by /config.js (see public/config.js). The production
// container rewrites that file from env vars at startup so flags can change
// without a rebuild. Reads should tolerate the global being undefined (e.g.
// in vitest, where /config.js isn't loaded).
declare global {
  interface Window {
    __APP_CONFIG__?: {
      NEXTCLOUD_ENABLED?: string;
    };
  }
}

export {};
