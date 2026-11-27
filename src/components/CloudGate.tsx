// Sign-in and first load when BuildTrack is connected to Supabase. Without a
// Supabase connection it just renders the app on this browser's storage.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LogOut } from 'lucide-react';
import { acceptInvites, cloud, createCompany, currentCompany, myCompanies, isTeamMember, loadDb, openCompany, saveChanges, signupOpen, teamIsSetUp, uploadDb, TEAM_DOMAIN } from '../cloud';
import { parseDb } from '../store';
import { seed, type Db } from '../data';

type State =
  | { step: 'checking' }
  | { step: 'signed-out' }
  | { step: 'not-allowed'; email: string; setUp: boolean }
  | { step: 'create-company'; email: string }
  | { step: 'loading'; note: string }
  | { step: 'ready'; db: Db }
  | { step: 'failed'; message: string };

export function CloudGate({ children }: { children: (initial: Db | undefined) => ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [state, setState] = useState<State>({ step: 'checking' });

  useEffect(() => {
    if (!cloud) return;
    cloud.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = cloud.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!cloud || session === undefined) return;
    if (!session) {
      setState({ step: 'signed-out' });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setState({ step: 'loading', note: 'Loading your team’s data…' });
        // Join any company that invited this email, then: no company yet means either
        // "create your company" (when sign-up is open) or "ask for an invite".
        await acceptInvites().catch(() => 0);
        if (!(await isTeamMember())) {
          if (await signupOpen().catch(() => false)) {
            if (!cancelled) setState({ step: 'create-company', email: session.user.email ?? '' });
            return;
          }
          const setUp = await teamIsSetUp().catch(() => true);
          if (!cancelled) setState({ step: 'not-allowed', email: session.user.email ?? 'This account', setUp });
          return;
        }
        await openCompany();
        const saved = await loadDb();
        let db: Db;
        if (saved) {
          // Run the same upgrades as browser data (e.g. sample records for a newer
          // feature), save what they added, and make sure every list exists.
          db = parseDb(JSON.stringify(saved));
          const full = db as Db & Record<string, unknown>;
          for (const [k, v] of Object.entries(seed())) if (Array.isArray(v) && !Array.isArray(full[k])) full[k] = [];
          await saveChanges(saved, db);
        } else {
          // A new company's first sign-in: start it on the sample data. (Never this browser's
          // saved copy, which may be another company's data.)
          if (!cancelled) setState({ step: 'loading', note: 'Setting up your company’s data…' });
          db = seed();
          const company = myCompanies().find((c) => c.id === currentCompany());
          if (company?.name) db = { ...db, companyName: company.name };
          await uploadDb(db);
        }
        if (!cancelled) setState({ step: 'ready', db });
      } catch (e) {
        if (!cancelled) setState({ step: 'failed', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only re-run when a different person signs in, not on token refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session === undefined, userId]);

  if (!cloud) return <>{children(undefined)}</>;
  if (state.step === 'ready') return <>{children(state.db)}</>;
  return <Screen state={state} />;
}

function signIn() {
  cloud!.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.href,
      queryParams: { prompt: 'select_account', ...(TEAM_DOMAIN ? { hd: TEAM_DOMAIN } : {}) },
    },
  });
}

export const signOut = () => cloud?.auth.signOut();

