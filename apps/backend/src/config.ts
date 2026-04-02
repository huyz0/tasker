import { z } from 'zod';

const configSchema = z.object({
  googleClientId: z.string().default(''),
  googleClientSecret: z.string().default(''),
  googleRedirectUri: z.string().default(''),
  jwtSecret: z.string().default('default_secret'),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
});

const loadConfig = () => {
  // Base configuration from process.env (Bun natively loads .env files)
  const envConfig = {
    googleClientId: process.env.GOOGLE_CLIENT_ID || (process.env.NODE_ENV === 'test' ? 'MOCK_CLIENT_ID' : undefined),
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || (process.env.NODE_ENV === 'test' ? 'MOCK_CLIENT_SECRET' : undefined),
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || (process.env.NODE_ENV === 'test' ? 'MOCK_REDIRECT_URI' : undefined),
    jwtSecret: process.env.JWT_SECRET,
    nodeEnv: process.env.NODE_ENV,
  };

  const parsed = configSchema.safeParse(envConfig);

  if (!parsed.success) {
    console.error('❌ Invalid backend configuration:', parsed.error.format());
    process.exit(1); // Fail fast
  }

  return parsed.data;
};

export const config = loadConfig();
