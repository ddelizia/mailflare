import { getWranglerAuthToken } from './wrangler.js';

type ApiResponse<T> = { success: boolean; result: T; errors?: Array<{ message: string }> };
type Zone = { id: string; name: string; account: { id: string } };
type RoutingRule = { id: string; name?: string; enabled: boolean; actions?: Array<{ type: string; value: string[] }> };

export class CloudflareClient {
  private readonly token: string;

  constructor(token = process.env.CLOUDFLARE_API_TOKEN ?? getWranglerAuthToken()) {
    if (!token) throw new Error('Cloudflare authentication is required. Press l to run Wrangler login or export CLOUDFLARE_API_TOKEN.');
    this.token = token;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', ...init?.headers },
    });
    const body = await response.json() as ApiResponse<T>;
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

  async createRoute(zoneId: string, destination: string, ruleId: string = crypto.randomUUID()): Promise<RoutingRule> {
    return this.request<RoutingRule>(`/zones/${zoneId}/email/routing/rules/${ruleId}`, {
      method: 'PUT',
      body: JSON.stringify({ name: `mailflare-${ruleId.slice(0, 8)}`, enabled: true, matchers: [{ type: 'all' }], actions: [{ type: 'forward', value: [destination] }] }),
    });
  }

  async listRoutes(zoneId: string): Promise<RoutingRule[]> {
    return this.request<RoutingRule[]>(`/zones/${zoneId}/email/routing/rules`);
  }

  async verifyRouting(zoneId: string): Promise<{ enabled: boolean }> {
    return this.request<{ enabled: boolean }>(`/zones/${zoneId}/email/routing`);
  }
}