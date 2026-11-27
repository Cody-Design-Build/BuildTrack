/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_TEAM_DOMAIN?: string;
  /** '1' for the public demo build (see src/demo.ts). */
  readonly VITE_DEMO?: string;
}

/** The build running here (see vite.config.ts). */
declare const __BUILD__: { version: string; commit: string; branch: string; env: string; built: string };
