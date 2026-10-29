/** Explicit hosting configuration for fictional demonstrations, never production identity. */
export function hostedDemo() { return process.env.AGENTDESK_HOSTED_DEMO === 'true'; }
export function demoOrigin() {
  const raw = process.env.AGENTDESK_APP_ORIGIN || process.env.RENDER_EXTERNAL_URL;
  if (!raw) throw new Error('The hosted demo origin is not configured.');
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('The hosted demo requires an HTTPS origin.');
  return url.origin;
}
export function validateHostedDemo() {
  if (!hostedDemo()) return;
  demoOrigin();
  const code = process.env.AGENTDESK_DEMO_ACCESS_CODE ?? '';
  const validCode = /^[0-9]{4}$/.test(code) || (code.length >= 16 && code.length <= 256);
  if (process.env.AGENTDESK_DEMO !== 'true' || (process.env.AGENTDESK_SESSION_SECRET?.length ?? 0) < 32 || !validCode) throw new Error('Hosted demo access is not fully configured.');
}
