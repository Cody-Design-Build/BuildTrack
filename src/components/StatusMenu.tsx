// The status control on budget and invoice pages: the status pill opens a list of every status.
// Statuses the record can't move to from where it is are shown but disabled, so the flow is visible.
import { Check, ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { tone } from '../colors';

export function StatusMenu<T extends string>({
  value, statuses, allowed, colors, onSelect, hint,
}: {
  value: T;
  statuses: readonly T[];
  allowed: readonly T[];
  colors: Record<T, string>;
  onSelect: (s: T) => void;
  hint?: string; // shown under the list, e.g. why earlier statuses are unavailable
}) {
  const c = tone(colors[value]);
  return (
    // not modal, so a dialog opened from an item (e.g. Approve) gets focus cleanly
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full py-0.5 pl-2 pr-1.5 text-xs font-medium outline-none ring-offset-2 transition-shadow hover:ring-1 focus-visible:ring-2"
        style={{ background: `color-mix(in oklab, ${c} 15%, transparent)`, color: `color-mix(in oklab, ${c} 78%, var(--foreground))`, ['--tw-ring-color' as string]: c }}
        aria-label={`Status: ${value}. Change status`}
      >
        <span className="size-1.5 rounded-full" style={{ background: c }} />
        {value}
        <ChevronDown className="size-3.5 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Set status</DropdownMenuLabel>
        {statuses.map((s) => {
          const current = s === value;
          return (
            <DropdownMenuItem key={s} disabled={!current && !allowed.includes(s)} onSelect={() => !current && onSelect(s)}>
              <span className="size-2 rounded-full" style={{ background: tone(colors[s]) }} />
              <span className="grow">{s}</span>
              {current && <Check className="size-4" />}
            </DropdownMenuItem>
          );
        })}
        {hint && (
          <>
            <DropdownMenuSeparator />
            <p className="px-2 py-1.5 text-xs text-muted-foreground">{hint}</p>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
