const { app, BrowserWindow, screen, ipcMain, Tray, Menu, shell, nativeImage } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;
let dragTimer = null;
let isCompanionDragging = false;
let offsetX = 0;
let offsetY = 0;

const WIN_WIDTH = 220;
const WIN_HEIGHT = 220;

function clampWindowPosition(targetX, targetY) {
  const { workArea } = screen.getPrimaryDisplay();
  const minX = Math.round(workArea.x - 35);
  const maxX = Math.round(workArea.x + workArea.width - WIN_WIDTH + 35);
  const minY = Math.round(workArea.y - 65);
  const maxY = Math.round(workArea.y + workArea.height - WIN_HEIGHT - 6);

  return {
    x: Math.max(minX, Math.min(maxX, Math.round(targetX))),
    y: Math.max(minY, Math.min(maxY, Math.round(targetY)))
  };
}

ipcMain.on('start-drag', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  isCompanionDragging = true;
  mainWindow.setIgnoreMouseEvents(false);

  const startCursor = screen.getCursorScreenPoint();
  const [startWinX, startWinY] = mainWindow.getPosition();
  offsetX = startCursor.x - startWinX;
  offsetY = startCursor.y - startWinY;

  if (dragTimer) clearInterval(dragTimer);
  dragTimer = setInterval(() => {
    if (!isCompanionDragging || !mainWindow || mainWindow.isDestroyed()) {
      if (dragTimer) clearInterval(dragTimer);
      dragTimer = null;
      return;
    }
    const currentCursor = screen.getCursorScreenPoint();
    const clamped = clampWindowPosition(currentCursor.x - offsetX, currentCursor.y - offsetY);
    mainWindow.setBounds({ x: clamped.x, y: clamped.y, width: WIN_WIDTH, height: WIN_HEIGHT });
  }, 16);
});

ipcMain.on('end-drag', () => {
  isCompanionDragging = false;
  if (dragTimer) {
    clearInterval(dragTimer);
    dragTimer = null;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    const [currX, currY] = mainWindow.getPosition();
    const clamped = clampWindowPosition(currX, currY);
    mainWindow.setBounds({ x: clamped.x, y: clamped.y, width: WIN_WIDTH, height: WIN_HEIGHT });
  }
});

ipcMain.on('set-interactive', (_, interactive) => {
  if (!mainWindow || mainWindow.isDestroyed() || isCompanionDragging) return;
  mainWindow.setIgnoreMouseEvents(!interactive, { forward: true });
});

ipcMain.on('open-studio', () => {
  shell.openExternal('http://localhost:5173');
});

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const initX = Math.round(workArea.x + workArea.width - WIN_WIDTH - 20);
  const initY = Math.round(workArea.y + workArea.height - WIN_HEIGHT - 10);

  mainWindow = new BrowserWindow({
    width: WIN_WIDTH,
    height: WIN_HEIGHT,
    x: initX,
    y: initY,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    useContentSize: true,
    hasShadow: false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true);
  mainWindow.setIgnoreMouseEvents(false);

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (dragTimer) clearInterval(dragTimer);
  });

  createTray();
}

function resetWindowPosition() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const { workArea } = screen.getPrimaryDisplay();
  mainWindow.setBounds({
    x: Math.round(workArea.x + workArea.width - WIN_WIDTH - 20),
    y: Math.round(workArea.y + workArea.height - WIN_HEIGHT - 10),
    width: WIN_WIDTH,
    height: WIN_HEIGHT
  });
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
}

function centerWindowPosition() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const { workArea } = screen.getPrimaryDisplay();
  const clamped = clampWindowPosition(
    workArea.x + Math.round((workArea.width - WIN_WIDTH) / 2),
    workArea.y + Math.round((workArea.height - WIN_HEIGHT) / 2)
  );
  mainWindow.setBounds({ x: clamped.x, y: clamped.y, width: WIN_WIDTH, height: WIN_HEIGHT });
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
}

function createTray() {
  const icon = nativeImage.createFromBuffer(
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAA7SURBVDhPY/wPBAwUACYGkgEz0fWgGMbBIMp41ADK/cMwmNqAmv6hZkDTi44Z8BhACp41gGK/AQFzA/Z5u422AAAAAElFTkSuQmCC', 'base64')
  );

  tray = new Tray(icon);
  tray.setToolTip('Pixelle Desktop Companion');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Pixelle Desktop Companion', enabled: false },
    { type: 'separator' },
    { label: 'Center Companion', click: () => centerWindowPosition() },
    { label: 'Reset to Floor', click: () => resetWindowPosition() },
    { type: 'separator' },
    { label: 'Open Studio', click: () => shell.openExternal('http://localhost:5173') },
    {
      label: 'Always On Top',
      type: 'checkbox',
      checked: true,
      click: (item) => mainWindow?.setAlwaysOnTop(item.checked, 'screen-saver')
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]));

  tray.on('double-click', () => centerWindowPosition());
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
