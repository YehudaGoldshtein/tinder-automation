import { Page } from 'playwright';
import { S } from '../selectors';
import { Match } from '../types';
import { dismissPopups } from './popups';
import logger from '../utils/logger';

/** Navigate to matches and scrape the list */
export async function getMatches(page: Page): Promise<Match[]> {
  await page.goto('https://tinder.com/app/matches', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await dismissPopups(page);

  const matches: Match[] = [];

  // First scrape new matches (visible without clicking Messages tab)
  const newMatchItems = page.locator(S.NEW_MATCH_ITEM);
  const newCount = await newMatchItems.count();
  logger.info(`Found ${newCount} new match items`);

  for (let i = 0; i < newCount; i++) {
    try {
      const item = newMatchItems.nth(i);
      const href = await item.getAttribute('href') || '';
      if (!href.includes('/app/messages/')) continue;
      const id = href.replace('/app/messages/', '');
      const photoEl = item.locator('[role="img"]').first();
      const name = await photoEl.getAttribute('aria-label') || `New Match ${i + 1}`;

      matches.push({
        id,
        name: name.trim(),
        lastMessage: '',
        lastMessageTime: '',
        isNew: true,
        hasOpener: false,
      });
    } catch {
      continue;
    }
  }

  // Click "Messages" tab to reveal conversations list
  try {
    const messagesTab = page.locator(S.MESSAGES_TAB).first();
    await messagesTab.click({ timeout: 3000 });
    await page.waitForTimeout(2000);
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
    await page.waitForTimeout(2000);
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
        isNew: false,
        hasOpener: preview.length > 0,
      });
    } catch {
      continue;
    }
  }

  return matches;
}

/** Open a specific match's conversation by match ID */
export async function openMatchById(page: Page, matchId: string): Promise<boolean> {
  try {
    await page.goto(`https://tinder.com/app/messages/${matchId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
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
    await page.waitForTimeout(1000);
    return true;
  } catch (e) {
    logger.error(`Failed to open match at index ${index}: ${e}`);
    return false;
  }
}
