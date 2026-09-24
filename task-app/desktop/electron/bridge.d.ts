// Type of the `window.forays` bridge exposed by electron/preload.ts.
// Undefined when the renderer runs in a plain browser (e.g. `vite` preview).
export interface DesktopPrefs {
  startWithWindows: boolean;
  minimizeToTray: boolean;
}

export interface AppInfo {
  version: string;
  electron: string;
  platform: string;
  packaged: boolean;
}

export interface ForaysBridge {
  isDesktop: true;
  notify(n: { title: string; body: string; route?: string }): void;
  setUnreadCount(count: number): void;
  setSignedIn(value: boolean): void;
  showWindow(): void;
  isWindowFocused(): Promise<boolean>;
  getPrefs(): Promise<DesktopPrefs>;
  setPrefs(patch: Partial<DesktopPrefs>): Promise<DesktopPrefs>;
  getAppInfo(): Promise<AppInfo>;
  onNavigate(cb: (route: string) => void): () => void;
  onLogoutRequest(cb: () => void): () => void;
  onResume(cb: () => void): () => void;
}

declare global {
  interface Window {
    forays?: ForaysBridge;
  }
}
