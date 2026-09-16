import { useEffect, useState } from 'react';

/// Persists a list-page's chosen visible-column keys to localStorage,
/// keyed per-user so different logins on the same browser don't clobber
/// each other's column preferences. Shared by Employees and Recruitment
/// (and any future list page with a Customize Columns picker).
export function useColumnPreference<K extends string>(storageKey: string, defaultKeys: K[]) {
  const [visibleColumns, setVisibleColumns] = useState<K[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved) as K[];
    } catch {
      // ignore malformed saved preference, fall back to default
    }
    return defaultKeys;
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(visibleColumns));
  }, [visibleColumns, storageKey]);

  return [visibleColumns, setVisibleColumns] as const;
}
