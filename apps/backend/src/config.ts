import { z } from 'zod';
import { logger } from './lib/logger';

const DEFAULT_JWT_SECRET = 'default_secret';
const DEFAULT_ENCRYPTION_KEY = '00000000000000000000000000000000';
// AES-256-GCM (used to encrypt repository-link tokens) requires exactly a
// 32-byte key - any other length throws "Invalid key length" at the first
// encrypt/decrypt call, not at boot, so validate it up front instead.
const ENCRYPTION_KEY_BYTES = 32;

// Origins allowed to make credentialed cross-origin requests (browser
// cookie auth). Reflecting an arbitrary Origin back with
// Allow-Credentials: true would let any site read authenticated API
// responses using a visitor's session cookie - CORS must be an allowlist,
// not a mirror, whenever credentials are involved.
const DEFAULT_CORS_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://localhost:3000'];

const configSchema = z.object({
  googleClientId: z.string().default(''),
  googleClientSecret: z.string().default(''),
  googleRedirectUri: z.string().default(''),
  jwtSecret: z.string().default(DEFAULT_JWT_SECRET),
  appEncryptionSecret: z.string().default(DEFAULT_ENCRYPTION_KEY),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  enableTestLogin: z.boolean().default(false),
  corsAllowedOrigins: z.array(z.string()).default(DEFAULT_CORS_ALLOWED_ORIGINS),
}).superRefine((cfg, ctx) => {
  if (cfg.nodeEnv !== 'production') return;

  if (cfg.jwtSecret === DEFAULT_JWT_SECRET) {
    ctx.addIssue({ code: 'custom', path: ['jwtSecret'], message: 'JWT_SECRET must be set to a real secret in production' });
  }
  if (cfg.appEncryptionSecret === DEFAULT_ENCRYPTION_KEY) {
    ctx.addIssue({ code: 'custom', path: ['appEncryptionSecret'], message: 'APP_ENCRYPTION_SECRET must be set to a real secret in production' });
  } else if (Buffer.byteLength(cfg.appEncryptionSecret, 'utf8') !== ENCRYPTION_KEY_BYTES) {
    ctx.addIssue({
      code: 'custom',
      path: ['appEncryptionSecret'],
      message: `APP_ENCRYPTION_SECRET must be exactly ${ENCRYPTION_KEY_BYTES} bytes for AES-256-GCM (got ${Buffer.byteLength(cfg.appEncryptionSecret, 'utf8')})`,
    });
  }
  if (cfg.enableTestLogin) {
    ctx.addIssue({ code: 'custom', path: ['enableTestLogin'], message: 'ENABLE_TEST_LOGIN must not be enabled in production' });
  }
  if (cfg.corsAllowedOrigins.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['corsAllowedOrigins'], message: 'CORS_ALLOWED_ORIGINS must be set in production' });
  }
});

const loadConfig = () => {
  // Base configuration from process.env (Bun natively loads .env files)
  const envConfig = {
    googleClientId: process.env.GOOGLE_CLIENT_ID || (process.env.NODE_ENV === 'test' ? 'MOCK_CLIENT_ID' : undefined),
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || (process.env.NODE_ENV === 'test' ? 'MOCK_CLIENT_SECRET' : undefined),
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || (process.env.NODE_ENV === 'test' ? 'MOCK_REDIRECT_URI' : undefined),
    jwtSecret: process.env.JWT_SECRET,
    appEncryptionSecret: process.env.APP_ENCRYPTION_SECRET,
    nodeEnv: process.env.NODE_ENV,
    enableTestLogin: process.env.ENABLE_TEST_LOGIN === 'true',
    // Distinguish "unset" (use the dev-friendly default) from "explicitly
    // set to empty" (a misconfiguration the production check must catch),
    // rather than treating both the same way an `x || undefined` fallback would.
    corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS !== undefined
      ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
      : undefined,
  };

  const parsed = configSchema.safeParse(envConfig);

  if (!parsed.success) {
    logger.fatal({ errors: parsed.error.format() }, 'config.invalid');
    process.exit(1); // Fail fast
  }

  return parsed.data;
};

export const config = loadConfig();
