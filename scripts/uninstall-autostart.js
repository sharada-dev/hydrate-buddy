/**
 * Removes the "launch at login" launcher from the Windows Startup folder.
 *
 *   npm run autostart:disable
 */
const fs = require('fs');
const path = require('path');

if (process.platform !== 'win32') {
  console.log('Nothing to remove (auto-start automation is Windows-only).');
  process.exit(0);
}

const vbsPath = path.join(
  process.env.APPDATA,
  'Microsoft',
  'Windows',
  'Start Menu',
  'Programs',
  'Startup',
  'HydrateBuddy.vbs'
);

if (fs.existsSync(vbsPath)) {
  fs.unlinkSync(vbsPath);
  console.log('✔ Auto-start disabled — removed ' + vbsPath);
} else {
  console.log('Auto-start was not enabled (no launcher found).');
}
