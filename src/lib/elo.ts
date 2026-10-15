import { InternalEloRecord } from '@/types/fantasy';

// Internal Elo rating defaults
const DEFAULT_ELO = 1500;
const DEFAULT_K_FACTOR = 32;

// In-memory Elo registry for R0 runtime
const internalEloStore = new Map<string, InternalEloRecord>();

export function getPlayerElo(playerId: string): InternalEloRecord {
  const existing = internalEloStore.get(playerId);
  if (existing) return existing;

  const initial: InternalEloRecord = {
    playerId,
    rating: DEFAULT_ELO,
    matchesCount: 0,
    lastUpdated: new Date().toISOString(),
  };
  internalEloStore.set(playerId, initial);
  return initial;
}

/**
 * Updates internal Elo scores based on a swipe event.
 * Note: This runs silently in the background and is NOT shown to the user.
 * 
 * @param offeredPlayerId The player the user is currently shopping from their team
 * @param targetPlayerId The player on the opponent's team being swiped on
 * @param isInterested TRUE if user swiped Right (Interested in acquiring target), FALSE if Left (Passed)
 */
export function recordSwipeEloUpdate(
  offeredPlayerId: string,
  targetPlayerId: string,
  isInterested: boolean
): { offered: InternalEloRecord; target: InternalEloRecord } {
  const offered = getPlayerElo(offeredPlayerId);
  const target = getPlayerElo(targetPlayerId);

  // Score outcome:
  // If user likes target (Swipe Right), Target (B) wins value duel against Offered (A)
  // If user dislikes target (Swipe Left), Offered (A) wins value duel against Target (B)
  const scoreTarget = isInterested ? 1.0 : 0.0;
  const scoreOffered = isInterested ? 0.0 : 1.0;

  // Expected scores based on current Elo ratings
  const expectedTarget = 1 / (1 + Math.pow(10, (offered.rating - target.rating) / 400));
  const expectedOffered = 1 / (1 + Math.pow(10, (target.rating - offered.rating) / 400));

  // Determine K-factor (more volatile for early swipes)
  const kTarget = target.matchesCount < 10 ? 40 : DEFAULT_K_FACTOR;
  const kOffered = offered.matchesCount < 10 ? 40 : DEFAULT_K_FACTOR;

  // Compute updated ratings
  const newTargetRating = Math.round(target.rating + kTarget * (scoreTarget - expectedTarget));
  const newOfferedRating = Math.round(offered.rating + kOffered * (scoreOffered - expectedOffered));

  const updatedTarget: InternalEloRecord = {
    playerId: targetPlayerId,
    rating: newTargetRating,
    matchesCount: target.matchesCount + 1,
    lastUpdated: new Date().toISOString(),
  };

  const updatedOffered: InternalEloRecord = {
    playerId: offeredPlayerId,
    rating: newOfferedRating,
    matchesCount: offered.matchesCount + 1,
    lastUpdated: new Date().toISOString(),
  };

  internalEloStore.set(targetPlayerId, updatedTarget);
  internalEloStore.set(offeredPlayerId, updatedOffered);

  return { offered: updatedOffered, target: updatedTarget };
}

/**
 * Updates Elo ratings for package trades (1-1, 2-1, 1-2, 2-2)
 */
export function recordPackageSwipeEloUpdate(
  offeredPlayerIds: string[],
  targetPlayerIds: string[],
  isInterested: boolean
) {
  offeredPlayerIds.forEach((offeredId) => {
    targetPlayerIds.forEach((targetId) => {
      recordSwipeEloUpdate(offeredId, targetId, isInterested);
    });
  });
}

// Helper to inspect all internal Elo ratings (for future trade suggestion engine)
export function getAllInternalEloRatings(): InternalEloRecord[] {
  return Array.from(internalEloStore.values());
}
