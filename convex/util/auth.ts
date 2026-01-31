import { ConvexError } from 'convex/values';

type Identity = {
  tokenIdentifier?: string;
  name?: string | null;
  givenName?: string | null;
  nickname?: string | null;
  email?: string | null;
};

type HasAuth = {
  auth: {
    getUserIdentity: () => Promise<Identity | null>;
  };
};

export async function getOptionalUserId(ctx: HasAuth): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  const userId = identity?.tokenIdentifier ?? null;
  if (userId) return userId;

  // In local E2E, run without interactive auth.
  const siteUrl = process.env.CONVEX_SITE_URL ?? '';
  const isLocal = siteUrl.includes('127.0.0.1') || siteUrl.includes('localhost');
  if (process.env.AITOWN_E2E === '1' || isLocal) {
    return 'e2e:anonymous';
  }

  return null;
}

export async function requireUserId(ctx: HasAuth, message = 'Not logged in'): Promise<string> {
  const userId = await getOptionalUserId(ctx);
  if (!userId) {
    // E2E mode runs without interactive auth. Allow a stable synthetic user id.
    // In local Convex E2E, allow a stable guest user id.
    const deployment = process.env.CONVEX_DEPLOYMENT ?? '';
    const siteUrl = process.env.CONVEX_SITE_URL ?? '';
    const isLocal = siteUrl.includes('127.0.0.1') || siteUrl.includes('localhost');
    if (process.env.AITOWN_E2E === '1' || isLocal || deployment.startsWith('anonymous-') || deployment === 'anonymous-agent') {
      return 'e2e:anonymous';
    }
    throw new ConvexError(message);
  }
  return userId;
}

export async function getOptionalIdentity(ctx: HasAuth): Promise<Identity | null> {
  return await ctx.auth.getUserIdentity();
}

export function displayNameFromIdentity(identity: Identity): string | null {
  if (identity.givenName) return identity.givenName;
  if (identity.nickname) return identity.nickname;
  if (identity.name) return identity.name;
  if (identity.email) return identity.email.split('@')[0] ?? null;
  return null;
}

