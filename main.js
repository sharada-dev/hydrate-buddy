const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');

// ---- Configuration -------------------------------------------------------
const ACTIVE_START_HOUR = 10; // 10:00 IST — first hour reminders may appear
const ACTIVE_END_HOUR = 23;   // 23:00 IST (11 PM) — reminders stop after this
const DEFAULT_INTERVAL_MIN = 45; // used until the user picks their own
const INTERVAL_OPTIONS = [15, 30, 45, 60, 90]; // tray menu presets (minutes)
const SNOOZE_MIN = 10;        // "I'll come back in 10 mins"
const GREETING_DELAY_MS = 6000; // first hello after launch, so you can see it work

const WIN_WIDTH = 360;
const WIN_HEIGHT = 430;
const EDGE_MARGIN = 8;
// --------------------------------------------------------------------------

let win = null;
let nameWin = null;
let intervalWin = null;
let onboardWin = null;
let tray = null;
let ticker = null;
let nextReminderAt = 0; // epoch ms of the next due reminder
let paused = false;
let userName = ''; // personalises the greeting; stored per-user, never in the repo
let intervalMin = DEFAULT_INTERVAL_MIN; // minutes between reminders (user-configurable)

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

/** Clamp a requested interval to a sane whole number of minutes. */
function normalizeInterval(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_INTERVAL_MIN;
  return Math.min(n, 720); // cap at 12 hours
}

/** Change the reminder cadence, persist it, and restart the countdown. */
function applyInterval(minutes) {
  intervalMin = normalizeInterval(minutes);
  const cfg = loadConfig();
  cfg.intervalMin = intervalMin;
  saveConfig(cfg);
  nextReminderAt = Date.now() + intervalMin * 60000; // restart from now
  updateTrayTooltip();
  if (tray) rebuildTrayMenu(); // reflect the newly-checked option
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

  nextReminderAt = Date.now() + intervalMin * 60000; // schedule the next nudge
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

/** Force a small settings window to actually pop to the foreground on Windows,
 *  where a background/tray app is otherwise blocked from stealing focus. */
function bringToFront(w) {
  if (!w || w.isDestroyed()) return;
  w.center();
  w.show();
  w.setAlwaysOnTop(true, 'screen-saver');
  w.focus();
  w.moveTop();
  try {
    w.flashFrame(true);
    setTimeout(() => {
      if (w && !w.isDestroyed()) w.flashFrame(false);
    }, 2500);
  } catch (e) {
    /* flashFrame unsupported on this platform */
  }
}

function openNameWindow() {
  if (nameWin) {
    bringToFront(nameWin);
    return;
  }
  nameWin = new BrowserWindow({
    width: 380,
    height: 240,
    title: 'Your name',
    show: false,
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
  nameWin.once('ready-to-show', () => bringToFront(nameWin));
  nameWin.on('closed', () => {
    nameWin = null;
  });
}

function openIntervalWindow() {
  if (intervalWin) {
    intervalWin.focus();
    return;
  }
  intervalWin = new BrowserWindow({
    width: 380,
    height: 250,
    title: 'Reminder interval',
    show: false,
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
  intervalWin.setMenuBarVisibility(false);
  intervalWin.loadFile(path.join(__dirname, 'renderer', 'interval.html'));
  intervalWin.once('ready-to-show', () => bringToFront(intervalWin));
  intervalWin.on('closed', () => {
    intervalWin = null;
  });
}

/** First-run welcome: a 2-step wizard for name, then reminder interval. */
function openOnboardingWindow() {
  if (onboardWin) {
    bringToFront(onboardWin);
    return;
  }
  onboardWin = new BrowserWindow({
    width: 400,
    height: 340,
    title: 'Welcome to Hydrate Buddy',
    show: false,
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
  onboardWin.setMenuBarVisibility(false);
  onboardWin.loadFile(path.join(__dirname, 'renderer', 'onboarding.html'));
  onboardWin.once('ready-to-show', () => bringToFront(onboardWin));
  onboardWin.on('closed', () => {
    onboardWin = null;
    // Wizard finished — now do the first hello, personalised with the new name.
    setTimeout(() => triggerReminder(), 800);
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
      label: `Reminder every ${intervalMin} min`,
      submenu: [
        ...INTERVAL_OPTIONS.map((m) => ({
          label: `${m} minutes`,
          type: 'radio',
          checked: intervalMin === m,
          click: () => applyInterval(m),
        })),
        { type: 'separator' },
        {
          label: 'Custom…',
          type: 'radio',
          checked: !INTERVAL_OPTIONS.includes(intervalMin),
          click: () => openIntervalWindow(),
        },
      ],
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
          nextReminderAt = Date.now() + intervalMin * 60000;
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
ipcMain.on('reminder:yes', () => { nextReminderAt = Date.now() + intervalMin * 60000; });
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

ipcMain.handle('interval:get', () => intervalMin);
ipcMain.handle('interval:save', (_e, value) => {
  applyInterval(value);
  return intervalMin;
});
ipcMain.on('interval:close', () => {
  if (intervalWin) intervalWin.close();
});
ipcMain.on('onboarding:close', () => {
  if (onboardWin) onboardWin.close();
});
// --------------------------------------------------------------------------

// Only allow a single running instance.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => triggerReminder());

  app.whenReady().then(() => {
    const cfg = loadConfig();
    userName = (cfg.name || '').trim();
    intervalMin = normalizeInterval(cfg.intervalMin);
    createWindow();
    createTray();
    startScheduler();

    // First ever launch: run the welcome wizard (name + interval). We stay quiet
    // during onboarding and say hello only once it's done (see the wizard's
    // 'closed' handler), so the pet and the wizard don't both pop up at once.
    if (!cfg.askedName) {
      cfg.askedName = true;
      saveConfig(cfg);
      nextReminderAt = Date.now() + intervalMin * 60000; // no greeting yet
      setTimeout(() => openOnboardingWindow(), 1500);
    } else {
      // Returning user: say hello shortly after launch so you see it works.
      nextReminderAt =
        Date.now() + (isWithinActiveHours() ? GREETING_DELAY_MS : intervalMin * 60000);
      setTimeout(tick, GREETING_DELAY_MS + 300);
    }

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
