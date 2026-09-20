#!/usr/bin/env node
import { Box, render, Text, useApp, useInput, useStdout } from 'ink';
import { randomBytes } from 'node:crypto';
import React, { useEffect, useState } from 'react';
import { CloudflareClient } from './cloudflare.js';
import { getConfigPath, loadConfig, saveActiveAccount, saveSetup } from './config.js';
import { AccountPicker, Footer, Form, Header, Home, navItems, Panel, SetupList, Sidebar, type Screen } from './tui/components.js';
import type { CliOptions, Setup, WranglerAccount } from './types.js';
import { checkWrangler, getWranglerAccounts, loginWithWrangler } from './wrangler.js';

type Command = 'setup' | 'list' | 'verify' | 'fix' | 'help';

function parseArgs(args: string[]): { command: Command; values: string[]; options: CliOptions } {
  const command = (args[0] ?? 'help') as Command;
  const values: string[] = [];
  const options: CliOptions = {};
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--account-id') options.accountId = args[++index];
    else if (arg === '--zone-id') options.zoneId = args[++index];
    else if (arg === '--smtp-host') options.smtpHost = args[++index];
    else if (arg === '--smtp-port') options.smtpPort = Number(args[++index]);
    else if (arg === '--smtp-username') options.smtpUsername = args[++index];
    else values.push(arg);
  }
  return { command: ['setup', 'list', 'verify', 'fix'].includes(command) ? command : 'help', values, options };
}

