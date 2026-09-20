import { getWranglerAuthToken } from './wrangler.js';

type ApiResponse<T> = { success: boolean; result: T; errors?: Array<{ code: number; message: string }> };

export type Zone = { id: string; name: string; account: { id: string } };
export type RoutingRule = { id: string; name?: string; enabled: boolean; matchers: Array<{ type: string; field?: string; value?: string }>; actions: Array<{ type: string; value: string[] }> };
export type ApiToken = { id: string; name: string; status: string; value?: string };

// route create accepts either a bare domain (catch-all) or a full email address (that address only).
export function zoneDomainOf(address: string): string {
  return address.includes('@') ? address.split('@')[1]! : address;
}

export class CloudflareClient {
  private readonly apiToken: string | undefined;
  private readonly oauthToken: string | undefined;

  constructor(apiToken = process.env.MAILFLARE_CF_API_TOKEN, oauthToken = getWranglerAuthToken()) {
    if (!apiToken && !oauthToken) throw new Error('Cloudflare authentication is required. Log in with Wrangler or export MAILFLARE_CF_API_TOKEN.');
    this.apiToken = apiToken;
    this.oauthToken = oauthToken;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    // /user/tokens can't be managed by a Wrangler OAuth session — always use the API token there.
    const token = path.startsWith('/user/tokens') ? this.apiToken : this.oauthToken ?? this.apiToken;
    if (!token) throw new Error('Cloudflare does not allow a Wrangler OAuth session to manage API tokens. Export MAILFLARE_CF_API_TOKEN.');
    const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers },
    });
    const body = (await response.json()) as ApiResponse<T>;
    if (!response.ok || !body.success) {
      const detail = body.errors?.map((error) => error.message).join(', ') || response.statusText;
      if (path.startsWith('/user/tokens') && body.errors?.some((error) => error.code === 9109)) {
        throw new Error(
          'Cloudflare does not allow a Wrangler OAuth session to manage API tokens. ' +
            'Create one at https://dash.cloudflare.com/profile/api-tokens with the "User > API Tokens > Edit" permission ' +
            'and export it as MAILFLARE_CF_API_TOKEN.',
        );
      }
      throw new Error(`Cloudflare API: ${detail}`);
    }
    return body.result;
  }

  async findZone(domain: string): Promise<Zone> {
    const zones = await this.request<Zone[]>(`/zones?name=${encodeURIComponent(domain)}&status=active`);
    const zone = zones[0];
    if (!zone) throw new Error(`No active Cloudflare zone found for ${domain}.`);
    return zone;
  }

  // ponytail: single page (50 zones); paginate with result_info.total_pages if an account ever exceeds that
  async listZones(accountId: string): Promise<Zone[]> {
    return this.request<Zone[]>(`/zones?account.id=${accountId}&per_page=50`);
  }

  async createRoute(zoneId: string, address: string, destination: string): Promise<RoutingRule> {
    const matchers = address.includes('@') ? [{ type: 'literal', field: 'to', value: address }] : [{ type: 'all' }];
    return this.request<RoutingRule>(`/zones/${zoneId}/email/routing/rules`, {
      method: 'POST',
      body: JSON.stringify({
        name: `mailflare-${crypto.randomUUID().slice(0, 8)}`,
        enabled: true,
        matchers,
        actions: [{ type: 'forward', value: [destination] }],
      }),
    });
  }

  async listRoutes(zoneId: string): Promise<RoutingRule[]> {
    return this.request<RoutingRule[]>(`/zones/${zoneId}/email/routing/rules`);
  }

  async updateRoute(zoneId: string, rule: RoutingRule, changes: { destination?: string; enabled?: boolean }): Promise<RoutingRule> {
    return this.request<RoutingRule>(`/zones/${zoneId}/email/routing/rules/${rule.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: rule.name,
        enabled: changes.enabled ?? rule.enabled,
        matchers: rule.matchers,
        actions: [{ type: 'forward', value: [changes.destination ?? rule.actions.flatMap((action) => action.value)[0]] }],
      }),
    });
  }

  async deleteRoute(zoneId: string, ruleId: string): Promise<void> {
    await this.request<unknown>(`/zones/${zoneId}/email/routing/rules/${ruleId}`, { method: 'DELETE' });
  }

  async findRuleById(accountId: string, ruleId: string): Promise<{ zone: Zone; rule: RoutingRule } | undefined> {
    const rows = await this.listAllRoutes(accountId);
    return rows.find((row) => row.rule.id === ruleId);
  }

  async listAllRoutes(accountId: string): Promise<Array<{ zone: Zone; rule: RoutingRule }>> {
    const zones = await this.listZones(accountId);
    const results: Array<{ zone: Zone; rule: RoutingRule }> = [];
    for (const zone of zones) {
      try {
        const rules = await this.listRoutes(zone.id);
        for (const rule of rules) results.push({ zone, rule });
      } catch {
        // Email Routing isn't enabled for this zone — nothing to list.
      }
    }
    return results;
  }

  // Mints the API token that doubles as the Email Sending SMTP password.
  // The "Email Routing Addresses" permission is account-wide (Cloudflare has no way to scope it to
  // one address), so one token per account covers every route — see src/smtp.ts.
  async createEmailToken(accountId: string): Promise<ApiToken> {
    const groups = await this.request<Array<{ id: string; name: string }>>('/user/tokens/permission_groups');
    const group = groups.find((item) => /email/i.test(item.name) && /send/i.test(item.name));
    if (!group) throw new Error('Could not find an "Email Sending" permission group on this Cloudflare account.');
    return this.request<ApiToken>('/user/tokens', {
      method: 'POST',
      body: JSON.stringify({
        name: `mailflare-${accountId.slice(0, 8)}-${Date.now()}`,
        policies: [{ effect: 'allow', resources: { [`com.cloudflare.api.account.${accountId}`]: '*' }, permission_groups: [{ id: group.id }] }],
      }),
    });
  }

  async listEmailTokens(): Promise<ApiToken[]> {
    const tokens = await this.request<ApiToken[]>('/user/tokens');
    return tokens.filter((token) => token.name.startsWith('mailflare-'));
  }

  async deleteEmailToken(tokenId: string): Promise<void> {
    await this.request<unknown>(`/user/tokens/${tokenId}`, { method: 'DELETE' });
  }
}
