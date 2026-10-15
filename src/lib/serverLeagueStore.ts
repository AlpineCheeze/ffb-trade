import fs from 'fs';
import path from 'path';
import { League } from '@/types/fantasy';

// Store snapshots in .data/leagues directory on the server
const DATA_DIR = path.join(process.cwd(), '.data', 'leagues');

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.error('Failed to create server league data dir:', err);
  }
}

export function saveServerLeagueSnapshot(league: League): void {
  try {
    ensureDataDir();
    const cleanId = league.espnLeagueId.trim();
    const filePath = path.join(DATA_DIR, `${cleanId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(league, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Failed to save server snapshot for league ${league.espnLeagueId}:`, err);
  }
}

export function getServerLeagueSnapshot(espnLeagueId: string): League | null {
  try {
    ensureDataDir();
    const cleanId = espnLeagueId.trim();
    const filePath = path.join(DATA_DIR, `${cleanId}.json`);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as League;
    }
  } catch (err) {
    console.error(`Failed to read server snapshot for league ${espnLeagueId}:`, err);
  }
  return null;
}
