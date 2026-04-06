import { Page } from 'playwright';
import { S } from '../selectors';
import { Match } from '../types';
import { dismissPopups } from './popups';
import { randomize } from '../utils/delay';
import logger from '../utils/logger';

let matchCache: { data: Match[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

export function getCachedMatches(): Match[] | null {
  if (matchCache && Date.now() - matchCache.timestamp < CACHE_TTL_MS) {
    logger.info(`Using cached matches (${matchCache.data.length} matches, age: ${Math.round((Date.now() - matchCache.timestamp) / 1000)}s)`);
    return matchCache.data;
  }
  return null;
}

export function invalidateMatchCache(): void {
  matchCache = null;
}

/** Resolve a match by matchId (instant) or name (uses cache, falls back to full fetch) */
export async function resolveMatch(page: Page, name?: string, matchId?: string): Promise<Match | null> {
  if (matchId) {
    logger.info(`[resolveMatch] Direct matchId: ${matchId}`);
    return { id: matchId, name: name || 'Unknown', lastMessage: '', lastMessageTime: '', matchedAt: '', isNew: false, hasOpener: false };
  }
  if (!name) return null;
  const cached = getCachedMatches();
  const matches = cached || await getMatches(page);
  const match = matches.find(m => m.name.toLowerCase() === name.toLowerCase()) || null;
  logger.info(`[resolveMatch] name="${name}" → ${match ? match.id : 'NOT FOUND'}`);
  return match;
}

/** Navigate to matches and scrape the list */
export async function getMatches(page: Page, opts?: { newOnly?: boolean }): Promise<Match[]> {
  // Intercept Tinder API responses to capture match creation dates
  const matchDates = new Map<string, string>();
  const captureMatchDates = async (response: import('playwright').Response) => {
    try {
      const url = response.url();
      if (url.includes('/v2/matches') || url.includes('/v2/fast-match')) {
        const json = await response.json().catch(() => null);
        if (!json?.data?.matches) return;
        for (const m of json.data.matches) {
          if (m.id && m.created_date) {
            matchDates.set(m.id, m.created_date);
          }
        }
        logger.info(`[API intercept] Captured ${matchDates.size} match dates`);
      }
    } catch { /* ignore */ }
  };
  page.on('response', captureMatchDates);

  await page.goto('https://tinder.com/app/matches', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(randomize(3000));
  await dismissPopups(page);

  const matches: Match[] = [];

  // First scrape new matches (visible without clicking Messages tab)
  const newMatchItems = page.locator(S.NEW_MATCH_ITEM);
  const newCount = await newMatchItems.count();
  logger.info(`Found ${newCount} new match items`);

  // Batch DOM extraction — single page.evaluate() instead of sequential Playwright calls
  if (newCount > 0) {
    const selector = S.NEW_MATCH_ITEM;
    const newMatchData = await page.evaluate((sel) => {
      const items = document.querySelectorAll(sel);
      return Array.from(items).map((item, i) => {
        const href = item.getAttribute('href') || '';
        const photoEl = item.querySelector('[role="img"]');
        const name = photoEl?.getAttribute('aria-label') || `New Match ${i + 1}`;
        return { href, name };
      });
    }, selector);

    for (const { href, name } of newMatchData) {
      if (!href.includes('/app/messages/')) continue;
      const id = href.replace('/app/messages/', '');
      matches.push({
        id,
        name: name.trim(),
        lastMessage: '',
        lastMessageTime: '',
        matchedAt: matchDates.get(id) || '',
        isNew: true,
        hasOpener: false,
      });
    }
  }

  if (!opts?.newOnly) {
    // Click "Messages" tab to reveal conversations list
    try {
      const messagesTab = page.locator(S.MESSAGES_TAB).first();
      await messagesTab.click({ timeout: 3000 });
      await page.waitForTimeout(randomize(2000));
    } catch {
      logger.warn('Could not click Messages tab, conversations may not be visible');
    }

    // Scroll message list to load all conversations
    let prevCount = 0;
    for (let attempt = 0; attempt < 30; attempt++) {
      const count = await page.locator(S.MESSAGE_CONV_LINK).count();
      logger.info(`Scroll attempt ${attempt + 1}: ${count} conversations loaded`);
      if (count === prevCount && attempt > 2) break;
      prevCount = count;

      // Scroll the last visible messageListItem into view to trigger lazy loading
      await page.evaluate(() => {
        const items = document.querySelectorAll('.messageListItem');
        const last = items[items.length - 1];
        if (last) last.scrollIntoView({ behavior: 'smooth', block: 'end' });
      });
      await page.waitForTimeout(randomize(2000));
    }

    // Scrape conversation list items (Messages section)
    const convLinks = page.locator(S.MESSAGE_CONV_LINK);
    const convCount = await convLinks.count();
    logger.info(`Found ${convCount} conversations (after scrolling)`);

    for (let i = 0; i < convCount; i++) {
      try {
        const link = convLinks.nth(i);
        const name = await link.getAttribute('aria-label') || `Match ${i + 1}`;
        const href = await link.getAttribute('href') || '';
        const id = href.replace('/app/messages/', '');

        // Get message preview
        const previewEl = link.locator(S.MESSAGE_CONV_PREVIEW).first();
        const rawPreview = await previewEl.textContent({ timeout: 1000 }).catch(() => '');
        const preview = (rawPreview || '').replace(/^Your last message was: /, '');

        matches.push({
          id,
          name: name.trim(),
          lastMessage: preview.trim(),
          lastMessageTime: '',
          matchedAt: matchDates.get(id) || '',
          isNew: false,
          hasOpener: preview.length > 0,
        });

        // Small human-like pause between reading items
        if (i < convCount - 1) await page.waitForTimeout(randomize(400, 0.4));
      } catch {
        continue;
      }
    }
  } else {
    logger.info(`[getMatches] newOnly mode — skipping messages tab`);
  }

  page.off('response', captureMatchDates);
  const withDates = matches.filter(m => m.matchedAt).length;
  logger.info(`[getMatches] ${matches.length} matches (${withDates} with matchedAt)`);
  matchCache = { data: matches, timestamp: Date.now() };
  return matches;
}

/** Open a specific match's conversation by match ID */
export async function openMatchById(page: Page, matchId: string): Promise<boolean> {
  try {
    await page.goto(`https://tinder.com/app/messages/${matchId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(randomize(2000));
    return true;
  } catch (e) {
    logger.error(`Failed to open match ${matchId}: ${e}`);
    return false;
  }
}

/** Open a match conversation by clicking on it in the list */
export async function openMatchByIndex(page: Page, index: number): Promise<boolean> {
  try {
    const link = page.locator(S.MESSAGE_LIST_ITEM).nth(index);
    await link.click();
    await page.waitForURL(/\/app\/messages\//, { timeout: 5000 });
    await page.waitForTimeout(randomize(1000));
    return true;
  } catch (e) {
    logger.error(`Failed to open match at index ${index}: ${e}`);
    return false;
  }
}