function Screen({ state }: { state: State }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="mb-6 text-xl font-semibold tracking-tight">BuildTrack</div>
        {(state.step === 'checking' || state.step === 'loading') && (
          <p className="text-sm text-muted-foreground">{state.step === 'loading' ? state.note : 'Checking sign-in…'}</p>
        )}
        {state.step === 'signed-out' && <SignIn />}
        {state.step === 'create-company' && <CreateCompany email={state.email} />}
        {state.step === 'not-allowed' && (
          <>
            {state.setUp ? (
              <p className="mb-6 text-sm text-muted-foreground">
                <b className="text-foreground">{state.email}</b> isn’t on a BuildTrack team yet. Ask whoever runs your company’s BuildTrack to invite this address
                {TEAM_DOMAIN ? <>, or sign in with your @{TEAM_DOMAIN} account</> : ''}.
              </p>
            ) : (
              <p className="mb-6 text-left text-sm text-muted-foreground">
                This BuildTrack hasn’t been told who its team is yet, so nobody can sign in. Whoever installed it needs to run{' '}
                <code className="rounded bg-muted px-1 font-mono text-xs text-foreground">npm run team:allow -- yourcompany.com</code>{' '}
                (see “Run BuildTrack for your team” in the docs).
              </p>
            )}
            <button type="button" onClick={signOut} className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-muted">
              <LogOut className="size-4" /> Use a different account
            </button>
          </>
        )}
        {state.step === 'failed' && (
          <>
            <p className="mb-2 text-sm">Couldn’t load the team’s data.</p>
            <p className="mb-6 break-words text-xs text-muted-foreground">{state.message}</p>
            <div className="flex justify-center gap-2">
              <button type="button" onClick={() => window.location.reload()} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
                Try again
              </button>
              <button type="button" onClick={signOut} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-4" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

const input = 'w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';
const primary = 'w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50';

/** Google, or an emailed 6-digit code. New addresses get an account automatically. */
function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await cloud!.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  };
  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await cloud!.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setError(error.message === 'Token has expired or is invalid' ? 'That code is wrong or has expired. Try again or send a new one.' : error.message);
    // on success the session changes and CloudGate moves on
  };

  return (
    <div className="text-left">
      <button
        type="button"
        onClick={signIn}
        className="flex w-full items-center justify-center gap-2 rounded-md border bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
      >
        <GoogleMark /> Continue with Google
      </button>
      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or with your email <span className="h-px flex-1 bg-border" />
      </div>
      {!sent ? (
        <form onSubmit={send} className="space-y-3">
          <input className={input} type="email" required autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
          <button type="submit" className={primary} disabled={busy || !email.includes('@')}>{busy ? 'Sending…' : 'Email me a sign-in code'}</button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          <p className="text-sm text-muted-foreground">We sent a 6-digit code to <b className="text-foreground">{email}</b>. It works for an hour.</p>
          <input
            className={input + ' text-center font-mono text-lg tracking-[0.4em]'}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            placeholder="••••••"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            aria-label="Sign-in code"
            autoFocus
          />
          <button type="submit" className={primary} disabled={busy || code.length < 6}>{busy ? 'Checking…' : 'Sign in'}</button>
          <div className="flex justify-between text-xs text-muted-foreground">
            <button type="button" className="hover:text-foreground" onClick={() => { setSent(false); setCode(''); setError(''); }}>Use a different email</button>
            <button type="button" className="hover:text-foreground" onClick={() => send()} disabled={busy}>Send a new code</button>
          </div>
        </form>
      )}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      <p className="mt-5 text-center text-xs text-muted-foreground">New here? Signing in creates your account.</p>
    </div>
  );
}

/** First sign-in with no company: name it and start (on sample data you can clear later). */
function CreateCompany({ email }: { email: string }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await createCompany(name);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };
  return (
    <form onSubmit={create} className="space-y-3 text-left">
      <p className="text-sm text-muted-foreground">
        Welcome! <b className="text-foreground">{email}</b> isn’t on a team yet. Set up your company, or ask a teammate to invite this address.
      </p>
      <input className={input} required placeholder="Company name, e.g. Acme Design Build" value={name} onChange={(e) => setName(e.target.value)} aria-label="Company name" autoFocus />
      <button type="submit" className={primary} disabled={busy || !name.trim()}>{busy ? 'Setting up…' : 'Create company'}</button>
      <p className="text-xs text-muted-foreground">It starts with sample jobs, customers and subs so you can look around.</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button type="button" onClick={signOut} className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
        <LogOut className="size-3.5" /> Use a different account
      </button>
    </form>
  );
}

