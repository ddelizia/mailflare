import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { WranglerAccount } from './types.js';

function getXdgConfigDir(): string {
  if (process.env.XDG_CONFIG_HOME) return process.env.XDG_CONFIG_HOME;
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Preferences');
  if (process.platform === 'win32') return process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming', 'xdg.config');
  return join(homedir(), '.config');
}

const wranglerConfigPath = join(getXdgConfigDir(), '.wrangler', 'config', 'default.toml');

export function runWrangler(args: string[], inherit = false): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['wrangler', ...args], { env: process.env, stdio: inherit ? 'inherit' : 'pipe' });
    if (inherit) {
      child.on('error', (error) => resolve({ stdout: '', stderr: error.message, code: 1 }));
      child.on('close', (code) => resolve({ stdout: '', stderr: '', code: code ?? 1 }));
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', (error) => resolve({ stdout, stderr: error.message, code: 1 }));
    child.on('close', (code) => resolve({ stdout, stderr, code: code ?? 1 }));
  });
}

export async function loginWithWrangler(): Promise<void> {
  const result = await runWrangler(['login'], true);
  if (result.code !== 0) throw new Error('Wrangler login did not complete.');
}

export function getWranglerAuthToken(): string | undefined {
  try {
    const config = readFileSync(wranglerConfigPath, 'utf8');
    return config.match(/^oauth_token\s*=\s*["']([^"']+)["']/m)?.[1];
  } catch {
    return undefined;
  }
}

export async function getWranglerAccounts(): Promise<WranglerAccount[]> {
  const result = await runWrangler(['whoami']);
  if (result.code !== 0) throw new Error('Wrangler is not authenticated. Choose Login first.');
  const output = `${result.stdout}\n${result.stderr}`;
  const accounts: WranglerAccount[] = [];
  for (const line of output.split(/\r?\n/)) {
    const id = line.match(/[a-f0-9]{32}/i)?.[0];
    if (!id || accounts.some((account) => account.id === id)) continue;
    const beforeId = line.slice(0, line.indexOf(id)).replace(/[│|]/g, ' ').trim();
    const name = beforeId.split(/\s{2,}/).filter(Boolean).at(-1) || id;
    accounts.push({ id, name });
  }
  if (!accounts.length) throw new Error('Wrangler is logged in, but no Cloudflare accounts were found.');
  return accounts;
}

export async function checkWrangler(): Promise<string> {
  const result = await runWrangler(['whoami']);
  if (result.code !== 0) throw new Error(`Wrangler is not authenticated. Run "npx wrangler login".\n${result.stderr.trim()}`);
  return result.stdout.trim();
}