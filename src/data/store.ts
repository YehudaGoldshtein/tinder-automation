import fs from 'fs';
import path from 'path';
import { AppState, DailyStats } from '../types';

const STATE_PATH = path.resolve(__dirname, '..', '..', 'data', 'state.json');

function defaultState(): AppState {
  return { swipedProfiles: [], contactedMatches: [], stats: [] };
}

export function loadState(): AppState {
  try {
    if (fs.existsSync(STATE_PATH)) {
      return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
    }
  } catch { /* ignore */ }
  return defaultState();
}

export function saveState(state: AppState): void {
  const dir = path.dirname(STATE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

export function todayStats(state: AppState): DailyStats {
  const today = new Date().toISOString().slice(0, 10);
  let stats = state.stats.find(s => s.date === today);
  if (!stats) {
    stats = { date: today, swipes: 0, likes: 0, passes: 0, newMatches: 0, openersSent: 0, followUpsSent: 0 };
    state.stats.push(stats);
  }
  return stats;
}
