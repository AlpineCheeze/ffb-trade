# workballs 🏈

> Tinder-style Fantasy Football Trade Matchmaking Platform.

**workballs** is a mobile-first web application designed to eliminate friction in fantasy football trading. Fantasy managers can shop players from their roster and swipe **Right (Interested / Want)** or **Left (Pass)** on target players across opponent teams. When two managers in the same league mutually swipe right on each other's shopped players, **workballs** detects the 1-for-1 match and triggers a celebration.

---

## R0 Features Delivered

1. **ESPN League Synchronization**:
   - Live integration with ESPN Fantasy Football API (v3) for public leagues (via `leagueId` and `seasonId`) and private leagues (via `espn_s2` and `SWID` session cookies).
   - High-fidelity **Demo League (Gridiron Champions)** with real NFL stars (Justin Jefferson, Saquon Barkley, Patrick Mahomes, Breece Hall, CeeDee Lamb, Ja'Marr Chase, etc.) for instant 1-click testing.

2. **The Trade Block ("Shopping" Mode)**:
   - Managers select which player from their roster they want to put on the trade block.
   - Dynamic context banner showing the offered player as you swipe.

3. **Tinder/Bumble Swipe Deck**:
   - Physics-based card drag using **Framer Motion** with rotation, velocity thresholds, and rubber-banding.
   - Dynamic stamps on drag: **WANT** (green) on right drag, **PASS** (red) on left drag.
   - High-res ESPN player photos, team logos, bye weeks, matchup difficulty indicators, and season stat trends.
   - Floating action controls: Pass (X), Undo (revert last swipe), Want (Checkmark).
   - Fast position filtering (ALL, RB, WR, TE, QB).

4. **1-for-1 Mutual Matchmaking**:
   - Instant detection when two managers in the league have swiped right on each other's shopped players.
   - Animated celebration modal powered by `canvas-confetti`.
   - Dedicated **Matches Tab** listing all confirmed trade alignments with side-by-side trade comparisons and 1-click clipboard trade proposal export.

5. **Internal Player Elo Engine (Private / Backend Only)**:
   - Private Bradley-Terry / Elo ranking service running silently in the background on each swipe.
   - Value perception updates: Swiping Right scores a comparative valuation win for the target player over the offered player; swiping Left scores a win for the offered player.
   - Hidden from user UI, laying the data foundation for future smart trade recommendation algorithms.

---

## Getting Started

### Prerequisites
- Node.js 18+ (bundled locally in profile)
- npm

### Running the App
```bash
# Start local production server
npm run start

# Or run in development mode
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.
