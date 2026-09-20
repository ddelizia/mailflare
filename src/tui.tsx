import { Alert, Badge, Select, Spinner, StatusMessage, TextInput } from '@inkjs/ui';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import React, { useEffect, useMemo, useState } from 'react';
import { CloudflareClient, zoneDomainOf, type RoutingRule, type Zone } from './cloudflare.js';
import { getSmtpToken, loadConfig, removeRoute, removeSmtpToken, saveActiveAccount, saveRoute, saveSmtpToken } from './config.js';
import { formatSmtpLines, toEmailToken } from './smtp.js';
import type { EmailToken, Route, WranglerAccount } from './types.js';
import { getWranglerAccounts, getWranglerAuthToken, loginWithWrangler } from './wrangler.js';

type Screen = 'menu' | 'login' | 'accounts' | 'create' | 'routes' | 'smtp';

const MENU_OPTIONS: Array<{ label: string; value: Screen | 'quit'; key: string; short: string }> = [
  { label: 'Login with Wrangler', value: 'login', key: '1', short: 'Login' },
  { label: 'Select Cloudflare account', value: 'accounts', key: '2', short: 'Accounts' },
  { label: 'Create email route', value: 'create', key: '3', short: 'Create' },
  { label: 'List email routes', value: 'routes', key: '4', short: 'Routes' },
  { label: 'Outbound SMTP token', value: 'smtp', key: '5', short: 'SMTP' },
  { label: 'Quit', value: 'quit', key: 'q', short: 'Quit' },
];

function BackHint() {
  return <Text dimColor>Press Esc to return to the menu</Text>;
}

function useEscBack(onBack: () => void, enabled: boolean) {
  useInput((_input, key) => {
    if (enabled && key.escape) onBack();
  });
}

const SCREEN_TITLES: Record<Screen, string> = {
  menu: 'Dashboard',
  login: 'Login with Wrangler',
  accounts: 'Select Cloudflare Account',
  create: 'Create Email Route',
  routes: 'Email Routes',
  smtp: 'SMTP Tokens',
};

function useTerminalSize() {
  const { stdout } = useStdout();
  const [size, setSize] = useState({ columns: stdout.columns || 80, rows: stdout.rows || 24 });
  useEffect(() => {
    const onResize = () => setSize({ columns: stdout.columns || 80, rows: stdout.rows || 24 });
    stdout.on('resize', onResize);
    return () => { stdout.off('resize', onResize); };
  }, [stdout]);
  return size;
}

