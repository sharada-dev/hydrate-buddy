const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');

// ---- Configuration -------------------------------------------------------
const ACTIVE_START_HOUR = 10; // 10:00 IST — first hour reminders may appear
const ACTIVE_END_HOUR = 23;   // 23:00 IST (11 PM) — reminders stop after this
const INTERVAL_MIN = 45;      // normal cadence
const SNOOZE_MIN = 10;        // "I'll come back in 10 mins"
const GREETING_DELAY_MS = 6000; // first hello after launch, so you can see it work

const WIN_WIDTH = 360;
const WIN_HEIGHT = 430;
const EDGE_MARGIN = 8;
// --------------------------------------------------------------------------

let win = null;
let nameWin = null;
let tray = null;
let reminderTimer = null;
let paused = false;
let userName = ''; // personalises the greeting; stored per-user, never in the repo

// ---- Per-user config (lives in the OS user-data folder, not this repo) ----
function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch (e) {
    return {};
  }
}
function saveConfig(cfg) {
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
  } catch (e) {
    console.error('Failed to save config:', e);
  }
}

/** Current wall-clock in IST, independent of the machine's own timezone. */
function nowIST() {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date()).map((p) => [p.type, p.value])
  );
  let hour = parseInt(parts.hour, 10);
  if (hour === 24) hour = 0; // some ICU builds emit "24" at midnight
  return { hour, minute: parseInt(parts.minute, 10), second: parseInt(parts.second, 10) };
}

function isWithinActiveHours() {
  const { hour } = nowIST();
  return hour >= ACTIVE_START_HOUR && hour < ACTIVE_END_HOUR;
}

/** ms from now until the next 10:00 IST. */
function msUntilNextActiveStart() {
  const { hour, minute, second } = nowIST();
  const minsNow = hour * 60 + minute;
  const target = ACTIVE_START_HOUR * 60;
  let deltaMin = minsNow < target ? target - minsNow : 24 * 60 - minsNow + target;
  return deltaMin * 60 * 1000 - second * 1000;
}

function scheduleNext(minutes) {
  if (reminderTimer) {
    clearTimeout(reminderTimer);
    reminderTimer = null;
  }
  if (paused) return;

  const { hour, minute } = nowIST();
  const projected = hour * 60 + minute + minutes;

  let delayMs;
  if (isWithinActiveHours() && projected < ACTIVE_END_HOUR * 60) {
    delayMs = minutes * 60 * 1000;
  } else {
    delayMs = msUntilNextActiveStart();
  }

  reminderTimer = setTimeout(triggerReminder, delayMs);
  updateTrayTooltip(delayMs);
}

function positionWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const x = workArea.x + workArea.width - WIN_WIDTH - EDGE_MARGIN;
  const y = workArea.y + workArea.height - WIN_HEIGHT - EDGE_MARGIN;
  win.setBounds({ x, y, width: WIN_WIDTH, height: WIN_HEIGHT });
}

function triggerReminder() {
  if (paused || !win) return;
  if (!isWithinActiveHours()) {
    scheduleNext(INTERVAL_MIN);
    return;
  }
  positionWindow();
  win.showInactive(); // appear without stealing keyboard focus
  win.setAlwaysOnTop(true, 'screen-saver');
  win.webContents.send('reminder:show', { name: userName });
}

function updateTrayTooltip(delayMs) {
  if (!tray) return;
  if (paused) {
    tray.setToolTip('Hydrate Buddy — paused');
    return;
  }
  const mins = Math.round(delayMs / 60000);
  tray.setToolTip(`Hydrate Buddy — next nudge in ~${mins} min`);
}

function createWindow() {
  win = new BrowserWindow({
    width: WIN_WIDTH,
    height: WIN_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Closing the window just hides the pet; quit from the tray.
  win.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function openNameWindow() {
  if (nameWin) {
    nameWin.focus();
    return;
  }
  nameWin = new BrowserWindow({
    width: 380,
    height: 240,
    title: 'Your name',
    resizable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  nameWin.setMenuBarVisibility(false);
  nameWin.loadFile(path.join(__dirname, 'renderer', 'name.html'));
  nameWin.on('closed', () => {
    nameWin = null;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray.png');
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) icon = nativeImage.createEmpty();

  tray = new Tray(icon);
  rebuildTrayMenu();
  tray.setToolTip('Hydrate Buddy');
  tray.on('click', () => triggerReminder());
}

function rebuildTrayMenu() {
  const template = [
    { label: 'Drink now 💧', click: () => triggerReminder() },
    {
      label: userName ? `Set your name… (${userName})` : 'Set your name…',
      click: () => openNameWindow(),
    },
    {
      label: 'Pause reminders',
      type: 'checkbox',
      checked: paused,
      click: (item) => {
        paused = item.checked;
        if (paused) {
          if (reminderTimer) clearTimeout(reminderTimer);
          reminderTimer = null;
          if (win) win.hide();
          updateTrayTooltip(0);
        } else {
          scheduleNext(INTERVAL_MIN);
        }
      },
    },
  ];

  // In the installed build, offer a native "start with Windows" toggle.
  // (In dev, use `npm run autostart:enable` instead.)
  if (app.isPackaged) {
    let openAtLogin = false;
    try {
      openAtLogin = app.getLoginItemSettings().openAtLogin;
    } catch (e) {
      /* not supported on this platform */
    }
    template.push({
      label: 'Start at login',
      type: 'checkbox',
      checked: openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked });
      },
    });
  }

  template.push(
    { type: 'separator' },
    {
      label: 'Quit Hydrate Buddy',
      click: () => {
        app.isQuiting = true;
        app.quit();
      },
    }
  );

  tray.setContextMenu(Menu.buildFromTemplate(template));
}

// ---- IPC from the renderer ----------------------------------------------
ipcMain.on('reminder:yes', () => scheduleNext(INTERVAL_MIN));
ipcMain.on('reminder:snooze', () => scheduleNext(SNOOZE_MIN));
ipcMain.on('reminder:hide', () => {
  if (win) win.hide();
});

ipcMain.handle('name:get', () => userName);
ipcMain.handle('name:save', (_e, value) => {
  userName = String(value || '').trim().slice(0, 24);
  const cfg = loadConfig();
  cfg.name = userName;
  saveConfig(cfg);
  if (tray) rebuildTrayMenu(); // reflect the new name in the tray label
  return userName;
});
ipcMain.on('name:close', () => {
  if (nameWin) nameWin.close();
});
// --------------------------------------------------------------------------

// Only allow a single running instance.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => triggerReminder());

  app.whenReady().then(() => {
    userName = (loadConfig().name || '').trim();
    createWindow();
    createTray();

    if (isWithinActiveHours()) {
      // Say hello shortly after launch so you can see the whole flow,
      // then settle into the normal 45-minute cadence.
      reminderTimer = setTimeout(triggerReminder, GREETING_DELAY_MS);
    } else {
      scheduleNext(INTERVAL_MIN);
    }
  });
}

// Keep running in the tray even with no visible window.
app.on('window-all-closed', () => {});
