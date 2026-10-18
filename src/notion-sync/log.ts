import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { redactSensitiveText } from "../things-url.js";

export function redactLog(text: string): string {
  return redactSensitiveText(text)
    .replace(/Bearer\s+\S+/gi, "Bearer ***")
    .replace(/\b(?:ntn|secret)_[A-Za-z0-9]+/g, "***");
}

export function logFilePath(): string {
  return path.join(homedir(), "Library", "Logs", "things-notion-sync.log");
}

export async function writeLog(line: string): Promise<void> {
  const file = logFilePath();
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${redactLog(line)}\n`);
}
