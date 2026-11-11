import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins/bearer";
import { Pool } from "pg";
export const configured = () =>
  !!(
    process.env.DATABASE_URL &&
    process.env.BETTER_AUTH_SECRET &&
    process.env.BETTER_AUTH_URL
  );
let pool: Pool | undefined;
export function db() {
  if (!configured()) throw new Error("Cloud is not configured");
  return (pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  }));
}
function createAuth() {
  return betterAuth({
    appName: "Pixelwild",
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: db(),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
    },
    trustedOrigins: [process.env.BETTER_AUTH_URL!, "https://localhost"],
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 30,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
      },
    },
    plugins: [bearer({ requireSignature: true })],
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export function auth() {
  return (instance ??= createAuth());
}
