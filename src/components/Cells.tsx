import { useEffect, useState } from 'react';

/** A number box that only saves when you leave it, so typing isn't interrupted. */
export function NumCell({ value, onSave, label, width = 80 }: { value: number; onSave: (n: number) => void; label: string; width?: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      className="b-input num"
      style={{ width }}
      inputMode="decimal"
      aria-label={label}
      value={text}
      onChange={(e) => setText(e.target.value.replace(/[^0-9.\-]/g, ''))}
      onBlur={() => {
        const n = Number(text);
        if (Number.isFinite(n) && n !== value) onSave(n);
        else setText(String(value));
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

/** A text box that only saves when you leave it. */
export function TextCell({ value, onSave, label, className = '', placeholder }: { value: string; onSave: (s: string) => void; label: string; className?: string; placeholder?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      className={'b-input ' + className}
      aria-label={label}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onSave(text)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}
