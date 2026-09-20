export type WranglerAccount = {
  id: string;
  name: string;
};

export type EmailToken = {
  id: string;
  value?: string; // only ever populated right after creation; Cloudflare never returns it again
  host: string;
  port: number;
  username: string;
  createdAt: string;
};

export type Route = {
  domain: string;
  destination: string;
  accountId: string;
  zoneId: string;
  ruleId: string;
  createdAt: string;
  smtp?: EmailToken;
};

export type MailflareConfig = {
  routes: Route[];
  activeAccount?: WranglerAccount;
};
