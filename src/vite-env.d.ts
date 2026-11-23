interface ImportMetaEnv {
  /** The Supabase project that holds the leaderboard, e.g. https://abcd.supabase.co. Optional. */
  readonly VITE_SUPABASE_URL?: string;
  /** That project's public (anon or publishable) key. Never the service key. Optional. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
