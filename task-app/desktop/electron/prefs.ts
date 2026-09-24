// Machine-local desktop preferences (not user data — those live in Supabase).
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export interface DesktopPrefs {
  startWithWindows: boolean;
  minimizeToTray: boolean;
}

const DEFAULTS: DesktopPrefs = { startWithWindows: true, minimizeToTray: true };

const file = () => path.join(app.getPath('userData'), 'desktop-prefs.json');

export function loadPrefs(): DesktopPrefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(prefs: DesktopPrefs): DesktopPrefs {
  try {
    fs.writeFileSync(file(), JSON.stringify(prefs, null, 2));
  } catch (err) {
    console.error('Could not save desktop preferences', err);
  }
  return prefs;
}
