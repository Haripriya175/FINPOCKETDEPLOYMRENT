import dotenv from 'dotenv';
dotenv.config();

export type AppEnvironment = 'DEVELOPMENT' | 'TEST' | 'DEMO' | 'STAGING' | 'PRODUCTION';

export interface SetuAAConfig {
  environment: 'SANDBOX' | 'PRODUCTION';
  clientId: string;
  clientSecret: string;
  productInstanceId: string;
  apiBaseUrl: string;
  authBaseUrl: string;
  redirectBaseUrl: string;
  callbackBaseUrl: string;
  webhookSecret: string;
  testVua?: string;
  testPhoneNumber?: string;
}

export interface AAProviderConfig {
  enabled: boolean;
  providerName: string;
  apiBaseUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  callbackUrl: string;
  webhookSecret: string;
  setu: SetuAAConfig;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  appPassword?: string;
  from: string;
  isConfigured: boolean;
}

export interface SmsConfig {
  provider: 'fast2sms' | 'msg91' | 'twilio' | 'mock';
  isConfigured: boolean;
  fast2sms: {
    apiKey?: string;
    route: string;
  };
  msg91: {
    authKey?: string;
    templateId?: string;
  };
  twilio: {
    accountSid?: string;
    authToken?: string;
    fromNumber?: string;
  };
}

export interface AppConfig {
  environment: AppEnvironment;
  port: number;
  jwtSecret: string;
  jwtExpiresIn: string;
  refreshTokenExpiresIn: string;
  corsOrigin: string;
  isDemoMode: boolean;
  allowMockProvider: boolean;
  demoAutoLoginAllowed: boolean;
  /** Mock SSO tokens (mock_gtoken:…) are accepted ONLY when this is true. */
  allowMockSso: boolean;
  sslRequired: boolean;
  logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  smtp: SmtpConfig;
  sms: SmsConfig;
  aaProvider: AAProviderConfig;
  paymentLimits: {
    perTransaction: number;
    daily: number;
    monthly: number;
  };
  rateLimits: {
    generalWindowMs: number;
    generalMax: number;
    authWindowMs: number;
    authMax: number;
    paymentsWindowMs: number;
    paymentsMax: number;
    aiWindowMs: number;
    aiMax: number;
  };
}