function Sidebar({ screen, onSelect }: { screen: Screen; onSelect: (value: Screen | 'quit') => void }) {
  return (
    <Box flexDirection="column" width={28} paddingX={1} paddingY={1} borderStyle="single" borderColor="gray" borderTop={false} borderBottom={false} borderLeft={false}>
      <Text bold dimColor>NAVIGATION</Text>
      <Box marginTop={1} flexDirection="column">
        {screen === 'menu' ? (
          <Select
            options={MENU_OPTIONS.map((option) => ({ label: `[${option.key.toUpperCase()}] ${option.label}`, value: option.value }))}
            visibleOptionCount={MENU_OPTIONS.length}
            onChange={(value) => onSelect(value as Screen | 'quit')}
          />
        ) : (
          MENU_OPTIONS.map((option) => (
            <Box key={option.value} paddingX={1}>
              <Text backgroundColor={option.value === screen ? 'cyan' : undefined} color={option.value === screen ? 'black' : undefined} dimColor={option.value !== screen} bold={option.value === screen}>
                {`[${option.key.toUpperCase()}] ${option.label}`}
              </Text>
            </Box>
          ))
        )}
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
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [route, setRoute] = useState<Route | null>(null);

  useEscBack(onBack, step !== 'working');

  const submitAddress = (value: string) => { setAddress(value); setStep('destination'); };

  const [smtpMissing, setSmtpMissing] = useState(false);

  const submitDestination = (destination: string) => {
    setStep('working');
    void (async () => {
      try {
        const client = new CloudflareClient();
        const zone = await client.findZone(zoneDomainOf(address));
        const accountId = account?.id ?? zone.account.id;
        const rule = await client.createRoute(zone.id, address, destination);
        const nextRoute: Route = { domain: address, destination, accountId, zoneId: zone.id, ruleId: rule.id, createdAt: new Date().toISOString() };
        await saveRoute(nextRoute);
        setSmtpMissing(!(await getSmtpToken(accountId)));
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
        <Text dimColor>Email address or domain to route inbound mail for (domain must be an active Cloudflare zone; a full address routes just that mailbox, a bare domain catches all).</Text>
        <Box marginTop={1}><TextInput placeholder="you@example.com or example.com" onSubmit={submitAddress} /></Box>
      </Box>
    );
  }

  if (step === 'destination') {
    return (
      <Box flexDirection="column">
        <Text dimColor>{`Forward ${address.includes('@') ? address : `*@${address}`} to which destination address?`}</Text>
        <Box marginTop={1}><TextInput placeholder="you@example.com" onSubmit={submitDestination} /></Box>
      </Box>
    );
  }

  if (step === 'working') return <Spinner label={`Creating route for ${address}...`} />;

  if (step === 'error') return <Box flexDirection="column"><Alert variant="error" title="Could not create route">{error}</Alert><BackHint /></Box>;

  const created = route!;
  return (
    <Box flexDirection="column">
      <StatusMessage variant="success">{`Inbound route created: ${created.domain.includes('@') ? created.domain : `*@${created.domain}`} -> ${created.destination}`}</StatusMessage>
      {smtpMissing && (
        <Box marginTop={1}><Text dimColor>No outbound SMTP token yet for this account — open "Outbound SMTP token" from the menu to mint one (needed to send mail, not to receive it).</Text></Box>
      )}
      <Box marginTop={1}><BackHint /></Box>
    </Box>
  );
}

type RouteRow = { zone: Zone; rule: RoutingRule };
type RoutesMode = 'list' | 'actions' | 'edit' | 'confirm-delete' | 'busy';

function matchedAddress(zone: { name: string }, matchers: Array<{ type: string; value?: string }>): string {
  const literal = matchers.find((matcher) => matcher.type === 'literal')?.value;
  return literal ?? `*@${zone.name}`;
}

function routeDestination(rule: RoutingRule): string {
  return rule.actions.flatMap((action) => action.value).join(', ');
}

function RoutesScreen({ account, onBack }: { account?: WranglerAccount; onBack: () => void }) {
  const client = useMemo(() => new CloudflareClient(), []);
  const [rows, setRows] = useState<RouteRow[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<RouteRow | null>(null);
  const [mode, setMode] = useState<RoutesMode>('list');

  const refresh = () => {
    if (!account) return;
    setRows(null);
    client.listAllRoutes(account.id).then(setRows).catch((err: Error) => setError(err.message));
  };

  useEffect(refresh, [account]);

  useEscBack(() => {
    if (mode === 'list') { onBack(); return; }
    if (mode === 'actions') { setMode('list'); setSelected(null); return; }
    setMode('actions');
  }, mode !== 'busy');

  const runAction = (promise: Promise<unknown>, successNotice: string) => {
    setMode('busy');
    promise
      .then(() => { setNotice(successNotice); setSelected(null); setMode('list'); refresh(); })
      .catch((err: Error) => { setError(err.message); setMode('list'); });
  };

  if (!account) return <Box flexDirection="column"><Alert variant="warning">Select a Cloudflare account first.</Alert><BackHint /></Box>;
  if (error) return <Box flexDirection="column"><Alert variant="error" title="Could not update routes">{error}</Alert><BackHint /></Box>;

  if (mode === 'busy') return <Spinner label="Updating routing rule..." />;

  if (mode === 'actions' && selected) {
    const address = matchedAddress(selected.zone, selected.rule.matchers);
    return (
      <Box flexDirection="column">
        <Text bold>{address}</Text>
        <Text dimColor>{`Forwards to ${routeDestination(selected.rule)} — currently ${selected.rule.enabled ? 'enabled' : 'disabled'}.`}</Text>
        <Box marginTop={1}>
          <Select
            options={[
              { label: selected.rule.enabled ? 'Disable' : 'Enable', value: 'toggle' },
              { label: 'Change destination', value: 'edit' },
              { label: 'Delete route', value: 'delete' },
              { label: 'Back', value: 'back' },
            ]}
            onChange={(value) => {
              if (value === 'back') { setMode('list'); setSelected(null); return; }
              if (value === 'edit') { setMode('edit'); return; }
              if (value === 'delete') { setMode('confirm-delete'); return; }
              runAction(
                client.updateRoute(selected.zone.id, selected.rule, { enabled: !selected.rule.enabled }),
                `${address} ${selected.rule.enabled ? 'disabled' : 'enabled'}.`,
              );
            }}
          />
        </Box>
      </Box>
    );
  }

  if (mode === 'edit' && selected) {
    const address = matchedAddress(selected.zone, selected.rule.matchers);
    return (
      <Box flexDirection="column">
        <Text dimColor>{`New destination for ${address}`}</Text>
        <Box marginTop={1}>
          <TextInput
            placeholder="you@example.com"
            onSubmit={(destination) => runAction(client.updateRoute(selected.zone.id, selected.rule, { destination }), `${address} now forwards to ${destination}.`)}
          />
        </Box>
      </Box>
    );
  }

  if (mode === 'confirm-delete' && selected) {
    const address = matchedAddress(selected.zone, selected.rule.matchers);
    return (
      <Box flexDirection="column">
        <Alert variant="warning">{`Delete route ${address}? This cannot be undone.`}</Alert>
        <Box marginTop={1}>
          <Select
            options={[{ label: 'Yes, delete it', value: 'yes' }, { label: 'Cancel', value: 'no' }]}
            onChange={(value) => {
              if (value === 'no') { setMode('actions'); return; }
              runAction(client.deleteRoute(selected.zone.id, selected.rule.id).then(() => removeRoute(selected.rule.id)), `${address} deleted.`);
            }}
          />
        </Box>
      </Box>
    );
  }

  if (!rows) return <Spinner label={`Fetching routing rules for ${account.name}...`} />;
  if (!rows.length) return <Box flexDirection="column"><Text dimColor>No email routing rules found in this account.</Text><BackHint /></Box>;

  return (
    <Box flexDirection="column">
      <Text dimColor>{`${rows.length} routing rule(s) across zones in ${account.name}. Select one to manage it.`}</Text>
      <Box marginTop={1}>
        <Select
          options={rows.map((row) => ({
            label: `${row.rule.enabled ? '●' : '○'} ${matchedAddress(row.zone, row.rule.matchers)}  ->  ${routeDestination(row.rule)}`,
            value: `${row.zone.id}:${row.rule.id}`,
          }))}
          onChange={(value) => {
            const row = rows.find((item) => `${item.zone.id}:${item.rule.id}` === value);
            if (row) { setSelected(row); setMode('actions'); }
          }}
        />
      </Box>
      {notice && <Box marginTop={1}><StatusMessage variant="success">{notice}</StatusMessage></Box>}
      <Box marginTop={1}><BackHint /></Box>
    </Box>
  );
}

type SmtpMode = 'idle' | 'confirm-delete' | 'busy';

function SmtpScreen({ account, onBack }: { account?: WranglerAccount; onBack: () => void }) {
  const [tokens, setTokens] = useState<Array<{ id: string; name: string; status: string }> | null>(null);
  const [local, setLocal] = useState<EmailToken | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mode, setMode] = useState<SmtpMode>('idle');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const refresh = () => {
    new CloudflareClient().listEmailTokens().then(setTokens).catch((err: Error) => setError(err.message));
    if (account) getSmtpToken(account.id).then((token) => setLocal(token ?? null));
  };

  useEscBack(() => {
    if (mode === 'confirm-delete') { setMode('idle'); setPendingDeleteId(null); return; }
    onBack();
  }, mode !== 'busy');

  useEffect(refresh, [account]);

  const createToken = () => {
    if (!account) return;
    setMode('busy');
    void (async () => {
      try {
        const apiToken = await new CloudflareClient().createEmailToken(account.id);
        const smtp = toEmailToken(apiToken);
        await saveSmtpToken(account.id, smtp);
        setLocal(smtp);
        refresh();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setMode('idle');
      }
    })();
  };

  const deleteToken = (tokenId: string) => {
    setMode('busy');
    void (async () => {
      try {
        await new CloudflareClient().deleteEmailToken(tokenId);
        if (account && local?.id === tokenId) await removeSmtpToken(account.id);
        setNotice(`Token ${tokenId} deleted.`);
        setPendingDeleteId(null);
        refresh();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setMode('idle');
      }
    })();
  };

  if (error) return <Box flexDirection="column"><Alert variant="error" title="Could not load SMTP tokens">{error}</Alert><BackHint /></Box>;
  if (!account) return <Box flexDirection="column"><Alert variant="warning">Select a Cloudflare account first.</Alert><BackHint /></Box>;
  if (mode === 'busy') return <Spinner label="Talking to Cloudflare..." />;

  if (mode === 'confirm-delete' && pendingDeleteId) {
    return (
      <Box flexDirection="column">
        <Alert variant="warning">{`Delete SMTP token ${pendingDeleteId}? Anything still using it as an SMTP password will stop working.`}</Alert>
        <Box marginTop={1}>
          <Select
            options={[{ label: 'Yes, delete it', value: 'yes' }, { label: 'Cancel', value: 'no' }]}
            onChange={(value) => { if (value === 'yes') deleteToken(pendingDeleteId); else { setMode('idle'); setPendingDeleteId(null); } }}
          />
        </Box>
      </Box>
    );
  }

  const actionOptions = [
    { label: local ? 'Mint a new token (replaces the saved one)' : 'Create SMTP token', value: 'create' },
    ...(tokens ?? []).map((token) => ({ label: `Delete ${token.name} (${token.status})`, value: `delete:${token.id}` })),
  ];

  return (
    <Box flexDirection="column">
      <Text dimColor>One SMTP token covers every route on this account — Cloudflare's Email Sending permission can't be scoped to a single address.</Text>
      <Box marginTop={1}>
        <Select
          options={actionOptions}
          onChange={(value) => {
            if (value === 'create') { createToken(); return; }
            const tokenId = value.startsWith('delete:') ? value.slice('delete:'.length) : null;
            if (tokenId) { setPendingDeleteId(tokenId); setMode('confirm-delete'); }
          }}
        />
      </Box>
      {local && (
        <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
          <Text bold color="cyan">Saved outbound SMTP credential</Text>
          {formatSmtpLines(local).map((line) => <Text key={line}>{line}</Text>)}
        </Box>
      )}
      {!local && <Box marginTop={1}><Text dimColor>No SMTP token saved for this account yet.</Text></Box>}
      {tokens && tokens.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Mailflare tokens on this Cloudflare account</Text>
          {tokens.map((token) => (
            <Box key={token.id}>
              <Badge color={token.status === 'active' ? 'green' : 'gray'}>{token.status.toUpperCase()}</Badge>
              <Text>{`  ${token.name}  (username: ${token.id})`}</Text>
            </Box>
          ))}
        </Box>
      )}
      {notice && <Box marginTop={1}><StatusMessage variant="success">{notice}</StatusMessage></Box>}
      <Box marginTop={1}><BackHint /></Box>
    </Box>
  );
}

export function App() {
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();
  const [screen, setScreen] = useState<Screen>('menu');
  const [account, setAccount] = useState<WranglerAccount | undefined>(undefined);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const loggedIn = Boolean(getWranglerAuthToken());

  useEffect(() => { loadConfig().then((config) => setAccount(config.activeAccount)); }, []);

  useEffect(() => {
    if (!account) { setSmtpConfigured(false); return; }
    getSmtpToken(account.id).then((token) => setSmtpConfigured(Boolean(token)));
  }, [account, screen]);

  const handleMenuSelect = (value: Screen | 'quit') => {
    if (value === 'quit') { exit(); return; }
    setScreen(value);
  };

  const backToMenu = () => setScreen('menu');

  useInput((input) => {
    if (screen !== 'menu') return;
    const match = MENU_OPTIONS.find((option) => option.key === input.toLowerCase());
    if (match) handleMenuSelect(match.value);
  });

  return (
    <Box flexDirection="column" width={columns} height={Math.max(rows - 1, 20)} borderStyle="round" borderColor="cyan">
      <Box paddingX={1} borderStyle="single" borderColor="gray" borderTop={false} borderLeft={false} borderRight={false}>
        <Text bold color="cyan">mailflare <Text dimColor color="white">— Cloudflare Email Routing</Text></Text>
      </Box>
      <Box paddingX={1} borderStyle="single" borderColor="gray" borderTop={false} borderLeft={false} borderRight={false}>
        <Text>
          <Text dimColor>Account </Text>
          <Text color={account ? 'cyan' : 'yellow'} bold={Boolean(account)}>{account ? account.name : 'none selected'}</Text>
          <Text dimColor>   Wrangler </Text>
          <Text color={loggedIn ? 'green' : 'yellow'}>{loggedIn ? '● logged in' : '○ logged out'}</Text>
          <Text dimColor>   SMTP </Text>
          <Text color={smtpConfigured ? 'green' : 'gray'}>{smtpConfigured ? '● configured' : '○ not set'}</Text>
        </Text>
      </Box>
      <Box flexGrow={1} flexDirection="row">
        <Sidebar screen={screen} onSelect={handleMenuSelect} />
        <Box flexDirection="column" flexGrow={1} paddingX={2} paddingY={1}>
          <Text bold>{SCREEN_TITLES[screen]}</Text>
          <Box marginTop={1} flexDirection="column">
            {screen === 'menu' && <Text dimColor>Select an option from the sidebar to get started.</Text>}
            {screen === 'login' && <LoginScreen onBack={backToMenu} />}
            {screen === 'accounts' && <AccountsScreen onSelected={setAccount} onBack={backToMenu} />}
            {screen === 'create' && <CreateRouteScreen account={account} onBack={backToMenu} />}
            {screen === 'routes' && <RoutesScreen account={account} onBack={backToMenu} />}
            {screen === 'smtp' && <SmtpScreen account={account} onBack={backToMenu} />}
          </Box>
        </Box>
      </Box>
      <Box paddingX={1} justifyContent="space-between" borderStyle="single" borderColor="gray" borderBottom={false} borderLeft={false} borderRight={false}>
        <Text dimColor>{screen === 'menu' ? '↑/↓ navigate   Enter select' : 'Esc back'}</Text>
        <Text dimColor>Ctrl+C quit</Text>
      </Box>
    </Box>
  );
}
