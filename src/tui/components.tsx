import { Box, Text } from 'ink';
import React from 'react';
import { Divider } from '../../components/ui/divider/index.js';
import { Header as InkHeader } from '../../components/ui/header/index.js';
import { KeyHint } from '../../components/ui/key-hint/index.js';
import { Panel as InkPanel } from '../../components/ui/panel/index.js';
import { StatusIndicator } from '../../components/ui/status-indicator/index.js';
import { TextInput } from '../../components/ui/text-input/index.js';
import type { Setup, WranglerAccount } from '../types.js';

export type Screen = 'home' | 'accounts' | 'setup' | 'setups';

export const navItems: Array<{ screen: Screen; label: string; shortcut: string }> = [
  { screen: 'home', label: 'Overview', shortcut: 'h' },
  { screen: 'accounts', label: 'Accounts', shortcut: 'a' },
  { screen: 'setup', label: 'New route', shortcut: 's' },
  { screen: 'setups', label: 'Saved routes', shortcut: 'e' },
];

export function Header({ screen, account }: { screen: Screen; account?: WranglerAccount }) {
  const title = navItems.find((item) => item.screen === screen)?.label ?? 'Overview';

  return (
    <Box flexDirection="column" marginBottom={1}>
      <InkHeader title="MAILFLARE" version="0.1.0" style="line" subtitle="EMAIL ROUTING CONSOLE" />
      <Text color="yellow" bold>{`> ${title}`} <Text dimColor>{account ? `  ${account.name}` : '  No Cloudflare account selected'}</Text></Text>
    </Box>
  );
}

export function Sidebar({ screen, selectedScreen, account, isFocused }: { screen: Screen; selectedScreen: Screen; account?: WranglerAccount; isFocused: boolean }) {
  return (
    <Box width={30} flexDirection="column" borderStyle="round" borderColor={isFocused ? 'cyan' : 'gray'} paddingX={1} paddingY={1}>
      <Box justifyContent="space-between" marginBottom={1}>
        <Text color={isFocused ? 'cyan' : 'white'} bold> NAVIGATION</Text>
        <Text dimColor>{isFocused ? '[FOCUSED]' : '[Tab]'}</Text>
      </Box>
      <Text color="gray" bold>EMAIL ROUTING</Text>
      <Box marginBottom={1}><Text color="gray">----------------------</Text></Box>
      {navItems.map((item) => (
        <Box key={item.screen} paddingX={1} justifyContent="space-between">
          <Text color={item.screen === selectedScreen ? 'cyan' : item.screen === screen ? 'green' : 'white'} bold={item.screen === selectedScreen || item.screen === screen} underline={item.screen === selectedScreen && isFocused}>
            {`${item.screen === selectedScreen ? '>' : item.screen === screen ? '●' : ' '} `}
            <Text color="gray">[{item.shortcut}] </Text>
            {item.label}
          </Text>
          {item.screen === screen ? <Text color="green" dimColor>active</Text> : null}
        </Box>
      ))}
      <Box flexGrow={1} />
      <Text dimColor>ACTIVE ACCOUNT</Text>
      <Text color={account ? 'green' : 'yellow'} bold>{account?.name ?? 'Not connected'}</Text>
      <Text dimColor>{account?.id ?? 'Press l to login'}</Text>
      <Box marginTop={1}><Text dimColor>l login  v refresh</Text></Box>
      <Text dimColor>q quit  Tab focus</Text>
    </Box>
  );
}

export function Panel({ children, title, isFocused = false }: { children?: React.ReactNode; title?: string; isFocused?: boolean }) {
  return (
    <InkPanel title={title} borderStyle="rounded" borderColor={isFocused ? 'cyan' : 'gray'} padding={2}>
      {children}
    </InkPanel>
  );
}

export function Footer({ focusedPane }: { focusedPane: 'sidebar' | 'content' }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Divider />
      <Box justifyContent="space-between">
        <KeyHint keys={focusedPane === 'sidebar'
          ? [{ key: '↑↓', label: 'Navigate' }, { key: 'Enter', label: 'Open' }, { key: 'Tab', label: 'Focus' }, { key: 'q', label: 'Quit' }]
          : [{ key: 'Esc', label: 'Sidebar' }, { key: 'Tab', label: 'Switch' }, { key: 'Enter', label: 'Confirm' }, { key: 'j/k', label: 'Browse' }]} />
        <Text dimColor>pane: <Text color={focusedPane === 'sidebar' ? 'cyan' : 'green'} bold>{focusedPane}</Text></Text>
      </Box>
    </Box>
  );
}

function Stat({ label, value, detail, color = 'white' }: { label: string; value: string; detail: string; color?: string }) {
  return (
    <Box flexDirection="column" width={22} borderStyle="single" borderColor="gray" paddingX={1} marginRight={1}>
      <Text dimColor>{label}</Text>
      <Text color={color} bold>{value}</Text>
      <Text dimColor>{detail}</Text>
    </Box>
  );
}

