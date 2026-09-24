// Narrow, typed bridge between the sandboxed renderer and the main process.
// Exposed as `window.forays` (see bridge.d.ts). No Node.js APIs leak through.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

function subscribe(channel: string, cb: (...args: unknown[]) => void) {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]) => cb(...args);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld('forays', {
  isDesktop: true,
  notify: (n: { title: string; body: string; route?: string }) => ipcRenderer.send('notify', n),
  setUnreadCount: (count: number) => ipcRenderer.send('unread-count', count),
  setSignedIn: (value: boolean) => ipcRenderer.send('signed-in', value),
  showWindow: () => ipcRenderer.send('show-window'),
  isWindowFocused: () => ipcRenderer.invoke('window-focused'),
  getPrefs: () => ipcRenderer.invoke('prefs:get'),
  setPrefs: (patch: Record<string, boolean>) => ipcRenderer.invoke('prefs:set', patch),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  onNavigate: (cb: (route: string) => void) => subscribe('app:navigate', (route) => cb(String(route))),
  onLogoutRequest: (cb: () => void) => subscribe('app:logout', () => cb()),
  onResume: (cb: () => void) => subscribe('app:resume', () => cb()),
});
