import { app, BrowserWindow, ipcMain, Menu, protocol, shell } from 'electron';
import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';

const APP_SCHEME = 'app';
const APP_HOST = 'bundle';
const DIST_DIR = resolve(app.getAppPath(), 'dist');
let mainWindow;

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.wasm', 'application/wasm'],
  ['.webmanifest', 'application/manifest+json'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function toNativeMenuItem(item) {
  if (item.type === 'separator') return { type: 'separator' };
  if (Array.isArray(item.submenu)) {
    return {
      label: item.label,
      enabled: item.enabled,
      submenu: item.submenu.map(toNativeMenuItem),
    };
  }

  return {
    id: item.id,
    label: item.label,
    enabled: item.enabled,
    type: item.checked === undefined ? 'normal' : 'checkbox',
    checked: item.checked,
    accelerator: item.accelerator,
    click: () => mainWindow?.webContents.send('native-menu:action', item.id),
  };
}

function setMacApplicationMenu(
  template = { menus: [], editLabel: 'Edit', undoLabel: 'Undo', redoLabel: 'Redo' },
) {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services', submenu: [] },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      {
        label: template.editLabel,
        submenu: [
          {
            label: template.undoLabel,
            accelerator: 'Command+Z',
            click: () => mainWindow?.webContents.send('native-menu:action', 'edit/undo'),
          },
          {
            label: template.redoLabel,
            accelerator: 'Command+Shift+Z',
            click: () => mainWindow?.webContents.send('native-menu:action', 'edit/redo'),
          },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      ...template.menus.map((menu) => ({
        label: menu.label,
        submenu: menu.items.map(toNativeMenuItem),
      })),
      { role: 'windowMenu' },
    ]),
  );
}

function isAppUrl(value) {
  const url = new URL(value);
  return url.protocol === `${APP_SCHEME}:` && url.hostname === APP_HOST;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'NyaMath',
    frame: process.platform === 'darwin',
    ...(process.platform !== 'darwin' && {
      icon: resolve(app.getAppPath(), 'electron/icons/icon.png'),
    }),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: resolve(app.getAppPath(), 'electron/preload.cjs'),
    },
  });

  if (process.platform !== 'darwin') {
    mainWindow.removeMenu();
    mainWindow.setMenuBarVisibility(false);
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  const sendWindowState = () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-controls:state', mainWindow.isMaximized());
    }
  };
  mainWindow.on('maximize', sendWindowState);
  mainWindow.on('unmaximize', sendWindowState);
  mainWindow.webContents.on('did-finish-load', sendWindowState);

  const devServerUrl = process.env['NYAMATH_DEV_SERVER_URL'];
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadURL(`${APP_SCHEME}://${APP_HOST}/`);
  }
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock.setIcon(resolve(app.getAppPath(), 'electron/icons/icon.png'));
    setMacApplicationMenu();
  } else {
    Menu.setApplicationMenu(null);
  }

  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== APP_HOST || request.method !== 'GET') {
      return new Response('Not found', { status: 404 });
    }

    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return new Response('Bad request', { status: 400 });
    }

    const filePath = resolve(DIST_DIR, `.${pathname === '/' ? '/index.html' : pathname}`);
    const fileRelativePath = relative(DIST_DIR, filePath);
    if (fileRelativePath.startsWith('..') || isAbsolute(fileRelativePath)) {
      return new Response('Forbidden', { status: 403 });
    }

    try {
      const body = await readFile(filePath);
      return new Response(body, {
        headers: {
          'Content-Type': contentTypes.get(extname(filePath)) ?? 'application/octet-stream',
        },
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        return new Response('Not found', { status: 404 });
      }
      throw error;
    }
  });

  ipcMain.on('native-menu:set-template', (event, menus) => {
    if (
      process.platform !== 'darwin' ||
      !mainWindow ||
      event.sender !== mainWindow.webContents ||
      !menus ||
      !Array.isArray(menus.menus)
    ) {
      return;
    }

    setMacApplicationMenu(menus);
  });

  ipcMain.handle('window-controls:get-state', (event) => {
    if (process.platform === 'darwin' || !mainWindow || event.sender !== mainWindow.webContents) {
      return false;
    }
    return mainWindow.isMaximized();
  });

  ipcMain.on('window-controls:minimize', (event) => {
    if (process.platform !== 'darwin' && event.sender === mainWindow?.webContents) {
      mainWindow.minimize();
    }
  });

  ipcMain.on('window-controls:toggle-maximize', (event) => {
    if (process.platform === 'darwin' || event.sender !== mainWindow?.webContents) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });

  ipcMain.on('window-controls:close', (event) => {
    if (process.platform !== 'darwin' && event.sender === mainWindow?.webContents) {
      mainWindow.close();
    }
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
