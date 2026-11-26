import { app, dialog } from 'electron';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

function logStartupFailure(error) {
  try {
    const file = join(app.getPath('userData'), 'startup-error.log');
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, new Date().toISOString() + '\n' + (error?.stack || String(error)) + '\n');
  } catch {}
}

try {
  await import('./main.mjs');
} catch (error) {
  logStartupFailure(error);
  try {
    dialog.showErrorBox('Sparkseed 无法启动', '启动失败：' + (error?.message || error));
  } catch {}
  app.quit();
}