export function Home({ config, status }: { config: { setups: Setup[]; activeAccount?: WranglerAccount }; status: string }) {
  const latestSetup = config.setups[config.setups.length - 1];
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}><Text color="cyan" bold>Overview</Text><Text dimColor>  Your routing workspace at a glance</Text></Box>
      <Box flexDirection="row" marginBottom={1}>
        <Stat label="ACCOUNT" value={config.activeAccount?.name ?? 'Not connected'} detail={config.activeAccount?.id ?? 'Select an account with a'} color={config.activeAccount ? 'green' : 'yellow'} />
        <Stat label="ROUTES" value={String(config.setups.length)} detail={config.setups.length === 1 ? 'saved route' : 'saved routes'} color="cyan" />
        <Stat label="STATUS" value={config.activeAccount ? 'READY' : 'SETUP NEEDED'} detail={config.activeAccount ? 'Cloudflare connected' : 'Login with l'} color={config.activeAccount ? 'green' : 'yellow'} />
      </Box>
      <Panel title="LATEST ROUTE">
        {latestSetup ? (
          <Box flexDirection="column">
            <Box><Text color="green">● </Text><Text bold>{latestSetup.domain}</Text><Text dimColor>  active forwarding route</Text></Box>
            <Text dimColor>{`Forwarding to ${latestSetup.destination}`}</Text>
            <Text dimColor>{`Created ${new Date(latestSetup.createdAt).toLocaleDateString()}`}</Text>
          </Box>
        ) : <Text dimColor>No routes yet. Press s to configure your first route.</Text>}
      </Panel>
      <Box borderStyle="single" borderColor={status.startsWith('Error') ? 'red' : 'gray'} paddingX={1}>
        <StatusIndicator status={status === 'Checking Wrangler login...' ? 'loading' : status.startsWith('Error') ? 'error' : 'online'} label={status} pulse={false} />
      </Box>
      <Box marginTop={1}><Text dimColor>Quick actions: </Text><Text color="cyan">s</Text><Text dimColor> new route  </Text><Text color="cyan">a</Text><Text dimColor> account  </Text><Text color="cyan">v</Text><Text dimColor> refresh</Text></Box>
    </Box>
  );
}

export function AccountPicker({ accounts, cursor }: { accounts: WranglerAccount[]; cursor: number }) {
  return (
    <Box flexDirection="column">
      <Text dimColor>Choose where mailflare should create and manage routes.</Text>
      <Box marginTop={1} flexDirection="column">
        {accounts.length ? accounts.map((account, index) => (
          <Box key={account.id} paddingX={1} borderStyle={index === cursor ? 'single' : undefined} borderColor={index === cursor ? 'cyan' : undefined}>
            <Text color={index === cursor ? 'cyan' : undefined} bold={index === cursor}>{`${index === cursor ? '> ' : '  '}${account.name}`}</Text>
            <Text dimColor>{`  ${account.id}`}</Text>
          </Box>
        )) : <Text color="yellow">No accounts found. Press l to login with Wrangler.</Text>}
      </Box>
      <Box marginTop={1}><Text dimColor>j/k select  enter confirm  up/down sections  esc back</Text></Box>
    </Box>
  );
}

export function Form({ form, isFocused, onDomainChange, onDestinationChange, onSubmitDomain, onSubmitDestination }: { form: { domain: string; destination: string; field: string }; isFocused: boolean; onDomainChange: (value: string) => void; onDestinationChange: (value: string) => void; onSubmitDomain: () => void; onSubmitDestination: () => void }) {
  return (
    <Box flexDirection="column">
      <Text dimColor>Forward every message for a domain to a destination inbox.</Text>
      <Box marginTop={1} flexDirection="column">
        <TextInput label="Domain" value={form.domain} placeholder="example.com" focus={isFocused && form.field === 'domain'} onChange={onDomainChange} onSubmit={onSubmitDomain} />
        <TextInput label="Destination" value={form.destination} placeholder="you@gmail.com" focus={isFocused && form.field === 'destination'} onChange={onDestinationChange} onSubmit={onSubmitDestination} />
      </Box>
      <Box marginTop={1}><KeyHint keys={[{ key: 'Enter', label: 'Next field' }, { key: 'Backspace', label: 'Edit' }, { key: 'Esc', label: 'Cancel' }]} /></Box>
    </Box>
  );
}

export function SetupList({ setups, cursor }: { setups: Setup[]; cursor: number }) {
  return (
    <Box flexDirection="column">
      <Text dimColor>{setups.length ? 'Your configured forwarding routes.' : 'No routes saved yet.'}</Text>
      <Box marginTop={1} flexDirection="column">
        {setups.map((setup, index) => (
          <Box key={setup.domain} borderStyle={index === cursor ? 'single' : undefined} borderColor={index === cursor ? 'cyan' : undefined} paddingX={1} flexDirection="column">
            <Box><Text color={index === cursor ? 'cyan' : 'green'}>{index === cursor ? '> ' : '  '}</Text><Text bold>{setup.domain}</Text></Box>
            <Text dimColor>{`    -> ${setup.destination}  |  zone ${setup.zoneId}`}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}><Text dimColor>j/k browse  up/down sections  esc back</Text></Box>
    </Box>
  );
}
