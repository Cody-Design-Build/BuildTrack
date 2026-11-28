// Who is signed in. Kept apart from cloud.ts (which talks to Supabase) so that code shared with
// the agent server (src/agent/) can ask without pulling in the browser app.
export type SignedInAccount = { email: string; name: string };

let account: SignedInAccount | null = null;

/** The signed-in account (email and name), or null when not connected. */
export const signedInAccount = () => account;

export function setSignedInAccount(next: SignedInAccount | null) {
  account = next;
}