function Tui() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [screen, setScreen] = useState<Screen>('home');
  const [selectedScreen, setSelectedScreen] = useState<Screen>('home');
  const [config, setConfig] = useState<{ setups: Setup[]; activeAccount?: WranglerAccount }>({ setups: [] });
  const [accounts, setAccounts] = useState<WranglerAccount[]>([]);
  const [cursor, setCursor] = useState(0);
  const [status, setStatus] = useState('Loading Wrangler session...');
  const [form, setForm] = useState({ domain: '', destination: '', field: 'domain' as 'domain' | 'destination' });
  const [focusedPane, setFocusedPane] = useState<'sidebar' | 'content'>('sidebar');

  const navigate = (delta: number) => {
    setSelectedScreen((current) => {
      const currentIndex = navItems.findIndex((item) => item.screen === current);
      return navItems[(currentIndex + delta + navItems.length) % navItems.length].screen;
    });
  };

  const selectScreen = (nextScreen: Screen) => {
    if (nextScreen === 'accounts') setCursor(0);
    if (nextScreen === 'setup') setForm({ domain: '', destination: '', field: 'domain' });
    setSelectedScreen(nextScreen);
    setScreen(nextScreen);
    setFocusedPane('content');
  };

  const refresh = async () => {
    setStatus('Checking Wrangler login...');
    const nextConfig = await loadConfig();
    setConfig(nextConfig);
    try {
      setAccounts(await getWranglerAccounts());
      setStatus('Ready');
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const submitDomain = () => setForm((value) => ({ ...value, field: 'destination' }));
  const submitDestination = () => void createTuiSetup(form.domain, form.destination, config.activeAccount).then((message) => { setStatus(message); setScreen('home'); setSelectedScreen('home'); setFocusedPane('sidebar'); void refresh(); }).catch((error: Error) => setStatus(`Error: ${error.message}`));

  useInput((input, key) => {
    if (key.tab) { setFocusedPane((value) => value === 'sidebar' ? 'content' : 'sidebar'); return; }

    if (focusedPane === 'content' && key.escape) { setSelectedScreen(screen); setFocusedPane('sidebar'); return; }

    if (focusedPane === 'content' && screen !== 'setup') {
      if (screen === 'accounts') {
        if (input === 'k' || key.upArrow) setCursor((value) => Math.max(0, value - 1));
        if (input === 'j' || key.downArrow) setCursor((value) => Math.min(Math.max(0, accounts.length - 1), value + 1));
        if (key.return && accounts[cursor]) void saveActiveAccount(accounts[cursor]).then(() => { setConfig({ ...config, activeAccount: accounts[cursor] }); setStatus(`Selected ${accounts[cursor].name}`); setScreen('home'); setFocusedPane('sidebar'); });
      } else if (screen === 'setups' && (input === 'k' || key.upArrow || input === 'j' || key.downArrow)) {
        setCursor((value) => input === 'k' || key.upArrow ? Math.max(0, value - 1) : Math.min(Math.max(0, config.setups.length - 1), value + 1));
      }
      return;
    }

    if (screen === 'setup') return;

    if (input === 'q') { exit(); return; }
    if (input === 'l') { void loginWithWrangler().then(refresh).catch((error: Error) => setStatus(`Login failed: ${error.message}`)); return; }
    if (input === 'a') { selectScreen('accounts'); return; }
    if (input === 's') { selectScreen('setup'); return; }
    if (input === 'v') { void refresh(); return; }
    if (input === 'e') { selectScreen('setups'); return; }
    if (input === 'h') { selectScreen('home'); return; }
    if (key.return) { selectScreen(selectedScreen); return; }
    if (key.escape) { if (screen === 'home') exit(); else setScreen('home'); return; }
    if (key.upArrow) { navigate(-1); return; }
    if (key.downArrow) { navigate(1); return; }

  });

  return React.createElement(Box, { flexDirection: 'column', height: stdout.rows ?? 24, padding: 1 },
    React.createElement(Header, { screen, account: config.activeAccount }),
    React.createElement(Box, { flexDirection: 'row', flexGrow: 1 },
      React.createElement(Sidebar, { screen, selectedScreen, account: config.activeAccount, isFocused: focusedPane === 'sidebar' }),
      React.createElement(Box, { flexDirection: 'column', flexGrow: 1, paddingLeft: 2 },
        screen === 'home' && React.createElement(Home, { config, status }),
        screen === 'accounts' && React.createElement(Panel, { title: 'CLOUDFLARE ACCOUNTS', isFocused: focusedPane === 'content' }, React.createElement(AccountPicker, { accounts, cursor })),
        screen === 'setup' && React.createElement(Panel, { title: 'CREATE INBOUND ROUTING', isFocused: focusedPane === 'content' }, React.createElement(Form, { form, isFocused: focusedPane === 'content', onDomainChange: (domain) => setForm((value) => ({ ...value, domain })), onDestinationChange: (destination) => setForm((value) => ({ ...value, destination })), onSubmitDomain: submitDomain, onSubmitDestination: submitDestination })),
        screen === 'setups' && React.createElement(Panel, { title: 'SAVED ROUTES', isFocused: focusedPane === 'content' }, React.createElement(SetupList, { setups: config.setups, cursor })),
      ),
    ),
    React.createElement(Footer, { focusedPane }),
  );
}

async function createTuiSetup(domain: string, destination: string, activeAccount?: WranglerAccount): Promise<string> {
  if (!domain || !destination) throw new Error('Both domain and Gmail destination are required.');
  const client = new CloudflareClient();
  await checkWrangler();
  const zone = await client.findZone(domain);
  const route = await client.createRoute(zone.id, destination);
  const smtp = { host: 'configure-an-smtp-provider', port: 587, username: destination, apiKey: randomBytes(24).toString('hex') };
  await saveSetup({ domain, destination, zoneId: zone.id, accountId: activeAccount?.id ?? zone.account.id, ruleId: route.id, createdAt: new Date().toISOString(), smtp });
  return `Created route ${domain} -> ${destination}. Profile saved at ${getConfigPath()}`;
}

async function execute(command: Command, values: string[], options: CliOptions): Promise<string[]> {
  if (command === 'help') return ['Cloudflare email routing, from your terminal.', '', 'Run `mailflare` without arguments for the interactive TUI.', '', 'Commands:', '  mailflare setup <domain> <gmail>  Create inbound routing and an SMTP profile', '  mailflare list                     List saved email setups', '  mailflare verify <domain>           Check Cloudflare routing status', '  mailflare fix <domain>              Re-apply the saved route'];
  if (command === 'list') { const config = await loadConfig(); return config.setups.length ? config.setups.map((setup) => `${setup.domain} -> ${setup.destination} (${setup.smtp?.host ?? 'SMTP provider not configured'})`) : ['No setups saved.']; }
  const domain = values[0];
  if (!domain) throw new Error(`${command} requires a domain.`);
  const config = await loadConfig();
  const saved = config.setups.find((setup) => setup.domain === domain);
  const client = new CloudflareClient();
  await checkWrangler();
  const zone = options.zoneId ? { id: options.zoneId, account: { id: options.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID ?? '' } } : await client.findZone(domain);
  if (command === 'verify') { const status = await client.verifyRouting(zone.id); return [`${domain}: routing ${status.enabled ? 'enabled' : 'disabled'}.`]; }
  if (command === 'fix') { if (!saved) throw new Error(`No saved setup for ${domain}. Run setup first.`); const route = await client.createRoute(zone.id, saved.destination, saved.ruleId); return [`Route restored for ${domain}.`, `Rule: ${route.id}`]; }
  const destination = values[1];
  if (!destination) throw new Error('setup requires a Gmail destination.');
  const route = await client.createRoute(zone.id, destination);
  const smtp = { host: options.smtpHost ?? 'configure-an-smtp-provider', port: options.smtpPort ?? 587, username: options.smtpUsername ?? destination, apiKey: randomBytes(24).toString('hex') };
  await saveSetup({ domain, destination, zoneId: zone.id, accountId: zone.account.id, ruleId: route.id, createdAt: new Date().toISOString(), smtp });
  return [`Incoming route created: ${domain} -> ${destination}`, `SMTP profile saved: ${smtp.host}:${smtp.port}`, `Local API key: ${smtp.apiKey}`, `Config: ${getConfigPath()}`];
}

function CliApp({ command, values, options }: { command: Command; values: string[]; options: CliOptions }) {
  const { exit } = useApp();
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  useInput((input, key) => { if (key.escape) exit(); });
  useEffect(() => { void execute(command, values, options).then(setLines).catch((error: Error) => setLines([`Error: ${error.message}`])).finally(() => setBusy(false)); }, []);
  return React.createElement(Box, { flexDirection: 'column', padding: 1 }, React.createElement(Text, { color: 'cyan', bold: true }, 'mailflare'), ...lines.map((line, index) => React.createElement(Text, { key: index, color: line.startsWith('Error:') ? 'red' : undefined }, line)), busy ? React.createElement(Text, { color: 'yellow' }, 'working...') : null);
}

const parsed = parseArgs(process.argv.slice(2));
render(process.argv.length <= 2 ? React.createElement(Tui) : React.createElement(CliApp, parsed));