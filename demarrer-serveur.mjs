import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const stdout = fs.openSync(path.join(root, 'ctt-server.log'), 'a');
const stderr = fs.openSync(path.join(root, 'ctt-server-error.log'), 'a');
const child = spawn(process.execPath, ['server.js'], {
  cwd: root,
  detached: true,
  windowsHide: true,
  stdio: ['ignore', stdout, stderr]
});
child.unref();
console.log(`Serveur CTT lancé en arrière-plan (PID ${child.pid}).`);
