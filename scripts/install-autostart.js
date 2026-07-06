/**
 * Enables "launch at login" by writing a tiny hidden launcher into the
 * Windows Startup folder. Paths are resolved from THIS repo's location, so it
 * works on any machine after `npm install`.
 *
 *   npm run autostart:enable
 */
const fs = require('fs');
const path = require('path');

const appDir = path.resolve(__dirname, '..');

if (process.platform !== 'win32') {
  console.log('Auto-start automation currently supports Windows only.');
  console.log('');
  console.log('  macOS : System Settings > General > Login Items > "+", or add a LaunchAgent.');
  console.log('  Linux : add a .desktop file to ~/.config/autostart/.');
  console.log('');
  console.log('You can always just run "npm start" yourself.');
  process.exit(0);
}

const electronExe = path.join(appDir, 'node_modules', 'electron', 'dist', 'electron.exe');
if (!fs.existsSync(electronExe)) {
  console.error('Could not find Electron at:\n  ' + electronExe);
  console.error('Run "npm install" first, then try again.');
  process.exit(1);
}

const startupDir = path.join(
  process.env.APPDATA,
  'Microsoft',
  'Windows',
  'Start Menu',
  'Programs',
  'Startup'
);
const vbsPath = path.join(startupDir, 'HydrateBuddy.vbs');

// VBScript treats backslashes literally; only double-quotes need escaping.
const q = (s) => s.replace(/"/g, '""');
const vbs = [
  "' Hydrate Buddy - launches the desktop pet silently at Windows login.",
  "' Remove this file (or run: npm run autostart:disable) to stop auto-starting.",
  '',
  'Set WshShell = CreateObject("WScript.Shell")',
  'appDir = "' + q(appDir) + '"',
  'electronExe = "' + q(electronExe) + '"',
  'WshShell.CurrentDirectory = appDir',
  '\' Window style 0 = hidden (no console flash); False = do not wait.',
  'WshShell.Run """" & electronExe & """ """ & appDir & """", 0, False',
  '',
].join('\r\n');

fs.mkdirSync(startupDir, { recursive: true });
fs.writeFileSync(vbsPath, vbs, 'utf8');

console.log('✔ Auto-start enabled — Hydrate Buddy will now launch when you log in.');
console.log('  Launcher: ' + vbsPath);
