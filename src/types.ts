export type Setup = {
  domain: string;
  destination: string;
  zoneId: string;
  accountId: string;
  ruleId?: string;
  smtp?: {
    host: string;
    port: number;
    username: string;
    apiKey: string;
  };
  createdAt: string;
};

export type MailflareConfig = {
  setups: Setup[];
  activeAccount?: WranglerAccount;
};

export type WranglerAccount = {
  id: string;
  name: string;
};

export type CliOptions = {
  accountId?: string;
  zoneId?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUsername?: string;
};