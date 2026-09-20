import { Alert, Badge, Select, Spinner, StatusMessage, TextInput } from '@inkjs/ui';
import { Box, Text, useApp, useInput } from 'ink';
import React, { useEffect, useState } from 'react';
import { CloudflareClient } from './cloudflare.js';
import { loadConfig, saveActiveAccount, saveRoute } from './config.js';
import { formatSmtpLines, toEmailToken } from './smtp.js';
import type { Route, WranglerAccount } from './types.js';
import { getWranglerAccounts, loginWithWrangler } from './wrangler.js';

type Screen = 'menu' | 'login' | 'accounts' | 'create' | 'routes' | 'smtp';

const MENU_OPTIONS: Array<{ label: string; value: Screen | 'quit' }> = [
  { label: 'Login with Wrangler', value: 'login' },
  { label: 'Select Cloudflare account', value: 'accounts' },
  { label: 'Create email route + SMTP token', value: 'create' },
  { label: 'List email routes', value: 'routes' },
  { label: 'List SMTP configurations', value: 'smtp' },
  { label: 'Quit', value: 'quit' },
];

function BackHint() {
  return <Text dimColor>Press Esc to return to the menu</Text>;
}

function useEscBack(onBack: () => void, enabled: boolean) {
  useInput((_input, key) => {
    if (enabled && key.escape) onBack();
  });
}

function Menu({ account, onSelect }: { account?: WranglerAccount; onSelect: (value: Screen | 'quit') => void }) {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">mailflare</Text>
      <Text dimColor>{account ? `Active account: ${account.name} (${account.id})` : 'No Cloudflare account selected yet.'}</Text>
      <Box marginTop={1}>
        <Select options={MENU_OPTIONS} onChange={(value) => onSelect(value as Screen | 'quit')} />
      </Box>
    </Box>
  );
}

function LoginScreen({ onBack }: { onBack: () => void }) {
  const [status, setStatus] = useState<'running' | 'done' | 'error'>('running');
  const [error, setError] = useState('');

  useEffect(() => {
    loginWithWrangler()
      .then(() => setStatus('done'))
      .catch((err: Error) => { setError(err.message); setStatus('error'); });
  }, []);

  useEscBack(onBack, status !== 'running');

  return (
    <Box flexDirection="column">
      {status === 'running' && <Spinner label="Opening Wrangler login in your browser..." />}
      {status === 'done' && <StatusMessage variant="success">Wrangler login complete.</StatusMessage>}
      {status === 'error' && <Alert variant="error" title="Login failed">{error}</Alert>}
      {status !== 'running' && <BackHint />}
    </Box>
  );
}

function AccountsScreen({ onSelected, onBack }: { onSelected: (account: WranglerAccount) => void; onBack: () => void }) {
  const [accounts, setAccounts] = useState<WranglerAccount[] | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<WranglerAccount | null>(null);

  useEffect(() => {
    getWranglerAccounts().then(setAccounts).catch((err: Error) => setError(err.message));
  }, []);

  useEscBack(onBack, accounts !== null || error !== '');

  const handleChange = (value: string) => {
    const account = accounts?.find((item) => item.id === value);
    if (!account) return;
    setSelected(account);
    void saveActiveAccount(account).then(() => onSelected(account));
  };

  if (error) return <Box flexDirection="column"><Alert variant="error" title="Could not load accounts">{error}</Alert><BackHint /></Box>;
  if (!accounts) return <Spinner label="Loading Cloudflare accounts via Wrangler..." />;
  if (!accounts.length) return <Box flexDirection="column"><Alert variant="warning">No Cloudflare accounts found. Log in first.</Alert><BackHint /></Box>;
  if (selected) return <StatusMessage variant="success">{`Active account set to ${selected.name}.`}</StatusMessage>;

  return (
    <Box flexDirection="column">
      <Text dimColor>Choose the Cloudflare account mailflare should operate on.</Text>
      <Box marginTop={1}>
        <Select options={accounts.map((account) => ({ label: `${account.name}  (${account.id})`, value: account.id }))} onChange={handleChange} />
      </Box>
    </Box>
  );
}

type CreateStep = 'domain' | 'destination' | 'working' | 'done' | 'error';

