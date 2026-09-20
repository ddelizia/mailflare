import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { MailflareConfig, Setup, WranglerAccount } from './types.js';

const configDir = join(homedir(), '.mailflare');
const configPath = join(configDir, 'config.json');

export async function loadConfig(): Promise<MailflareConfig> {
  try {
    return JSON.parse(await readFile(configPath, 'utf8')) as MailflareConfig;
  } catch {
    return { setups: [] };
  }
}

export async function saveSetup(setup: Setup): Promise<void> {
  const config = await loadConfig();
  const setups = config.setups.filter((item) => item.domain !== setup.domain);
  setups.push(setup);
  await mkdir(configDir, { recursive: true, mode: 0o700 });
  await writeFile(configPath, JSON.stringify({ setups }, null, 2), { mode: 0o600 });
}

export async function saveActiveAccount(account: WranglerAccount): Promise<void> {
  const config = await loadConfig();
  await mkdir(configDir, { recursive: true, mode: 0o700 });
  await writeFile(configPath, JSON.stringify({ ...config, activeAccount: account }, null, 2), { mode: 0o600 });
}

export function getConfigPath(): string {
  return configPath;
}