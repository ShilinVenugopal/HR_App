// Forays Task App — Electron main process.
//
// Owns everything OS-level: the window, the system-tray icon/menu, Windows
// toast notifications, "start with Windows" and close-to-tray behaviour.
// The renderer (React) talks to it only through the narrow bridge exposed in
// preload.ts; it has no Node.js access.
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  powerMonitor,
  shell,
  Tray,
} from 'electron';
import path from 'node:path';
import { loadPrefs, savePrefs, type DesktopPrefs } from './prefs';

const APP_ID = 'in.foraysgroup.taskapp'; // must match electron-builder appId (toasts depend on it)
const APP_NAME = 'Forays Task App';
const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const startedHidden = process.argv.includes('--hidden');

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let signedIn = false;
let unreadCount = 0;
let trayHintShown = false;
let prefs: DesktopPrefs;

const asset = (name: string) => path.join(__dirname, '..', 'assets', name);

// ---------------------------------------------------------------------------
// Single instance: a second launch just focuses the running app.
// ---------------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
}

app.setAppUserModelId(APP_ID);
app.setName(APP_NAME);

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1000,
    minHeight: 660,
    show: false,
    title: APP_NAME,
    icon: asset(process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    backgroundColor: '#050b1f',
    // Frameless look with native Windows caption buttons drawn over our title bar.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0a1433', symbolColor: '#cbd5e1', height: 40 },
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Keep timers/realtime alive while hidden in the tray so reminders arrive.
      backgroundThrottling: false,
      spellcheck: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (!(startedHidden && prefs.minimizeToTray)) mainWindow?.show();
  });

  // Close button => hide to tray (unless the user chose Exit).
  mainWindow.on('close', (event) => {
    if (!isQuitting && prefs.minimizeToTray) {
      event.preventDefault();
      mainWindow?.hide();
      if (!trayHintShown && Notification.isSupported()) {
        trayHintShown = true;
        new Notification({
          title: APP_NAME,
          body: 'Still running in the system tray so you keep getting task reminders. Right-click the tray icon to exit.',
          icon: asset('icon.png'),
          silent: true,
        }).show();
      }
    }
  });
  mainWindow.on('closed', () => (mainWindow = null));
  mainWindow.on('focus', () => mainWindow?.flashFrame(false));

  // Security: never navigate the app window away; open web links externally.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = DEV_URL ? url.startsWith(DEV_URL) : url.startsWith('file://');
    if (!allowed) event.preventDefault();
  });

  if (DEV_URL) {
    void mainWindow.loadURL(DEV_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

function showWindow(route?: string) {
  if (!mainWindow) createWindow();
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (route) mainWindow.webContents.send('app:navigate', route);
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------
function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Open Forays Task App', click: () => showWindow() },
    { type: 'separator' },
    { label: 'My Tasks', enabled: signedIn, click: () => showWindow('/tasks/mine') },
    { label: 'Create Task', enabled: signedIn, click: () => showWindow('/tasks/new') },
    { label: 'Chat', enabled: signedIn, click: () => showWindow('/chat') },
    { label: 'Settings', enabled: signedIn, click: () => showWindow('/settings') },
    { type: 'separator' },
    {
      label: 'Logout',
      enabled: signedIn,
      click: () => {
        showWindow();
        mainWindow?.webContents.send('app:logout');
      },
    },
    {
      label: 'Exit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function refreshTray() {
  if (!tray) return;
  tray.setContextMenu(buildTrayMenu());
  tray.setToolTip(unreadCount > 0 ? `${APP_NAME} — ${unreadCount} unread` : APP_NAME);
  if (process.platform === 'win32' && mainWindow) {
    mainWindow.setOverlayIcon(
      unreadCount > 0 ? nativeImage.createFromPath(asset('badge.png')) : null,
      unreadCount > 0 ? `${unreadCount} unread` : '',
    );
  }
}

function createTray() {
  const image = nativeImage.createFromPath(asset(process.platform === 'win32' ? 'tray.ico' : 'tray.png'));
  tray = new Tray(image);
  tray.on('click', () => showWindow());
  tray.on('double-click', () => showWindow());
  refreshTray();
}

// ---------------------------------------------------------------------------
// Start with Windows
// ---------------------------------------------------------------------------
function applyLoginItem() {
  if (!app.isPackaged) return; // don't register the dev electron.exe
  app.setLoginItemSettings({ openAtLogin: prefs.startWithWindows, args: ['--hidden'] });
}

// ---------------------------------------------------------------------------
// IPC (the only surface the renderer can reach)
// ---------------------------------------------------------------------------
function registerIpc() {
  ipcMain.on('notify', (_e, payload: { title: string; body: string; route?: string }) => {
    if (!Notification.isSupported()) return;
    const title = String(payload?.title ?? '').slice(0, 120);
    const body = String(payload?.body ?? '').slice(0, 400);
    const route = typeof payload?.route === 'string' && payload.route.startsWith('/') ? payload.route : undefined;
    const n = new Notification({ title, body, icon: asset('icon.png') });
    n.on('click', () => showWindow(route));
    n.show();
    if (mainWindow && !mainWindow.isFocused()) mainWindow.flashFrame(true);
  });

  ipcMain.on('unread-count', (_e, count: number) => {
    unreadCount = Math.max(0, Number(count) || 0);
    refreshTray();
  });

  ipcMain.on('signed-in', (_e, value: boolean) => {
    signedIn = Boolean(value);
    refreshTray();
  });

  ipcMain.on('show-window', () => showWindow());

  ipcMain.handle('window-focused', () => Boolean(mainWindow?.isFocused() && mainWindow.isVisible()));

  ipcMain.handle('prefs:get', () => prefs);
  ipcMain.handle('prefs:set', (_e, patch: Partial<DesktopPrefs>) => {
    prefs = savePrefs({ ...prefs, ...sanitizePrefs(patch) });
    applyLoginItem();
    return prefs;
  });

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
    packaged: app.isPackaged,
  }));
}

function sanitizePrefs(patch: Partial<DesktopPrefs>): Partial<DesktopPrefs> {
  const out: Partial<DesktopPrefs> = {};
  if (typeof patch?.startWithWindows === 'boolean') out.startWithWindows = patch.startWithWindows;
  if (typeof patch?.minimizeToTray === 'boolean') out.minimizeToTray = patch.minimizeToTray;
  return out;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  prefs = loadPrefs();
  Menu.setApplicationMenu(null);
  registerIpc();
  createWindow();
  createTray();
  applyLoginItem();

  // After sleep/hibernate the network socket is stale: tell the renderer to
  // reconnect and catch up on anything it missed.
  powerMonitor.on('resume', () => mainWindow?.webContents.send('app:resume'));
});

app.on('before-quit', () => {
  isQuitting = true;
});

// Keep running in the tray when all windows are closed.
app.on('window-all-closed', () => {
  if (!prefs?.minimizeToTray) app.quit();
});
