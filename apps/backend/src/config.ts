import { z } from 'zod';
import { logger } from './lib/logger';

const DEFAULT_JWT_SECRET = 'default_secret';
const DEFAULT_ENCRYPTION_KEY = '00000000000000000000000000000000';

const configSchema = z.object({
  googleClientId: z.string().default(''),
  googleClientSecret: z.string().default(''),
  googleRedirectUri: z.string().default(''),
  jwtSecret: z.string().default(DEFAULT_JWT_SECRET),
  appEncryptionSecret: z.string().default(DEFAULT_ENCRYPTION_KEY),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  enableTestLogin: z.boolean().default(false),
}).superRefine((cfg, ctx) => {
  if (cfg.nodeEnv !== 'production') return;

  if (cfg.jwtSecret === DEFAULT_JWT_SECRET) {
    ctx.addIssue({ code: 'custom', path: ['jwtSecret'], message: 'JWT_SECRET must be set to a real secret in production' });
  }
  if (cfg.appEncryptionSecret === DEFAULT_ENCRYPTION_KEY) {
    ctx.addIssue({ code: 'custom', path: ['appEncryptionSecret'], message: 'APP_ENCRYPTION_SECRET must be set to a real secret in production' });
  }
  if (cfg.enableTestLogin) {
    ctx.addIssue({ code: 'custom', path: ['enableTestLogin'], message: 'ENABLE_TEST_LOGIN must not be enabled in production' });
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
  };

  const parsed = configSchema.safeParse(envConfig);

  if (!parsed.success) {
    logger.fatal({ errors: parsed.error.format() }, 'config.invalid');
    process.exit(1); // Fail fast
  }

  return parsed.data;
};

export const config = loadConfig();
