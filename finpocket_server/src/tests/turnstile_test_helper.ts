export const testTurnstileToken = 'test-turnstile-token';

export function installTurnstileTestMock(): void {
  process.env.TURNSTILE_SECRET_KEY = 'test-turnstile-secret';
  const fetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    if (String(input) === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
      const body = init?.body instanceof URLSearchParams
        ? init.body.toString()
        : typeof init?.body === 'string' ? init.body : '';
      const parameters = new URLSearchParams(body);
      const verified = parameters.get('secret') === process.env.TURNSTILE_SECRET_KEY
        && parameters.get('response') === testTurnstileToken;
      return new Response(JSON.stringify({ success: verified, action: 'signup' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return fetch(input, init);
  };
}
