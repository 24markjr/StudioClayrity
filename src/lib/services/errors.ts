/** Thrown when an integration is used before its credentials are configured. */
export class IntegrationNotConfiguredError extends Error {
  constructor(readonly integration: string) {
    super(`${integration} is not configured. Add its keys to the environment (see .env.example).`);
    this.name = "IntegrationNotConfiguredError";
  }
}

/** Non-2xx response from a provider API. The body is kept for logs, never shown to customers. */
export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(`${provider} request failed with HTTP ${status}`);
    this.name = "ProviderError";
  }
}

/** "ananya.rao@example.com" → "a***@example.com" — for logs only. */
export function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}
