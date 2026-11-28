// A small Markdown viewer for skills and other help text: headings, paragraphs, lists, code,
// quotes, bold, italic, inline code and links. It builds React elements (never HTML strings), so
// text from records or agents can't inject markup.
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

function inline(text: string, key = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  // `code`, **bold**, *italic* or _italic_, [label](url)
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let n = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${n++}`;
    if (m[1]) out.push(<code key={k} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{t.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{inline(t.slice(2, -2), k)}</strong>);
    else if (m[3]) out.push(<em key={k}>{inline(t.slice(1, -1), k)}</em>);
    else {
      const [, label, href] = t.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)!;
      const safe = /^(https?:|mailto:|\/|#)/i.test(href);
      out.push(safe ? <a key={k} href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">{label}</a> : label);
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const k = `b${i}`;
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('```')) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      i++;
      blocks.push(<pre key={k} className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">{code.join('\n')}</pre>);
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const cls = level === 1 ? 'text-lg font-semibold' : level === 2 ? 'mt-2 text-base font-semibold' : 'text-sm font-semibold';
      blocks.push(<div key={k} role="heading" aria-level={level} className={cls}>{inline(h[2], k)}</div>);
      i++;
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        let item = lines[i++].replace(/^\s*([-*+]|\d+[.)])\s+/, '');
        // continuation lines indented under the item
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) item += ` ${lines[i++].trim()}`;
        items.push(item);
      }
      const List = ordered ? 'ol' : 'ul';
      blocks.push(<List key={k} className={cn('space-y-1 pl-5', ordered ? 'list-decimal' : 'list-disc')}>{items.map((t, n) => <li key={n}>{inline(t, `${k}-${n}`)}</li>)}</List>);
      continue;
    }
    if (line.startsWith('>')) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) quote.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(<blockquote key={k} className="border-l-2 pl-3 text-muted-foreground">{inline(quote.join(' '), k)}</blockquote>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*([-*+]|\d+[.)])\s+)/.test(lines[i])) para.push(lines[i++].trim());
    blocks.push(<p key={k}>{inline(para.join(' '), k)}</p>);
  }
  return <div className={cn('space-y-3 text-sm leading-relaxed', className)}>{blocks}</div>;
}
