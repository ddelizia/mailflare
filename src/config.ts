import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { EmailToken, MailflareConfig, Route, WranglerAccount } from './types.js';

const configDir = join(homedir(), '.mailflare');
const configPath = join(configDir, 'config.json');

export async function loadConfig(): Promise<MailflareConfig> {
  try {
    return JSON.parse(await readFile(configPath, 'utf8')) as MailflareConfig;
  } catch {
    return { routes: [] };
  }
}

async function writeConfig(config: MailflareConfig): Promise<void> {
  await mkdir(configDir, { recursive: true, mode: 0o700 });
  await writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export async function saveRoute(route: Route): Promise<void> {
  const config = await loadConfig();
  const routes = config.routes.filter((item) => item.domain !== route.domain);
  routes.push(route);
  await writeConfig({ ...config, routes });
}

export async function removeRoute(ruleId: string): Promise<void> {
  const config = await loadConfig();
  const routes = config.routes.filter((item) => item.ruleId !== ruleId);
  await writeConfig({ ...config, routes });
}

export async function saveActiveAccount(account: WranglerAccount): Promise<void> {
  const config = await loadConfig();
  await writeConfig({ ...config, activeAccount: account });
}

export async function getSmtpToken(accountId: string): Promise<EmailToken | undefined> {
  const config = await loadConfig();
  return config.smtpTokens?.[accountId];
}

export async function saveSmtpToken(accountId: string, token: EmailToken): Promise<void> {
  const config = await loadConfig();
  await writeConfig({ ...config, smtpTokens: { ...config.smtpTokens, [accountId]: token } });
}

export async function removeSmtpToken(accountId: string): Promise<void> {
  const config = await loadConfig();
  const smtpTokens = { ...config.smtpTokens };
  delete smtpTokens[accountId];
  await writeConfig({ ...config, smtpTokens });
}

export function getConfigPath(): string {
  return configPath;
}
