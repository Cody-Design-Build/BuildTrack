import { useEffect, useState } from 'react';
import { cloud, companyTeam, signedInAccount } from '../cloud';

/**
 * Whether the signed-in person is an owner or admin of the open company (always true in the
 * browser-only version). The database enforces it too; this only decides what the app offers.
 */
export function useIsAdmin(): boolean {
  const [admin, setAdmin] = useState(!cloud);
  useEffect(() => {
    if (!cloud) return;
    const email = signedInAccount()?.email;
    companyTeam()
      .then((team) => setAdmin(team.some((t) => t.email.toLowerCase() === email && (t.role === 'owner' || t.role === 'admin'))))
      .catch(() => setAdmin(false));
  }, []);
  return admin;
}