export function loadAndValidateConfig(envOverride?: Record<string, string>): AppConfig {
  const envSource = envOverride || process.env;
  const envRaw = (envSource.NODE_ENV || 'DEMO').toUpperCase();
  const environment: AppEnvironment = 
    envRaw === 'PRODUCTION' ? 'PRODUCTION' :
    envRaw === 'STAGING' ? 'STAGING' :
    envRaw === 'TEST' ? 'TEST' :
    envRaw === 'DEVELOPMENT' ? 'DEVELOPMENT' : 'DEMO';

  const jwtSecret = envSource.JWT_SECRET || (environment === 'TEST' || environment === 'DEMO' || environment === 'DEVELOPMENT' ? 'finpocket-local-demo-secret-key-32chars-min!!' : '');
  const port = Number(envSource.PORT) || 3001;
  const isDemoExplicitlySet = envSource.FINPOCKET_DEMO_MODE === 'true';
  const isDemoMode = environment === 'DEMO' || isDemoExplicitlySet;
  const allowMockProvider = isDemoMode || environment === 'TEST' || environment === 'DEVELOPMENT';
  const demoAutoLoginAllowed = (isDemoMode || environment === 'DEVELOPMENT') && environment !== 'PRODUCTION';

  const aaEnabled = envSource.AA_PROVIDER_ENABLED === 'true' || envSource.SETU_AA_ENABLED === 'true';
  const aaProviderName = envSource.AA_PROVIDER_NAME || (environment === 'TEST' ? 'FAKE_TEST_PROVIDER' : environment === 'DEMO' ? 'MOCK' : 'SETU_AA_SANDBOX');

  // Mock SSO acceptance (mock_gtoken: / mock_appletoken: / mock_metatoken:).
  // Default: on for TEST/DEVELOPMENT (the SSO suite relies on it), OFF for
  // DEMO/STAGING/PRODUCTION — a server accidentally left in the default DEMO
  // environment must not accept forged identities as verified users.
  const allowMockSso =
    environment === 'PRODUCTION' || environment === 'STAGING'
      ? false
      : envSource.ALLOW_MOCK_SSO === 'true'
        ? true
        : envSource.ALLOW_MOCK_SSO === 'false'
          ? false
          : environment === 'TEST' || environment === 'DEVELOPMENT';
  
  // Setu-specific typed configuration with fallback to generic AA variables
  const setuEnvironment = (envSource.SETU_ENVIRONMENT || (environment === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX')).toUpperCase() as 'SANDBOX' | 'PRODUCTION';
  const setuClientId = envSource.SETU_CLIENT_ID || envSource.AA_CLIENT_ID || '';
  const setuClientSecret = envSource.SETU_CLIENT_SECRET || envSource.AA_CLIENT_SECRET || '';
  const setuProductInstanceId = envSource.SETU_PRODUCT_INSTANCE_ID || '';
  const setuApiBaseUrl = envSource.SETU_API_BASE_URL || envSource.AA_API_BASE_URL || (setuEnvironment === 'PRODUCTION' ? 'https://aa.setu.co' : 'https://aa-sandbox.setu.co');
  // Setu OAuth token endpoint host — configured per environment, never baked in.
  const setuAuthBaseUrl = envSource.SETU_AUTH_BASE_URL || (setuEnvironment === 'PRODUCTION' ? 'https://api.setu.co' : 'https://uat.setu.co');
  const setuRedirectBaseUrl = envSource.SETU_REDIRECT_BASE_URL || envSource.AA_REDIRECT_URI || '';
  const setuCallbackBaseUrl = envSource.SETU_CALLBACK_BASE_URL || envSource.AA_CALLBACK_URL || '';
  // No committed default: an empty secret means webhook signatures cannot be
  // verified; PRODUCTION additionally refuses to boot without one (guard below),
  // and sandbox operation relies on the provider's compensating controls.
  const setuWebhookSecret = envSource.SETU_WEBHOOK_SECRET || envSource.AA_WEBHOOK_SECRET || '';

  const aaApiBaseUrl = envSource.AA_API_BASE_URL || setuApiBaseUrl;
  const aaClientId = envSource.AA_CLIENT_ID || setuClientId;
  const aaClientSecret = envSource.AA_CLIENT_SECRET || setuClientSecret;
  const aaRedirectUri = envSource.AA_REDIRECT_URI || setuRedirectBaseUrl;
  const aaCallbackUrl = envSource.AA_CALLBACK_URL || setuCallbackBaseUrl;
  const aaWebhookSecret = envSource.AA_WEBHOOK_SECRET || setuWebhookSecret;

  // PRODUCTION FAIL-CLOSED GUARDS
  // (STAGING is intentionally permissive for sandbox AA testing — pinned by
  // phase6 test 1. The mock-SSO risk in STAGING is handled by `allowMockSso`
  // defaulting to false outside TEST/DEVELOPMENT.)
  if (environment === 'PRODUCTION') {
    if (!jwtSecret || jwtSecret.length < 32 || jwtSecret.includes('local-demo-secret')) {
      throw new Error('[FATAL] Production startup aborted: JWT_SECRET must be securely set and at least 32 characters long.');
    }
    if (isDemoExplicitlySet || isDemoMode) {
      throw new Error('[FATAL] Production startup aborted: FINPOCKET_DEMO_MODE cannot be enabled in PRODUCTION.');
    }
    if (envSource.FINPOCKET_ALLOW_MOCK_PROVIDER === 'true' || envSource.USE_MOCK_FINANCIAL_PROVIDER === 'true') {
      throw new Error('[FATAL] Production startup aborted: Mock financial providers cannot be enabled in PRODUCTION.');
    }
    if (envSource.ALLOW_MOCK_SSO === 'true') {
      throw new Error('[FATAL] Production startup aborted: ALLOW_MOCK_SSO cannot be enabled in PRODUCTION.');
    }
    if (envSource.FINPOCKET_DEMO_AUTO_LOGIN === 'true') {
      throw new Error('[FATAL] Production startup aborted: Demo auto-login cannot be enabled in PRODUCTION.');
    }
    if (envSource.CORS_ORIGIN === '*' || !envSource.CORS_ORIGIN) {
      throw new Error('[FATAL] Production startup aborted: CORS_ORIGIN cannot be wildcard (*) in PRODUCTION.');
    }
    if (envSource.DATABASE_URL && envSource.DATABASE_URL.startsWith('http://')) {
      throw new Error('[FATAL] Production startup aborted: Insecure database transport URL.');
    }
    if (aaEnabled) {
      if (!aaClientId || !aaClientSecret || aaClientSecret.includes('sandbox') || aaClientId.includes('sandbox')) {
        throw new Error('[FATAL] Production startup aborted: AA_CLIENT_ID and AA_CLIENT_SECRET must be valid production credentials.');
      }
      if (!aaApiBaseUrl || aaApiBaseUrl.includes('sandbox') || aaApiBaseUrl.includes('localhost') || !aaApiBaseUrl.startsWith('https://')) {
        throw new Error('[FATAL] Production startup aborted: AA_API_BASE_URL must be a secure production HTTPS endpoint.');
      }
      if (aaProviderName.toUpperCase().includes('SANDBOX') || aaProviderName.toUpperCase().includes('MOCK') || aaProviderName.toUpperCase().includes('FAKE')) {
        throw new Error('[FATAL] Production startup aborted: Sandbox/Mock/Fake AA provider cannot be configured for PRODUCTION.');
      }
      // Webhook signature verification must not silently fall back to the
      // committed default secret — that forgery key would be public.
      if (!envSource.SETU_WEBHOOK_SECRET && !envSource.AA_WEBHOOK_SECRET) {
        throw new Error('[FATAL] Production startup aborted: SETU_WEBHOOK_SECRET must be explicitly set when the AA provider is enabled.');
      }
    }
  }

  const smtpHost = envSource.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = Number(envSource.SMTP_PORT) || 587;
  const smtpSecure = envSource.SMTP_SECURE === 'true' || smtpPort === 465;
  const smtpUser = envSource.SMTP_USER || '';
  const smtpAppPassword = envSource.SMTP_APP_PASSWORD || envSource.SMTP_PASS || '';
  const smtpFrom = envSource.SMTP_FROM || envSource.EMAIL_FROM || '"FinPocket Security" <no-reply@finpocket.com>';
  const isSmtpConfigured = Boolean(smtpUser && smtpAppPassword);

  const rawSmsProvider = (envSource.SMS_PROVIDER || '').toLowerCase();
  const fast2smsApiKey = envSource.FAST2SMS_API_KEY || '';
  const fast2smsRoute = envSource.FAST2SMS_ROUTE || 'otp';
  const msg91AuthKey = envSource.MSG91_AUTH_KEY || '';
  const msg91TemplateId = envSource.MSG91_TEMPLATE_ID || '';
  const twilioAccountSid = envSource.TWILIO_ACCOUNT_SID || '';
  const twilioAuthToken = envSource.TWILIO_AUTH_TOKEN || '';
  const twilioPhoneNumber = envSource.TWILIO_PHONE_NUMBER || '';

  const smsProvider: 'fast2sms' | 'msg91' | 'twilio' | 'mock' =
    rawSmsProvider === 'fast2sms' ? 'fast2sms' :
    rawSmsProvider === 'msg91' ? 'msg91' :
    rawSmsProvider === 'twilio' ? 'twilio' :
    fast2smsApiKey ? 'fast2sms' :
    (msg91AuthKey && msg91TemplateId) ? 'msg91' :
    (twilioAccountSid && twilioAuthToken) ? 'twilio' : 'mock';

  const isSmsConfigured = Boolean(
    (smsProvider === 'fast2sms' && fast2smsApiKey) ||
    (smsProvider === 'msg91' && msg91AuthKey && msg91TemplateId) ||
    (smsProvider === 'twilio' && twilioAccountSid && twilioAuthToken)
  );

  return {
    environment,
    port,
    jwtSecret,
    jwtExpiresIn: envSource.ACCESS_TOKEN_EXPIRY || '15m',
    refreshTokenExpiresIn: envSource.REFRESH_TOKEN_EXPIRY || '7d',
    corsOrigin: envSource.CORS_ORIGIN || (environment === 'PRODUCTION' ? '' : '*'),
    isDemoMode,
    allowMockProvider,
    demoAutoLoginAllowed,
    allowMockSso,
    sslRequired: environment === 'PRODUCTION',
    logLevel: (envSource.LOG_LEVEL as any) || 'INFO',
    smtp: {
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      user: smtpUser,
      appPassword: smtpAppPassword,
      from: smtpFrom,
      isConfigured: isSmtpConfigured,
    },
    sms: {
      provider: smsProvider,
      isConfigured: isSmsConfigured,
      fast2sms: {
        apiKey: fast2smsApiKey || undefined,
        route: fast2smsRoute,
      },
      msg91: {
        authKey: msg91AuthKey || undefined,
        templateId: msg91TemplateId || undefined,
      },
      twilio: {
        accountSid: twilioAccountSid || undefined,
        authToken: twilioAuthToken || undefined,
        fromNumber: twilioPhoneNumber || undefined,
      },
    },
    aaProvider: {
      enabled: aaEnabled,
      providerName: aaProviderName,
      apiBaseUrl: aaApiBaseUrl,
      clientId: aaClientId,
      clientSecret: aaClientSecret,
      redirectUri: aaRedirectUri,
      callbackUrl: aaCallbackUrl,
      webhookSecret: aaWebhookSecret,
      setu: {
        environment: setuEnvironment,
        clientId: setuClientId,
        clientSecret: setuClientSecret,
        productInstanceId: setuProductInstanceId,
        apiBaseUrl: setuApiBaseUrl,
        authBaseUrl: setuAuthBaseUrl,
        redirectBaseUrl: setuRedirectBaseUrl,
        callbackBaseUrl: setuCallbackBaseUrl,
        webhookSecret: setuWebhookSecret,
        testVua: envSource.SETU_TEST_VUA || envSource.VUA || (envSource.SETU_TEST_PHONE_NUMBER || envSource.VUA_MOBILE_NUMBER ? `${envSource.SETU_TEST_PHONE_NUMBER || envSource.VUA_MOBILE_NUMBER}@onemoney` : undefined),
        testPhoneNumber: envSource.SETU_TEST_PHONE_NUMBER || envSource.VUA_MOBILE_NUMBER || undefined,
      }
    },
    paymentLimits: {
      perTransaction: Number(envSource.PER_TXN_PAYMENT_LIMIT) || 25000,
      daily: Number(envSource.DAILY_PAYMENT_LIMIT) || 50000,
      monthly: Number(envSource.MONTHLY_PAYMENT_LIMIT) || 200000,
    },
    rateLimits: {
      generalWindowMs: Number(envSource.RATE_LIMIT_GENERAL_WINDOW_MS) || 15 * 60 * 1000,
      generalMax: Number(envSource.RATE_LIMIT_GENERAL_MAX) || 300,
      authWindowMs: Number(envSource.RATE_LIMIT_AUTH_WINDOW_MS) || 15 * 60 * 1000,
      authMax: Number(envSource.RATE_LIMIT_AUTH_MAX) || 15,
      paymentsWindowMs: Number(envSource.RATE_LIMIT_PAYMENTS_WINDOW_MS) || 60 * 60 * 1000,
      paymentsMax: Number(envSource.RATE_LIMIT_PAYMENTS_MAX) || 30,
      aiWindowMs: Number(envSource.RATE_LIMIT_AI_WINDOW_MS) || 15 * 60 * 1000,
      aiMax: Number(envSource.RATE_LIMIT_AI_MAX) || 40,
    },
  };
}

export const config = loadAndValidateConfig();
