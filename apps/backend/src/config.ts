import { z } from 'zod';
import { logger } from './lib/logger';

const configSchema = z.object({
  googleClientId: z.string().default(''),
  googleClientSecret: z.string().default(''),
  googleRedirectUri: z.string().default(''),
  jwtSecret: z.string().default('default_secret'),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  enableTestLogin: z.boolean().default(false),
});

const loadConfig = () => {
  // Base configuration from process.env (Bun natively loads .env files)
  const envConfig = {
    googleClientId: process.env.GOOGLE_CLIENT_ID || (process.env.NODE_ENV === 'test' ? 'MOCK_CLIENT_ID' : undefined),
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || (process.env.NODE_ENV === 'test' ? 'MOCK_CLIENT_SECRET' : undefined),
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || (process.env.NODE_ENV === 'test' ? 'MOCK_REDIRECT_URI' : undefined),
    jwtSecret: process.env.JWT_SECRET,
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
