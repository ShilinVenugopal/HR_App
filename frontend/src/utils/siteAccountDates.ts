/// Site Accounts lets a user enter several transaction dates against one
/// voucher as free comma-separated text (e.g. "01.03.2026, 05.03.2026"),
/// matching the reference statement's own format. These two helpers are
/// the only place that format is parsed/rendered.
export function parseDatesText(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (m) {
        const [, d, mo, y] = m;
        return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
      const parsed = new Date(s);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
    })
    .filter((s): s is string => Boolean(s));
}

export function formatDatesText(dates: { date: string }[]): string {
  return dates
    .map((d) => {
      const dt = new Date(d.date);
      const dd = String(dt.getDate()).padStart(2, '0');
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const yyyy = dt.getFullYear();
      return `${dd}.${mm}.${yyyy}`;
    })
    .join(', ');
}
