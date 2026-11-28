// /oauth/consent: where an AI agent sends someone to approve it (Supabase's OAuth server, see
// docs/agents.md). The person is already signed in (CloudGate), so this only asks "let this
// agent use BuildTrack as you?" and hands the answer back to Supabase.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bot } from 'lucide-react';
import { cloud } from '../cloud';
import { PageHeader } from '../components/Layout';

type Details = { client: { name: string; uri: string }; user: { email: string }; redirect_uri: string };

export default function AgentConsent() {
  const [params] = useSearchParams();
  const id = params.get('authorization_id') ?? '';
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!cloud) return setError('Agents work with the live app’s shared data. This copy of BuildTrack runs in your browser only.');
    if (!id) return setError('This link is missing its authorization request. Start connecting from your agent again.');
    cloud.auth.oauth.getAuthorizationDetails(id).then(({ data, error: e }) => {
      if (e || !data) return setError(e?.message ?? 'This request has expired. Start connecting from your agent again.');
      if ('redirect_url' in data) return void window.location.assign(data.redirect_url); // approved before
      setDetails(data as Details);
    });
  }, [id]);

  const answer = async (approve: boolean) => {
    setBusy(true);
    const fn = approve ? cloud!.auth.oauth.approveAuthorization : cloud!.auth.oauth.denyAuthorization;
    const { data, error: e } = await fn.call(cloud!.auth.oauth, id, { skipBrowserRedirect: true });
    if (e || !data) {
      setBusy(false);
      return setError(e?.message ?? 'Something went wrong. Start connecting from your agent again.');
    }
    window.location.assign(data.redirect_url);
  };

  return (
    <div className="page scroll">
      <PageHeader title="Connect an agent" />
      <div className="mx-auto max-w-lg p-4">
        <section className="card">
          <div className="card-body space-y-4">
            {error && <p className="text-sm">{error}</p>}
            {!error && !details && <p className="text-sm text-muted-foreground">Loading…</p>}
            {details && (
              <>
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-muted"><Bot size={20} /></span>
                  <div className="min-w-0">
                    <div className="font-medium">{details.client.name || 'An agent'}</div>
                    <div className="truncate text-xs text-muted-foreground">{details.client.uri || new URL(details.redirect_uri).host}</div>
                  </div>
                </div>
                <p className="text-sm">
                  wants to use BuildTrack as <b>{details.user.email}</b>. It will be able to read and change your company's jobs, contacts, budgets, bids, invoices, bills, tasks, settings and skills, as you, with the same access you have. It asks you before anything that matters, like sending, approving, paying or inviting.
                </p>
                <p className="text-xs text-muted-foreground">Only approve agents you started connecting yourself. You can disconnect it any time in Settings → Agents.</p>
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn" disabled={busy} onClick={() => answer(false)}>Deny</button>
                  <button type="button" className="btn primary" disabled={busy} onClick={() => answer(true)}>Approve</button>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
