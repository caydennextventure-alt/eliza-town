import { ConvexError } from 'convex/values';

export type Visibility = 'public' | 'friends' | 'private';

type HasDb = {
  db: {
    query: (table: 'friendsAllowlist') => any;
  };
};

async function isFriendAllowed(ctx: HasDb, ownerId: string, viewerId: string): Promise<boolean> {
  const row = await ctx.db
    .query('friendsAllowlist')
    .withIndex('by_owner', (q: any) => q.eq('ownerId', ownerId).eq('friendId', viewerId))
    .first();
  return Boolean(row);
}

export async function canAccessByVisibility(
  ctx: HasDb,
  {
    visibility,
    ownerId,
    viewerId,
  }: {
    visibility: Visibility;
    ownerId: string;
    viewerId: string | null;
  },
): Promise<boolean> {
  if (visibility === 'public') return true;
  if (!viewerId) return false;
  if (viewerId === ownerId) return true;
  if (visibility === 'private') return false;
  return await isFriendAllowed(ctx, ownerId, viewerId);
}

export async function requireAccessByVisibility(
  ctx: HasDb,
  args: { visibility: Visibility; ownerId: string; viewerId: string | null },
  message = 'Not allowed',
): Promise<void> {
  const ok = await canAccessByVisibility(ctx, args);
  if (!ok) {
    throw new ConvexError(message);
  }
}