function CreateRouteScreen({ account, onBack }: { account?: WranglerAccount; onBack: () => void }) {
  const [step, setStep] = useState<CreateStep>('domain');
  const [domain, setDomain] = useState('');
  const [error, setError] = useState('');
  const [route, setRoute] = useState<Route | null>(null);

  useEscBack(onBack, step !== 'working');

  const submitDomain = (value: string) => { setDomain(value); setStep('destination'); };

  const submitDestination = (destination: string) => {
    setStep('working');
    void (async () => {
      try {
        const client = new CloudflareClient();
        const zone = await client.findZone(domain);
        const accountId = account?.id ?? zone.account.id;
        const rule = await client.createRoute(zone.id, destination);
        const apiToken = await client.createEmailToken(accountId, domain);
        const smtp = toEmailToken(apiToken);
        const nextRoute: Route = { domain, destination, accountId, zoneId: zone.id, ruleId: rule.id, createdAt: new Date().toISOString(), smtp };
        await saveRoute(nextRoute);
        setRoute(nextRoute);
        setStep('done');
      } catch (err) {
        setError((err as Error).message);
        setStep('error');
      }
    })();
  };

  if (step === 'domain') {
    return (
      <Box flexDirection="column">
        <Text dimColor>Domain to route inbound mail for (must be an active Cloudflare zone).</Text>
        <Box marginTop={1}><TextInput placeholder="example.com" onSubmit={submitDomain} /></Box>
      </Box>
    );
  }

  if (step === 'destination') {
    return (
      <Box flexDirection="column">
        <Text dimColor>{`Forward *@${domain} to which destination address?`}</Text>
        <Box marginTop={1}><TextInput placeholder="you@example.com" onSubmit={submitDestination} /></Box>
      </Box>
    );
  }

  if (step === 'working') return <Spinner label={`Creating route for ${domain} and minting an SMTP token...`} />;

  if (step === 'error') return <Box flexDirection="column"><Alert variant="error" title="Could not create route">{error}</Alert><BackHint /></Box>;

  const created = route!;
  return (
    <Box flexDirection="column">
      <StatusMessage variant="success">{`Inbound route created: *@${created.domain} -> ${created.destination}`}</StatusMessage>
      <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">Outbound SMTP credential</Text>
        {formatSmtpLines(created.smtp!).map((line) => <Text key={line}>{line}</Text>)}
      </Box>
      <Box marginTop={1}><Text color="yellow">Copy the password now — Cloudflare will not show it again.</Text></Box>
      <Box marginTop={1}><BackHint /></Box>
    </Box>
  );
}

type RouteRow = { zone: { name: string }; rule: { id: string; enabled: boolean; actions: Array<{ value: string[] }> } };

function RoutesScreen({ account, onBack }: { account?: WranglerAccount; onBack: () => void }) {
  const [rows, setRows] = useState<RouteRow[] | null>(null);
  const [error, setError] = useState('');

  useEscBack(onBack, true);

  useEffect(() => {
    if (!account) return;
    new CloudflareClient().listAllRoutes(account.id).then(setRows).catch((err: Error) => setError(err.message));
  }, [account]);

  if (!account) return <Box flexDirection="column"><Alert variant="warning">Select a Cloudflare account first.</Alert><BackHint /></Box>;
  if (error) return <Box flexDirection="column"><Alert variant="error" title="Could not list routes">{error}</Alert><BackHint /></Box>;
  if (!rows) return <Spinner label={`Fetching routing rules for ${account.name}...`} />;
  if (!rows.length) return <Box flexDirection="column"><Text dimColor>No email routing rules found in this account.</Text><BackHint /></Box>;

  return (
    <Box flexDirection="column">
      <Text dimColor>{`${rows.length} routing rule(s) across zones in ${account.name}.`}</Text>
      <Box marginTop={1} flexDirection="column">
        {rows.map(({ zone, rule }) => (
          <Box key={rule.id}>
            <Badge color={rule.enabled ? 'green' : 'gray'}>{rule.enabled ? 'ON' : 'OFF'}</Badge>
            <Text>{`  ${zone.name}  ->  ${rule.actions.flatMap((action) => action.value).join(', ')}`}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}><BackHint /></Box>
    </Box>
  );
}

function SmtpScreen({ onBack }: { onBack: () => void }) {
  const [tokens, setTokens] = useState<Array<{ id: string; name: string; status: string }> | null>(null);
  const [error, setError] = useState('');

  useEscBack(onBack, true);

  useEffect(() => {
    new CloudflareClient().listEmailTokens().then(setTokens).catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <Box flexDirection="column"><Alert variant="error" title="Could not list SMTP tokens">{error}</Alert><BackHint /></Box>;
  if (!tokens) return <Spinner label="Fetching mailflare-issued API tokens..." />;
  if (!tokens.length) return <Box flexDirection="column"><Text dimColor>No SMTP tokens issued yet. Create a route to mint one.</Text><BackHint /></Box>;

  return (
    <Box flexDirection="column">
      <Text dimColor>{`${tokens.length} SMTP credential(s). Passwords are one-time and not stored by Cloudflare.`}</Text>
      <Box marginTop={1} flexDirection="column">
        {tokens.map((token) => (
          <Box key={token.id}>
            <Badge color={token.status === 'active' ? 'green' : 'gray'}>{token.status.toUpperCase()}</Badge>
            <Text>{`  ${token.name}  (username: ${token.id})`}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}><BackHint /></Box>
    </Box>
  );
}

export function App() {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>('menu');
  const [account, setAccount] = useState<WranglerAccount | undefined>(undefined);

  useEffect(() => { loadConfig().then((config) => setAccount(config.activeAccount)); }, []);

  const handleMenuSelect = (value: Screen | 'quit') => {
    if (value === 'quit') { exit(); return; }
    setScreen(value);
  };

  const backToMenu = () => setScreen('menu');

  return (
    <Box flexDirection="column" padding={1}>
      {screen === 'menu' && <Menu account={account} onSelect={handleMenuSelect} />}
      {screen === 'login' && <LoginScreen onBack={backToMenu} />}
      {screen === 'accounts' && <AccountsScreen onSelected={setAccount} onBack={backToMenu} />}
      {screen === 'create' && <CreateRouteScreen account={account} onBack={backToMenu} />}
      {screen === 'routes' && <RoutesScreen account={account} onBack={backToMenu} />}
      {screen === 'smtp' && <SmtpScreen onBack={backToMenu} />}
    </Box>
  );
}
