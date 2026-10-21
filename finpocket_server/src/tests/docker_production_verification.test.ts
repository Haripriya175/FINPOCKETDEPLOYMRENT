import fs from 'fs';
import path from 'path';
import { loadAndValidateConfig } from '../config/app_config.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('FINPOCKET PHASE 8.1: DOCKER PRODUCTION VERIFICATION TEST SUITE');
  console.log('================================================================\n');

  const serverDir = path.resolve(__dirname, '../../');
  const dockerfilePath = path.join(serverDir, 'Dockerfile');
  const dockerignorePath = path.join(serverDir, '.dockerignore');
  const indexTsPath = path.join(serverDir, 'src/index.ts');

  // ---------------------------------------------------------------------------
  // 1. DOCKERFILE STRUCTURE & SECURITY AUDIT
  // ---------------------------------------------------------------------------
  console.log('[TEST GROUP 1] Dockerfile Multi-Stage & Security Audit');
  assert(fs.existsSync(dockerfilePath), 'Dockerfile exists in finpocket_server');
  const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf-8');

  assert(dockerfileContent.includes('AS builder'), 'Dockerfile defines multi-stage build with builder stage');
  assert(dockerfileContent.includes('AS runner'), 'Dockerfile defines minimal production runner stage');
  assert(dockerfileContent.includes('node:20-alpine'), 'Uses official Node Alpine LTS base image');
  assert(dockerfileContent.includes('dumb-init'), 'Installs dumb-init for PID 1 signal forwarding');
  assert(dockerfileContent.includes('addgroup -g 10001 -S finpocket'), 'Creates non-root system group with UID/GID 10001');
  assert(dockerfileContent.includes('adduser -u 10001 -S finpocket'), 'Creates non-root system user');
  assert(dockerfileContent.includes('USER finpocket'), 'Enforces non-root execution via USER finpocket directive');
  assert(dockerfileContent.includes('npm ci --omit=dev'), 'Installs only production dependencies in runner stage');
  assert(dockerfileContent.includes('HEALTHCHECK'), 'Declares container HEALTHCHECK directive');
  assert(dockerfileContent.includes('/health/live'), 'HEALTHCHECK targets /health/live endpoint');
  assert(dockerfileContent.includes('ENTRYPOINT ["dumb-init", "--"]'), 'Uses dumb-init as entrypoint for graceful signal trapping');
  assert(dockerfileContent.includes('CMD ["node", "dist/index.js"]'), 'CMD executes compiled JavaScript bundle');

  // ---------------------------------------------------------------------------
  // 2. .DOCKERIGNORE SENSITIVE ARTIFACT ISOLATION AUDIT
  // ---------------------------------------------------------------------------
  console.log('\n[TEST GROUP 2] .dockerignore Secret & File Isolation Audit');
  assert(fs.existsSync(dockerignorePath), '.dockerignore exists in finpocket_server');
  const dockerignoreContent = fs.readFileSync(dockerignorePath, 'utf-8');

  assert(dockerignoreContent.includes('.env'), '.dockerignore excludes .env and environment files');
  assert(dockerignoreContent.includes('node_modules'), '.dockerignore excludes host node_modules');
  assert(dockerignoreContent.includes('dist'), '.dockerignore excludes host dist directory');
  assert(dockerignoreContent.includes('data/*.sqlite*') || dockerignoreContent.includes('*.sqlite'), '.dockerignore excludes local SQLite databases');
  assert(dockerignoreContent.includes('src/tests'), '.dockerignore excludes test files from production image');
  assert(dockerignoreContent.includes('*.log'), '.dockerignore excludes log files');
  assert(dockerignoreContent.includes('.git'), '.dockerignore excludes Git directory');

  // ---------------------------------------------------------------------------
  // 3. GRACEFUL SHUTDOWN SIGNAL HANDLING
  // ---------------------------------------------------------------------------
  console.log('\n[TEST GROUP 3] Graceful Shutdown Signal Handling');
  const indexContent = fs.readFileSync(indexTsPath, 'utf-8');
  assert(indexContent.includes("process.on('SIGTERM'"), "index.ts listens for SIGTERM signal");
  assert(indexContent.includes("process.on('SIGINT'"), "index.ts listens for SIGINT signal");
  assert(indexContent.includes("server.close("), "index.ts closes HTTP server upon signal receipt");
  assert(indexContent.includes("handleShutdown"), "index.ts implements centralized handleShutdown logic");

  // ---------------------------------------------------------------------------
  // 4. PRODUCTION FAIL-CLOSED CONFIGURATION GUARDS
  // ---------------------------------------------------------------------------
  console.log('\n[TEST GROUP 4] Production Fail-Closed Configuration Guards');

  // 4.1 Weak JWT Secret Rejection
  let caughtWeakJwt = false;
  try {
    loadAndValidateConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'too-short',
      CORS_ORIGIN: 'https://app.finpocket.com'
    });
  } catch (err: any) {
    caughtWeakJwt = err.message.includes('JWT_SECRET must be securely set');
  }
  assert(caughtWeakJwt, 'Production startup fails closed on weak or default JWT_SECRET');

  // 4.2 Demo Mode Rejection in Production
  let caughtDemoMode = false;
  try {
    loadAndValidateConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'production-super-strong-jwt-secret-min-32chars-ok!',
      FINPOCKET_DEMO_MODE: 'true',
      CORS_ORIGIN: 'https://app.finpocket.com'
    });
  } catch (err: any) {
    caughtDemoMode = err.message.includes('cannot be enabled in PRODUCTION');
  }
  assert(caughtDemoMode, 'Production startup fails closed if FINPOCKET_DEMO_MODE=true');

  // 4.3 Mock Provider Rejection in Production
  let caughtMockProvider = false;
  try {
    loadAndValidateConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'production-super-strong-jwt-secret-min-32chars-ok!',
      USE_MOCK_FINANCIAL_PROVIDER: 'true',
      CORS_ORIGIN: 'https://app.finpocket.com'
    });
  } catch (err: any) {
    caughtMockProvider = err.message.includes('Mock financial providers cannot be enabled in PRODUCTION');
  }
  assert(caughtMockProvider, 'Production startup fails closed if USE_MOCK_FINANCIAL_PROVIDER=true');

  // 4.4 Wildcard CORS Rejection in Production
  let caughtWildcardCors = false;
  try {
    loadAndValidateConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'production-super-strong-jwt-secret-min-32chars-ok!',
      CORS_ORIGIN: '*'
    });
  } catch (err: any) {
    caughtWildcardCors = err.message.includes('CORS_ORIGIN cannot be wildcard');
  }
  assert(caughtWildcardCors, 'Production startup fails closed if CORS_ORIGIN is wildcard (*)');

  // 4.5 Sandbox AA Provider Rejection in Production
  let caughtSandboxAA = false;
  try {
    loadAndValidateConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'production-super-strong-jwt-secret-min-32chars-ok!',
      CORS_ORIGIN: 'https://app.finpocket.com',
      AA_PROVIDER_ENABLED: 'true',
      AA_CLIENT_ID: 'prod_client_id_123',
      AA_CLIENT_SECRET: 'prod_client_secret_456',
      AA_API_BASE_URL: 'https://aa.setu.co',
      AA_PROVIDER_NAME: 'SETU_AA_SANDBOX'
    });
  } catch (err: any) {
    caughtSandboxAA = err.message.includes('Sandbox/Mock/Fake AA provider cannot be configured for PRODUCTION');
  }
  assert(caughtSandboxAA, 'Production startup fails closed if AA_PROVIDER_NAME is set to Sandbox in PRODUCTION');

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`PHASE 8.1 DOCKER VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
