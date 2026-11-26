// The "Lines / Lines + document / Document" switch shared by budget and invoice pages.
import { useState } from 'react';

/** A choice remembered in this browser only (per viewer), e.g. the page layout. */
export function useRememberedChoice<T extends string>(key: string, allowed: readonly T[], fallback: T, shouldRemember: (v: T) => boolean = () => true): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const v = localStorage.getItem(key) as T | null;
      if (v && allowed.includes(v) && shouldRemember(v)) return v;
    } catch {
      /* storage unavailable */
    }
    return fallback;
  });
  return [value, (v) => {
    setValue(v);
    try {
      if (shouldRemember(v)) localStorage.setItem(key, v);
    } catch {
      /* storage unavailable */
    }
  }];
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="inline-flex rounded-lg border bg-muted/40 p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          className={'rounded-md px-3 py-1 text-sm font-medium transition-colors ' + (value === o.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
