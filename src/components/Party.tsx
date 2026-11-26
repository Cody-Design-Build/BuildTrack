// Shared pieces for showing and choosing "parties": a person or an account.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Check, ChevronsUpDown, Plus, User, X } from 'lucide-react';
import { useLookups, useStore, initials, personName, type Party } from '../store';
import { Avatar } from './Layout';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function PartyAvatar({ party, size = 24 }: { party: Party; size?: number }) {
  return <Avatar text={initials(party.name)} color={party.color} size={size} square={party.kind === 'account'} />;
}

/** A person's or account's name with its avatar, linking to its page. */
export function PartyLink({ id, size = 22, className }: { id: string; size?: number; className?: string }) {
  const L = useLookups();
  const party = L.party.get(id);
  if (!party) return <span className="text-muted-foreground">—</span>;
  return (
    <Link
      to={party.href}
      onClick={(e) => e.stopPropagation()}
      className={cn('inline-flex min-w-0 items-center gap-2 font-medium text-foreground hover:text-primary', className)}
    >
      <PartyAvatar party={party} size={size} />
      <span className="truncate">{party.name}</span>
    </Link>
  );
}

const ROLE_STYLE: Record<string, string> = {
  Customer: 'bg-primary/10 text-primary border-primary/20',
  Subcontractor: 'bg-sky-500/10 text-sky-700 border-sky-500/20',
  Supplier: 'bg-sky-500/10 text-sky-700 border-sky-500/20',
  Vendor: 'bg-sky-500/10 text-sky-700 border-sky-500/20',
  Architect: 'bg-violet-500/10 text-violet-700 border-violet-500/20',
  Designer: 'bg-violet-500/10 text-violet-700 border-violet-500/20',
  Engineer: 'bg-violet-500/10 text-violet-700 border-violet-500/20',
};

/** A job role or account type, coloured by family (customers, trades, design). */
export function RoleBadge({ role, className }: { role: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn('font-medium', ROLE_STYLE[role] ?? 'text-muted-foreground', className)}>
      {role}
    </Badge>
  );
}

/**
 * Searchable picker over people and accounts. `kinds` limits what can be chosen.
 * With `onCreatePerson`, typing a name that isn't found offers "Add <name> as a new person".
 */
export function PartyPicker({
  value,
  onChange,
  kinds = ['person', 'account'],
  placeholder = 'Choose a person or account',
  exclude = [],
  allowClear,
  onCreatePerson,
  id,
}: {
  value: string;
  onChange: (id: string) => void;
  kinds?: Party['kind'][];
  placeholder?: string;
  exclude?: string[];
  allowClear?: boolean;
  onCreatePerson?: (name: string) => void;
  id?: string;
}) {
  const L = useLookups();
  const { db } = useStore();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const chosen = value ? L.party.get(value) : undefined;
  const skip = new Set(exclude);
  const people = kinds.includes('person') ? db.people.filter((p) => !skip.has(p.id)).sort((a, b) => personName(a).localeCompare(personName(b))) : [];
  const accounts = kinds.includes('account') ? db.accounts.filter((a) => !skip.has(a.id)).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const typed = search.trim();
  const exact = typed && people.some((p) => personName(p).toLowerCase() === typed.toLowerCase());

  const pick = (pid: string) => {
    onChange(pid);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} className="h-9 w-full justify-between bg-card px-3 font-normal">
          {chosen ? (
            <span className="flex min-w-0 items-center gap-2">
              <PartyAvatar party={chosen} size={20} />
              <span className="truncate">{chosen.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <span className="ml-auto flex items-center gap-1">
            {allowClear && chosen && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Clear"
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.stopPropagation(), onChange(''))}
              >
                <X className="size-3.5" />
              </span>
            )}
            <ChevronsUpDown className="size-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by name…" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{onCreatePerson ? 'No match.' : 'Nobody found.'}</CommandEmpty>
            {people.length > 0 && (
              <CommandGroup heading="People">
                {people.map((p) => {
                  const party = L.party.get(p.id)!;
                  const orgs = (L.accountsOf.get(p.id) ?? []).map((m) => L.account.get(m.accountId)?.name).filter(Boolean).join(', ');
                  return (
                    <CommandItem key={p.id} value={`${party.name} ${orgs} ${p.id}`} onSelect={() => pick(p.id)}>
                      <PartyAvatar party={party} size={20} />
                      <span className="truncate">{party.name}</span>
                      {orgs && <span className="truncate text-xs text-muted-foreground">{orgs}</span>}
                      <Check className={cn('ml-auto', value === p.id ? 'opacity-100' : 'opacity-0')} />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
            {people.length > 0 && accounts.length > 0 && <CommandSeparator />}
            {accounts.length > 0 && (
              <CommandGroup heading="Accounts">
                {accounts.map((a) => {
                  const party = L.party.get(a.id)!;
                  return (
                    <CommandItem key={a.id} value={`${a.name} ${a.types.join(' ')} ${a.id}`} onSelect={() => pick(a.id)}>
                      <PartyAvatar party={party} size={20} />
                      <span className="truncate">{a.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{a.types.join(', ')}</span>
                      <Check className={cn('ml-auto', value === a.id ? 'opacity-100' : 'opacity-0')} />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
            {onCreatePerson && typed && !exact && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value={`__create ${typed}`}
                    onSelect={() => {
                      onCreatePerson(typed);
                      setOpen(false);
                      setSearch('');
                    }}
                  >
                    <Plus /> Add “{typed}” as a new person
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function KindIcon({ kind, className }: { kind: Party['kind']; className?: string }) {
  const Icon = kind === 'person' ? User : Building2;
  return <Icon className={cn('size-3.5 text-muted-foreground', className)} />;
}
