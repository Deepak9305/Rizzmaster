import { spawn } from 'node:child_process';
import process from 'node:process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const spawnOptions = {
  shell: process.platform === 'win32',
  stdio: ['ignore', 'inherit', 'inherit'],
};

const children = [
  spawn(npmCommand, ['run', 'dev:api'], spawnOptions),
  spawn(npmCommand, ['run', 'dev:vite'], spawnOptions),
];

const shutdown = (code = 0) => {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
  process.exit(code);
};

for (const child of children) {
  child.on('exit', (code) => {
    if (code && code !== 0) {
      shutdown(code);
    }
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
