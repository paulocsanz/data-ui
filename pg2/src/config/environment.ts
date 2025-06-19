import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.string().transform(Number).default('9009'),
  TIMEOUT: z.string().transform(Number).default('15000'),
  TOKEN: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  PGUSER: z.string().optional(),
  PGPASSWORD: z.string().optional(),
  PGHOST: z.string().optional(),
  PGPORT: z.string().optional(),
  CLICKHOUSE_URL: z.string().optional(),
  MONITORING_INTERVAL: z.string().transform(Number).default('5000'),
});

export type Environment = z.infer<typeof envSchema>;

export function parseEnvironment(): Environment {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    console.error('❌ Invalid environment configuration:', error);
    process.exit(1);
  }
}

export const env = parseEnvironment();
