import { cn } from '@/lib/utils';

/** The BuildTrack mark: three rising schedule bars, the newest in the theme's primary colour. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={cn('size-6 shrink-0', className)}>
      <rect x="5" y="41" width="30" height="13" rx="3.5" fill="currentColor" />
      <rect x="17" y="25.5" width="30" height="13" rx="3.5" fill="currentColor" />
      <rect x="29" y="10" width="30" height="13" rx="3.5" fill="var(--primary)" />
    </svg>
  );
}
