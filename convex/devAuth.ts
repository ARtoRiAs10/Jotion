import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";

/**
 * A development sign-in that makes it possible to test Jotion without a
 * Clerk account.
 *
 * It is **not public**:
 *   - the `ALLOW_DEV_AUTH` environment variable has to be set to `"true"`,
 *     and it is only set on the development deployment,
 *   - the tokens are signed with the deployment's JWT secret, so Convex
 *     accepts them as a real identity,
 *   - the production deployment simply has no `ALLOW_DEV_AUTH` and no
 *     `DEV_AUTH_SECRET`, so every function here refuses to run.
 *
 * The tokens are ordinary JWTs — the rest of the application does not know
 * whether a request came from Clerk or from the development sign-in.
 */

const DEV_AUTH_ENABLED = process.env.ALLOW_DEV_AUTH === "true";

/** The development sign-in has to be enabled explicitly. */
const requireDevAuthEnabled = () => {
  if (!DEV_AUTH_ENABLED) {
    throw new Error(
      "The development sign-in is disabled on this deployment. Set ALLOW_DEV_AUTH=true in the environment of the development deployment to enable it.",
    );
  }
};

/** Signing a token additionally needs the JWT secret of the deployment. */
const requireDevSecret = () => {
  requireDevAuthEnabled();
  if (!process.env.DEV_AUTH_SECRET) {
    throw new Error(
      "DEV_AUTH_SECRET is not set. Copy the JWT secret of the deployment from the Convex dashboard (Settings → API Keys → JWT Secret) and set it with `npx convex env set DEV_AUTH_SECRET <secret>`.",
    );
  }
};

const base64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const encode = (value: unknown) =>
  base64Url(new TextEncoder().encode(JSON.stringify(value)));

/** Signs a JWT that Convex accepts as an identity. */
const signToken = async (claims: Record<string, unknown>) => {
  const secret = process.env.DEV_AUTH_SECRET!;

  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    ...claims,
    aud: "convex",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  });

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );

  return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
};

/** The people that can use the development sign-in. */
export interface DevUser {
  userId: string;
  name: string;
  email?: string;
  avatarUrl?: string;
}

export const listUsers = action({
  args: {},
  handler: async (ctx): Promise<DevUser[]> => {
    requireDevAuthEnabled();
    const users = await ctx.runQuery(internal.devAuthInternal.listUsers, {});
    return users;
  },
});

/**
 * Tells whether the development sign-in is ready. It never fails — it simply
 * reports what is missing.
 */
export const status = action({
  args: {},
  handler: async (ctx): Promise<{
    enabled: boolean;
    hasSecret: boolean;
    users: number;
  }> => {
    const users = DEV_AUTH_ENABLED
      ? await ctx.runQuery(internal.devAuthInternal.listUsers, {})
      : [];
    return {
      enabled: DEV_AUTH_ENABLED,
      hasSecret: Boolean(process.env.DEV_AUTH_SECRET),
      users: users.length,
    };
  },
});

/** Creates the development users. */
export const seed = action({
  args: {},
  handler: async (ctx): Promise<number> => {
    requireDevAuthEnabled();
    return await ctx.runMutation(internal.devAuthInternal.seed, {});
  },
});

/** Returns a token for one of the development users. */
export const signIn = action({
  args: { userId: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ token: string; user: DevUser }> => {
    requireDevSecret();

    const user = await ctx.runQuery(internal.devAuthInternal.getUser, {
      userId: args.userId,
    });
    if (!user) throw new Error("This user does not exist");

    const token = await signToken({
      sub: user.userId,
      name: user.name,
      email: user.email,
    });

    // Make sure the mirror of the user exists, so that members, comments and
    // mentions can resolve the name.
    await ctx.runMutation(internal.devAuthInternal.upsertUser, {
      userId: user.userId,
      name: user.name,
      email: user.email,
    });

    return { token, user };
  },
});
