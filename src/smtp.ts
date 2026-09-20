import type { ApiToken } from './cloudflare.js';
import type { EmailToken } from './types.js';

// Cloudflare Email Service SMTP relay — host/port/username are fixed by Cloudflare;
// only the API token (password) is minted per route.
// https://developers.cloudflare.com/email-service/examples/email-sending/smtp/
const SMTP_HOST = 'smtp.mx.cloudflare.net';
const SMTP_PORT = 465; // implicit TLS — STARTTLS is not supported
const SMTP_USERNAME = 'api_token';

export function toEmailToken(token: ApiToken): EmailToken {
  return {
    id: token.id,
    value: token.value,
    host: SMTP_HOST,
    port: SMTP_PORT,
    username: SMTP_USERNAME,
    createdAt: new Date().toISOString(),
  };
}

export function formatSmtpLines(smtp: EmailToken): string[] {
  return [
    `Host:     ${smtp.host}`,
    `Port:     ${smtp.port} (implicit TLS)`,
    `Username: ${smtp.username}`,
    `Password: ${smtp.value ?? '(hidden — Cloudflare only reveals a token value once, at creation)'}`,
    'Note:     the domain must also be onboarded for Email Sending in the Cloudflare dashboard (Compute > Email Service > Email Sending) — there is no API for that step.',
  ];
}
