/**
 * ELO calculation logic for players based on trade swipes.
 */

const K_FACTOR = 32;

/**
 * Calculates the new ELO ratings after a "match" (a swipe decision).
 * @param ratingA ELO of the "Give" side (average)
 * @param ratingB ELO of the "Get" side (average)
 * @param scoreA 1 if Give side won (Swipe NO), 0 if Get side won (Swipe YES)
 */
export function calculateNewRatings(ratingA: number, ratingB: number, scoreA: number) {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expectedB = 1 / (1 + Math.pow(10, (ratingA - ratingB) / 400));

  const scoreB = 1 - scoreA;

  const newRatingA = ratingA + K_FACTOR * (scoreA - expectedA);
  const newRatingB = ratingB + K_FACTOR * (scoreB - expectedB);

  return { newRatingA, newRatingB };
}

/**
 * Helper to calculate average ELO for a group of players.
 */
export function getAverageElo(players: { elo: number }[]) {
  if (players.length === 0) return 1500;
  return players.reduce((sum, p) => sum + p.elo, 0) / players.length;
}
