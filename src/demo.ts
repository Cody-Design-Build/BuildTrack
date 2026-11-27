// The public demo (demo.buildtrack.run) is the normal app built with VITE_DEMO=1 and
// no Supabase settings: every visitor gets the sample data in their own browser,
// with nothing shared and no sign-in. Demo mode only adds a notice and labels; it
// must never change how data is stored.
// Never with a database: the demo's "Start over" resets all data, which must only
// ever be the visitor's own browser copy.
export const DEMO = import.meta.env.VITE_DEMO === '1' && !import.meta.env.VITE_SUPABASE_URL;

export const REPO_URL = 'https://github.com/Cody-Design-Build/BuildTrack';
