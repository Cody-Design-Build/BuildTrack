/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_TEAM_DOMAIN?: string;
}

/** The build running here (see vite.config.ts). */
declare const __BUILD__: { version: string; commit: string; branch: string; env: string; built: string };
