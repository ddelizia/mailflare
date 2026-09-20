import { getWranglerAuthToken } from './wrangler.js';

type ApiResponse<T> = { success: boolean; result: T; errors?: Array<{ message: string }> };

export type Zone = { id: string; name: string; account: { id: string } };
export type RoutingRule = { id: string; name?: string; enabled: boolean; matchers: Array<{ type: string; value?: string }>; actions: Array<{ type: string; value: string[] }> };
export type ApiToken = { id: string; name: string; status: string; value?: string };

export class CloudflareClient {
  private readonly token: string;

  constructor(token = process.env.CLOUDFLARE_API_TOKEN ?? getWranglerAuthToken()) {
    if (!token) throw new Error('Cloudflare authentication is required. Log in with Wrangler or export CLOUDFLARE_API_TOKEN.');
    this.token = token;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', ...init?.headers },
    });
    const body = (await response.json()) as ApiResponse<T>;
    if (!response.ok || !body.success) {
      const detail = body.errors?.map((error) => error.message).join(', ') || response.statusText;
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

  async createRoute(zoneId: string, destination: string, ruleId: string = crypto.randomUUID()): Promise<RoutingRule> {
    return this.request<RoutingRule>(`/zones/${zoneId}/email/routing/rules/${ruleId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: `mailflare-${ruleId.slice(0, 8)}`,
        enabled: true,
        matchers: [{ type: 'all' }],
        actions: [{ type: 'forward', value: [destination] }],
      }),
    });
  }

  async listRoutes(zoneId: string): Promise<RoutingRule[]> {
    return this.request<RoutingRule[]>(`/zones/${zoneId}/email/routing/rules`);
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

  // Mints the API token that doubles as the Email Sending SMTP password
  // (host/port/username are fixed by Cloudflare — see src/smtp.ts).
  async createEmailToken(accountId: string, domain: string): Promise<ApiToken> {
    const groups = await this.request<Array<{ id: string; name: string }>>('/user/tokens/permission_groups');
    const group = groups.find((item) => /email/i.test(item.name) && /send/i.test(item.name));
    if (!group) throw new Error('Could not find an "Email Sending" permission group on this Cloudflare account.');
    return this.request<ApiToken>('/user/tokens', {
      method: 'POST',
      body: JSON.stringify({
        name: `mailflare-${domain}-${Date.now()}`,
        policies: [{ effect: 'allow', resources: { [`com.cloudflare.api.account.${accountId}`]: '*' }, permission_groups: [{ id: group.id }] }],
      }),
    });
  }

  async listEmailTokens(): Promise<ApiToken[]> {
    const tokens = await this.request<ApiToken[]>('/user/tokens');
    return tokens.filter((token) => token.name.startsWith('mailflare-'));
  }
}
