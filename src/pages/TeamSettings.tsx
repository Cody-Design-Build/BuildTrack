// Settings → Members: who's in this company, and inviting more people (owners and admins).
// Only shown when connected to Supabase. BuildTrack is invite-only: an invite is for one
// email address, works once and expires after 7 days. Invites go out by email the way
// bids do: BuildTrack writes the message, you send it.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Copy, Mail, RotateCw, Trash2, UserPlus } from 'lucide-react';
import { cancelInvite, cloud, companyTeam, inviteMember, setMemberRole, type Role, type TeamEntry } from '../cloud';
import { useStore } from '../store';

/** "Expires in 3 days", "Expires today" or "Expired". */
function expiry(at: string | null) {
  if (!at) return '';
  const days = Math.ceil((new Date(at).getTime() - Date.now()) / 86_400_000);
  return days <= 0 ? 'Expired' : days === 1 ? 'Expires within a day' : `Expires in ${days} days`;
}

const ROLE_HELP: Record<Role, string> = {
  owner: 'Everything, including managing owners',
  admin: 'Everything, including inviting and removing people',
  member: 'Uses BuildTrack; can’t manage the team',
};

function inviteText(company: string, email: string) {
  const url = window.location.origin;
  return {
    subject: `Join ${company} on BuildTrack`,
    body: `You're invited to ${company} on BuildTrack.\n\nGo to ${url} within 7 days and sign in with ${email} (Google, or a code we email you). You'll join ${company} automatically.`,
  };
}

export function TeamSettings() {
  const { db } = useStore();
  const [team, setTeam] = useState<TeamEntry[] | null>(null);
  const [me, setMe] = useState('');
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');

  const load = useCallback(() => companyTeam().then(setTeam).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
    cloud!.auth.getUser().then(({ data }) => setMe(data.user?.id ?? ''));
  }, [load]);

  const myRole = team?.find((t) => t.user_id === me)?.role;
  const canManage = myRole === 'owner' || myRole === 'admin';
  const act = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const invite = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await act(() => inviteMember(email.trim(), role));
    setEmail('');
    setBusy(false);
  };
  const copy = async (address: string) => {
    const t = inviteText(db.companyName, address);
    await navigator.clipboard?.writeText(`${t.subject}\n\n${t.body}`).catch(() => {});
    setCopied(address);
    setTimeout(() => setCopied(''), 2000);
  };

  const members = team?.filter((t) => !t.pending) ?? [];
  const invites = team?.filter((t) => t.pending) ?? [];

  return (
    <>
      <section className="card">
        <div className="card-head"><h2>Members</h2></div>
        <div className="card-body space-y-1">
          <p className="form-note mb-3 text-muted-foreground">Everyone who can sign in to {db.companyName}.</p>
          {!team && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
          {members.map((m) => (
            <div key={m.user_id} className="flex flex-wrap items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/50">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{m.email}{m.user_id === me && <span className="ml-2 text-xs font-normal text-muted-foreground">You</span>}</div>
                <div className="text-xs text-muted-foreground">{ROLE_HELP[m.role]}</div>
              </div>
              <select
                className="b-input"
                value={m.role}
                disabled={!canManage || (m.role === 'owner' && myRole !== 'owner')}
                aria-label={`Role for ${m.email}`}
                onChange={(e) => act(() => setMemberRole(m.user_id!, e.target.value as Role))}
              >
                {(myRole === 'owner' ? ['owner', 'admin', 'member'] : m.role === 'owner' ? ['owner'] : ['admin', 'member']).map((r) => (
                  <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>
                ))}
              </select>
              {(canManage || m.user_id === me) && (
                <button
                  type="button"
                  className="btn btn-sm"
                  aria-label={m.user_id === me ? 'Leave the company' : `Remove ${m.email}`}
                  onClick={() => confirm(m.user_id === me ? `Leave ${db.companyName}? You'll lose access until someone invites you again.` : `Remove ${m.email} from ${db.companyName}?`) && act(() => setMemberRole(m.user_id!, null))}
                >
                  <Trash2 size={14} /> {m.user_id === me ? 'Leave' : 'Remove'}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {canManage && (
        <section className="card">
          <div className="card-head"><h2>Invite people</h2></div>
          <div className="card-body">
            <p className="form-note mb-3 text-muted-foreground">
              Add their email, then send them the invite. It’s for that one address, works once and expires after 7 days. When they sign in with it, by Google or an emailed code, they join {db.companyName}.
            </p>
            <form onSubmit={invite} className="flex flex-wrap gap-2">
              <input className="b-input min-w-56 flex-1" type="email" required placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email to invite" />
              <select className="b-input" value={role} onChange={(e) => setRole(e.target.value as 'member' | 'admin')} aria-label="Role">
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button type="submit" className="btn primary" disabled={busy || !email.includes('@')}><UserPlus size={14} /> Invite</button>
            </form>
            {invites.length > 0 && (
              <div className="mt-4 space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Invited, not signed in yet</div>
                {invites.map((i) => {
                  const t = inviteText(db.companyName, i.email);
                  const expired = expiry(i.expires_at) === 'Expired';
                  return (
                    <div key={i.email} className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/50">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{i.email}</div>
                        <div className={'text-xs ' + (expired ? 'text-destructive' : 'text-muted-foreground')}>Invited as {i.role} · {expiry(i.expires_at)}</div>
                      </div>
                      {expired && (
                        <button type="button" className="btn btn-sm" onClick={() => act(() => inviteMember(i.email, i.role === 'admin' ? 'admin' : 'member'))}><RotateCw size={14} /> Invite again</button>
                      )}
                      {!expired && <a className="btn btn-sm" href={`mailto:${i.email}?subject=${encodeURIComponent(t.subject)}&body=${encodeURIComponent(t.body)}`}><Mail size={14} /> Email invite</a>}
                      {!expired && <button type="button" className="btn btn-sm" onClick={() => copy(i.email)}><Copy size={14} /> {copied === i.email ? 'Copied' : 'Copy'}</button>}
                      <button type="button" className="btn btn-sm" aria-label={`Cancel invite for ${i.email}`} onClick={() => act(() => cancelInvite(i.email))}><Trash2 size={14} /></button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </>
  );
}
