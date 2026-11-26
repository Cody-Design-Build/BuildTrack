export function downloadIcs(name: string, events: { title: string; date: string; end?: string }[]) {
  const fmt = (d: string) => d.replace(/-/g, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BuildTrack//EN'];
  events.forEach((e, i) => {
    const endDate = new Date((e.end ?? e.date) + 'T00:00:00');
    endDate.setDate(endDate.getDate() + 1);
    lines.push('BEGIN:VEVENT', `UID:${i}-${fmt(e.date)}@buildtrack`, `DTSTART;VALUE=DATE:${fmt(e.date)}`, `DTEND;VALUE=DATE:${fmt(endDate.toISOString().slice(0, 10))}`, `SUMMARY:${e.title.replace(/[,;]/g, ' ')}`, 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
  a.download = name;
  a.click();
}

export function downloadCsv(name: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = name;
  a.click();
}
