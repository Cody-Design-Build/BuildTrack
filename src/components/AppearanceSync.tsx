// Keeps the person's look and presets in step with their Preferences record in the
// shared data, so they follow them to any device, and starts people who have never
// changed their look on the company theme. Renders nothing.
import { useEffect, useRef } from 'react';
import { cloud } from '../cloud';
import { meOf, useStore } from '../store';
import { adoptCompanyLook, adoptRemote, useLookState } from '../appearance';
import type { Preferences } from '../theming/types';

export function AppearanceSync() {
  const { db, update } = useStore();
  const local = useLookState();
  const me = meOf(db);
  const mine = me ? db.preferences?.find((p) => p.id === me.id) : undefined;
  const pushed = useRef('');

  // Arriving from elsewhere: a newer save on another device, or the company theme.
  useEffect(() => {
    if (mine && mine.updated > local.updated) adoptRemote(mine);
    else if (!mine && !local.customized && db.companyLook) adoptCompanyLook(db.companyLook);
    // Only when the shared copy or the company theme changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine?.updated, db.companyLook]);

  // Leaving: the person changed something here. Only on shared data; in a browser on its
  // own, this browser's storage already remembers it.
  useEffect(() => {
    if (!cloud || !me || !local.customized || !local.updated) return;
    if (mine && mine.updated >= local.updated) return;
    if (pushed.current === local.updated) return;
    pushed.current = local.updated;
    const record: Preferences = { id: me.id, look: local.look, presets: local.presets, updated: local.updated };
    update((d) => ({ ...d, preferences: [...(d.preferences ?? []).filter((p) => p.id !== me.id), record] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local.updated, me?.id]);

  return null;
}
