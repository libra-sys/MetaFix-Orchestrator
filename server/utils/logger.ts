import fs from 'fs';
import path from 'path';

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
let currentLevel = LOG_LEVELS[process.env.LOG_LEVEL as keyof typeof LOG_LEVELS] ?? 1;

const logDir = process.env.LOG_DIR || path.join(process.cwd(), 'data', 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

function writeLog(level: string, message: string, meta?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const entry = JSON.stringify({ timestamp, level, message, ...(meta || {}) });
  const file = path.join(logDir, `${new Date().toISOString().slice(0, 10)}.log`);
  fs.appendFileSync(file, entry + '\n', 'utf-8');
}

export function log(level: keyof typeof LOG_LEVELS, message: string, meta?: Record<string, unknown>) {
  if (LOG_LEVELS[level] < currentLevel) return;
  console.log(`[${level.toUpperCase()}] ${message}`, meta ? JSON.stringify(meta) : '');
  writeLog(level, message, meta);
}

export function setLogLevel(level: keyof typeof LOG_LEVELS) {
  currentLevel = LOG_LEVELS[level];
}
