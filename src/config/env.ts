import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
  CRON_SECRET: z.string().min(16),
  RESEND_API_KEY: z.string().optional().transform((v) => (v ? v : undefined)),
  EMAIL_FROM: z.string().default("Race Training <noreply@example.com>"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Validated server env. Parsed lazily so `next build` doesn't need runtime secrets. */
export function env(): Env {
  if (!cached) {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
    }
    cached = parsed.data;
  }
  return cached;
}
