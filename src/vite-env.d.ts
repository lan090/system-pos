/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

/**
 * Vite Client Type Declarations for FSRMS v2.0
 *
 * This file augments the global `ImportMeta` interface so TypeScript
 * recognises `import.meta.env.VITE_*` variables defined in `.env.local`.
 *
 * Required because tsconfig.json does not include `"types": ["vite/client"]`
 * — the triple-slash reference here achieves the same result per-project.
 */
interface ImportMetaEnv {
  /** Supabase project REST API URL — e.g. https://xxxx.supabase.co */
  readonly VITE_SUPABASE_URL: string;
  /** Supabase anonymous (public) key — safe to expose in frontend bundles */
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
