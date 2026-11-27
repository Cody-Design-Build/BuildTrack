// Building blocks shared by the People and Accounts pages.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export function Section({ title, count, action, children, className }: { title: string; count?: number; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn('gap-0 py-0', className)}>
      <CardHeader className="border-b px-5 py-3.5 [.border-b]:pb-3.5">
        <CardTitle className="flex items-center gap-2 text-[15px]">
          {title}
          {count !== undefined && <Badge variant="secondary" className="tabular-nums">{count}</Badge>}
        </CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="p-2">{children}</CardContent>
    </Card>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-3 py-6 text-center text-sm text-muted-foreground">{children}</div>;
}

/** One line in a section list: something on the left, details and an action on the right. */
export function Row({ children, onClick, className }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <div
      className={cn('group flex min-h-12 items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/60', onClick && 'cursor-pointer', className)}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

export function InfoLine({ icon: Icon, children, empty }: { icon: LucideIcon; children?: ReactNode; empty: string }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      {children ? <span className="min-w-0 break-words text-foreground">{children}</span> : <span className="text-muted-foreground">{empty}</span>}
    </div>
  );
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> {children}
    </Link>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="bg-card pl-8" />
    </div>
  );
}

/** One line in the money card on a job's Overview tab (what plugins' jobSummary renders). */
export function SummaryRow({ label, children, danger }: { label: string; children: ReactNode; danger?: boolean }) {
  return <div className="j-row"><span>{label}</span><b className={danger ? 'text-destructive' : ''}>{children}</b></div>;
}
