const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, powerMonitor } = require('electron');
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
let ticker = null;
let nextReminderAt = 0; // epoch ms of the next due reminder
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

const TICK_MS = 30000; // re-check every 30s — short so it survives sleep/wake

/**
 * Runs on a short repeating timer. Because it only ever checks the *current*
 * wall-clock (never a single long countdown), reminders keep working after the
 * laptop sleeps and wakes — a long setTimeout would silently go stale.
 */
function tick() {
  if (paused || !win) return;
  if (win.isVisible()) return; // a reminder is already on screen
  if (!isWithinActiveHours()) return; // outside 10:00–23:00 IST
  if (Date.now() >= nextReminderAt) triggerReminder();
}

function startScheduler() {
  if (ticker) clearInterval(ticker);
  ticker = setInterval(tick, TICK_MS);
}

function positionWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const x = workArea.x + workArea.width - WIN_WIDTH - EDGE_MARGIN;
  const y = workArea.y + workArea.height - WIN_HEIGHT - EDGE_MARGIN;
  win.setBounds({ x, y, width: WIN_WIDTH, height: WIN_HEIGHT });
}

function triggerReminder() {
  if (paused || !win) return;
  if (!isWithinActiveHours()) return;

  nextReminderAt = Date.now() + INTERVAL_MIN * 60000; // schedule the next nudge
  updateTrayTooltip();

  // Re-read the name each time so a failed/early startup read can't strand the
  // session name-less (config lives on the roaming profile, which may not be
  // ready the instant auto-start launches at login).
  userName = (loadConfig().name || '').trim();

  positionWindow();
  win.showInactive(); // appear without stealing keyboard focus
  win.setAlwaysOnTop(true, 'screen-saver');
  win.webContents.send('reminder:show', { name: userName });
}

function updateTrayTooltip() {
  if (!tray) return;
  if (paused) {
    tray.setToolTip('Hydrate Buddy — paused');
    return;
  }
  const mins = Math.max(0, Math.round((nextReminderAt - Date.now()) / 60000));
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
          if (win) win.hide();
        } else {
          nextReminderAt = Date.now() + INTERVAL_MIN * 60000;
        }
        updateTrayTooltip();
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
ipcMain.on('reminder:yes', () => { nextReminderAt = Date.now() + INTERVAL_MIN * 60000; });
ipcMain.on('reminder:snooze', () => { nextReminderAt = Date.now() + SNOOZE_MIN * 60000; });
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
    startScheduler();

    // Say hello shortly after launch (within active hours) so you see it works;
    // otherwise the first nudge waits for the next active window.
    nextReminderAt =
      Date.now() + (isWithinActiveHours() ? GREETING_DELAY_MS : INTERVAL_MIN * 60000);
    setTimeout(tick, GREETING_DELAY_MS + 300);

    // Re-check the moment the laptop wakes/unlocks, so a due nudge isn't missed.
    try {
      powerMonitor.on('resume', tick);
      powerMonitor.on('unlock-screen', tick);
    } catch (e) {
      /* powerMonitor unavailable on this platform */
    }
  });
}

// Keep running in the tray even with no visible window.
app.on('window-all-closed', () => {});
