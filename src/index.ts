#!/usr/bin/env node
import { render } from 'ink';
import React from 'react';
import { CloudflareClient } from './cloudflare.js';
import { getConfigPath, loadConfig, saveActiveAccount, saveRoute } from './config.js';
import { formatSmtpLines, toEmailToken } from './smtp.js';
import { App } from './tui.js';
import type { Route } from './types.js';
import { getWranglerAccounts, loginWithWrangler } from './wrangler.js';

const HELP = `mailflare — Cloudflare email routing, from your terminal.

Run "mailflare" with no arguments for the interactive TUI.

Commands:
  mailflare login                        Log in with Wrangler
  mailflare accounts                     List Cloudflare accounts for the logged-in user
  mailflare accounts use <account-id>    Set the active Cloudflare account
  mailflare route create <domain> <dest> Create an inbound route + outbound SMTP token
  mailflare route list                   List email routing rules for the active account
  mailflare smtp list                    List mailflare-issued SMTP tokens
  mailflare help                         Show this message`;

async function requireActiveAccountId(): Promise<string> {
  const config = await loadConfig();
  if (!config.activeAccount) throw new Error('No active account. Run "mailflare accounts" then "mailflare accounts use <id>".');
  return config.activeAccount.id;
}

async function main(argv: string[]): Promise<void> {
  const [command, sub, ...rest] = argv;

  if (!command) {
    render(React.createElement(App));
    return;
  }

  if (command === 'help' || command === '--help' || command === '-h') {
    console.log(HELP);
    return;
  }

  if (command === 'login') {
    await loginWithWrangler();
    console.log('Wrangler login complete.');
    return;
  }

  if (command === 'accounts') {
    if (sub === 'use') {
      const accountId = rest[0];
      if (!accountId) throw new Error('Usage: mailflare accounts use <account-id>');
      const account = (await getWranglerAccounts()).find((item) => item.id === accountId);
      if (!account) throw new Error(`No Cloudflare account with id ${accountId}.`);
      await saveActiveAccount(account);
      console.log(`Active account set to ${account.name} (${account.id}).`);
      return;
    }
    const accounts = await getWranglerAccounts();
    for (const account of accounts) console.log(`${account.id}  ${account.name}`);
    return;
  }

  if (command === 'route') {
    if (sub === 'create') {
      const [domain, destination] = rest;
      if (!domain || !destination) throw new Error('Usage: mailflare route create <domain> <destination>');
      const config = await loadConfig();
      const client = new CloudflareClient();
      const zone = await client.findZone(domain);
      const accountId = config.activeAccount?.id ?? zone.account.id;
      const rule = await client.createRoute(zone.id, destination);
      const apiToken = await client.createEmailToken(accountId, domain);
      const smtp = toEmailToken(apiToken);
      const route: Route = { domain, destination, accountId, zoneId: zone.id, ruleId: rule.id, createdAt: new Date().toISOString(), smtp };
      await saveRoute(route);
      console.log(`Inbound route created: *@${domain} -> ${destination}`);
      console.log('');
      console.log('Outbound SMTP credential:');
      for (const line of formatSmtpLines(smtp)) console.log(`  ${line}`);
      console.log('');
      console.log(`Copy the password now — Cloudflare will not show it again. Saved to ${getConfigPath()}`);
      return;
    }
    if (sub === 'list') {
      const accountId = await requireActiveAccountId();
      const rows = await new CloudflareClient().listAllRoutes(accountId);
      if (!rows.length) { console.log('No email routing rules found.'); return; }
      for (const { zone, rule } of rows) {
        console.log(`${rule.enabled ? 'ON ' : 'OFF'}  ${zone.name}  ->  ${rule.actions.flatMap((action) => action.value).join(', ')}`);
      }
      return;
    }
    throw new Error('Usage: mailflare route <create|list>');
  }

  if (command === 'smtp' && sub === 'list') {
    const tokens = await new CloudflareClient().listEmailTokens();
    if (!tokens.length) { console.log('No SMTP tokens issued yet.'); return; }
    for (const token of tokens) console.log(`${token.status.padEnd(8)} ${token.name}  (username: ${token.id})`);
    return;
  }

  throw new Error(`Unknown command "${command}". Run "mailflare help".`);
}

main(process.argv.slice(2)).catch((error: Error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
