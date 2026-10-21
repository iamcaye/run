import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { env } from "@/config/env";
import { USER_DEFAULTS } from "@/config/training";
import { db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { emailSender, passwordResetEmail } from "@/server/email";

/** How long the signed session cookie is trusted before re-checking the database. */
const SESSION_CACHE_SECONDS = 10 * 60;

function createAuth() {
  return betterAuth({
    secret: env().BETTER_AUTH_SECRET,
    baseURL: env().BETTER_AUTH_URL,
    database: drizzleAdapter(db(), {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: {
      enabled: true,
      // v1: no email verification; it can plug into the same EmailSender later.
      requireEmailVerification: false,
      minPasswordLength: 8,
      sendResetPassword: async ({ user, url }) => {
        await emailSender().send(passwordResetEmail(user.email, url));
      },
      revokeSessionsOnPasswordReset: true,
    },
    session: {
      // Signed cookie copy of the session, so page renders skip the session query. Server Components can't
      // write cookies, so SessionKeepAlive refreshes it from the client. Revocations reach other devices within maxAge.
      cookieCache: { enabled: true, maxAge: SESSION_CACHE_SECONDS },
    },
    user: {
      // All user data cascades from `user` via FKs, so deletion is a single row delete.
      deleteUser: { enabled: true },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (created) => {
            await db()
              .insert(schema.userSettings)
              .values({ userId: created.id, ...USER_DEFAULTS, runDays: [...USER_DEFAULTS.runDays] })
              .onConflictDoNothing();
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
let instance: Auth | undefined;

export function auth(): Auth {
  instance ??= createAuth();
  return instance;
}
