#!/usr/bin/env node
import { render } from 'ink';
import React from 'react';
import { CloudflareClient, zoneDomainOf } from './cloudflare.js';
import { getConfigPath, getSmtpToken, loadConfig, removeRoute, removeSmtpToken, saveActiveAccount, saveRoute, saveSmtpToken } from './config.js';
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
  mailflare route create <email|domain> <dest>  Create an inbound route
                                          (a full email address routes just that address; a bare domain catches all)
  mailflare route list                   List email routing rules for the active account
  mailflare route enable <rule-id>       Enable a routing rule
  mailflare route disable <rule-id>      Disable a routing rule
  mailflare route update <rule-id> <dest> Change a routing rule's destination
  mailflare route delete <rule-id>       Delete a routing rule
  mailflare smtp create                  Mint the account's outbound SMTP token (one covers every route)
  mailflare smtp show                    Show the SMTP token saved for the active account
  mailflare smtp list                    List mailflare-issued SMTP tokens
  mailflare smtp delete <token-id>       Delete an SMTP token
  mailflare help                         Show this message`;

async function requireActiveAccountId(): Promise<string> {
  const config = await loadConfig();
  if (!config.activeAccount) throw new Error('No active account. Run "mailflare accounts" then "mailflare accounts use <id>".');
  return config.activeAccount.id;
}

async function main(argv: string[]): Promise<void> {
  const [command, sub, ...rest] = argv;

  if (!command) {
    process.stdout.write('\x1B[?1049h');
    const restore = () => process.stdout.write('\x1B[?1049l');
    process.on('exit', restore);
    const { waitUntilExit } = render(React.createElement(App));
    await waitUntilExit();
    restore();
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
      const [address, destination] = rest;
      if (!address || !destination) throw new Error('Usage: mailflare route create <email|domain> <destination>');
      const config = await loadConfig();
      const client = new CloudflareClient();
      const zone = await client.findZone(zoneDomainOf(address));
      const accountId = config.activeAccount?.id ?? zone.account.id;
      const rule = await client.createRoute(zone.id, address, destination);
      const route: Route = { domain: address, destination, accountId, zoneId: zone.id, ruleId: rule.id, createdAt: new Date().toISOString() };
      await saveRoute(route);
      console.log(`Inbound route created: ${address.includes('@') ? address : `*@${address}`} -> ${destination}`);
      if (!(await getSmtpToken(accountId))) {
        console.log('');
        console.log('No outbound SMTP token yet for this account — run "mailflare smtp create" to mint one (needed to send mail, not to receive it).');
      }
      return;
    }
    if (sub === 'list') {
      const accountId = await requireActiveAccountId();
      const rows = await new CloudflareClient().listAllRoutes(accountId);
      if (!rows.length) { console.log('No email routing rules found.'); return; }
      for (const { zone, rule } of rows) {
        console.log(`${rule.enabled ? 'ON ' : 'OFF'}  ${rule.id}  ${zone.name}  ->  ${rule.actions.flatMap((action) => action.value).join(', ')}`);
      }
      return;
    }
    if (sub === 'enable' || sub === 'disable') {
      const [ruleId] = rest;
      if (!ruleId) throw new Error(`Usage: mailflare route ${sub} <rule-id>`);
      const accountId = await requireActiveAccountId();
      const client = new CloudflareClient();
      const found = await client.findRuleById(accountId, ruleId);
      if (!found) throw new Error(`No routing rule with id ${ruleId}.`);
      await client.updateRoute(found.zone.id, found.rule, { enabled: sub === 'enable' });
      console.log(`Rule ${ruleId} ${sub}d.`);
      return;
    }
    if (sub === 'update') {
      const [ruleId, destination] = rest;
      if (!ruleId || !destination) throw new Error('Usage: mailflare route update <rule-id> <destination>');
      const accountId = await requireActiveAccountId();
      const client = new CloudflareClient();
      const found = await client.findRuleById(accountId, ruleId);
      if (!found) throw new Error(`No routing rule with id ${ruleId}.`);
      await client.updateRoute(found.zone.id, found.rule, { destination });
      console.log(`Rule ${ruleId} now forwards to ${destination}.`);
      return;
    }
    if (sub === 'delete') {
      const [ruleId] = rest;
      if (!ruleId) throw new Error('Usage: mailflare route delete <rule-id>');
      const accountId = await requireActiveAccountId();
      const client = new CloudflareClient();
      const found = await client.findRuleById(accountId, ruleId);
      if (!found) throw new Error(`No routing rule with id ${ruleId}.`);
      await client.deleteRoute(found.zone.id, ruleId);
      await removeRoute(ruleId);
      console.log(`Rule ${ruleId} deleted.`);
      return;
    }
    throw new Error('Usage: mailflare route <create|list|enable|disable|update|delete>');
  }

  if (command === 'smtp') {
    if (sub === 'create') {
      const accountId = await requireActiveAccountId();
      const apiToken = await new CloudflareClient().createEmailToken(accountId);
      const smtp = toEmailToken(apiToken);
      await saveSmtpToken(accountId, smtp);
      console.log('Outbound SMTP credential (covers every route on this account):');
      for (const line of formatSmtpLines(smtp)) console.log(`  ${line}`);
      console.log('');
      console.log(`Copy the password now — Cloudflare will not show it again. Saved to ${getConfigPath()}`);
      return;
    }
    if (sub === 'show') {
      const accountId = await requireActiveAccountId();
      const smtp = await getSmtpToken(accountId);
      if (!smtp) { console.log('No SMTP token saved for this account yet. Run "mailflare smtp create".'); return; }
      for (const line of formatSmtpLines(smtp)) console.log(line);
      return;
    }
    if (sub === 'list') {
      const tokens = await new CloudflareClient().listEmailTokens();
      if (!tokens.length) { console.log('No SMTP tokens issued yet.'); return; }
      for (const token of tokens) console.log(`${token.status.padEnd(8)} ${token.name}  (username: ${token.id})`);
      return;
    }
    if (sub === 'delete') {
      const [tokenId] = rest;
      if (!tokenId) throw new Error('Usage: mailflare smtp delete <token-id>');
      const accountId = await requireActiveAccountId();
      await new CloudflareClient().deleteEmailToken(tokenId);
      const saved = await getSmtpToken(accountId);
      if (saved?.id === tokenId) await removeSmtpToken(accountId);
      console.log(`Token ${tokenId} deleted.`);
      return;
    }
    throw new Error('Usage: mailflare smtp <create|show|list|delete>');
  }

  throw new Error(`Unknown command "${command}". Run "mailflare help".`);
}

main(process.argv.slice(2)).catch((error: Error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
