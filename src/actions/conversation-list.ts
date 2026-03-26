import { Page } from 'playwright';
import { S } from '../selectors';
import { dismissPopups } from './popups';
import { randomize } from '../utils/delay';
import logger from '../utils/logger';

export interface ConversationEntry {
  name: string;
  matchId: string;
  profileUrl: string;
  conversationUrl: string;
  lastMessage: string;
  lastMessageDate: string;
  lastMessageFrom: 'me' | 'them' | 'unknown';
}

/**
 * Get all conversations with last message date.
 * Opens each conversation to extract the timestamp of the last message.
 * Filters by sinceDate if provided.
 */
export async function getConversationsSince(
  page: Page,
  sinceDate?: string
): Promise<ConversationEntry[]> {
  // Navigate to matches, click Messages tab
  await page.goto('https://tinder.com/app/matches', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(randomize(3000));
  await dismissPopups(page);
  await page.click(S.MESSAGES_TAB, { timeout: 5000 });
  await page.waitForSelector(S.MESSAGE_LIST_ITEM, { timeout: 10000 });
  await page.waitForTimeout(randomize(1000));

  // Scroll to load all conversations
  let prevCount = 0;
  for (let attempt = 0; attempt < 10; attempt++) {
    const count = await page.locator(S.MESSAGE_LIST_ITEM).count();
    if (count === prevCount) break;
    prevCount = count;
    // Scroll the message list container
    await page.evaluate(() => {
      const list = document.querySelector('.messageList') || document.querySelector('ul[aria-label="Your recent messages"]');
      if (list) list.scrollTop = list.scrollHeight;
    });
    await page.waitForTimeout(randomize(1500));
  }

  // Extract basic info from all conversations
  const convs = await page.evaluate((selector: string) => {
    const items = document.querySelectorAll(selector);
    return Array.from(items).map(item => {
      const link = item.closest('a') || item.querySelector('a') || item;
      const name = link.getAttribute('aria-label') ||
                   item.querySelector('.messageListItem__name')?.textContent?.trim() || '';
      const href = link.getAttribute('href') || '';
      const matchId = href.replace('/app/messages/', '');
      const previewHidden = item.querySelector('.messageListItem__message span.Hidden')?.textContent?.trim() || '';
      const previewVisible = item.querySelector('.messageListItem__message span[aria-hidden="true"]')?.textContent?.trim() || '';
      const preview = previewVisible || previewHidden;
      const isMyMessage = previewHidden.startsWith('Your last message was:');

      return {
        name,
        matchId,
        href,
        preview: preview.replace(/^Your last message was:\s*/, ''),
        lastMessageFrom: isMyMessage ? 'me' : 'them',
      };
    }).filter(c => c.name && c.matchId);
  }, S.MESSAGE_LIST_ITEM);

  logger.info(`Found ${convs.length} total conversations, checking dates...`);

  const results: ConversationEntry[] = [];
  const since = sinceDate ? new Date(sinceDate) : null;

  for (const conv of convs) {
    // Open each conversation to get the last message date
    await page.goto(`https://tinder.com/app/messages/${conv.matchId}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(randomize(1500));
    await dismissPopups(page);

    // Wait for <time> elements to appear (messages to render)
    try {
      await page.waitForSelector('time[datetime]', { timeout: 5000 });
    } catch { /* no messages in this conversation */ }

    // Extract the last message ISO timestamp from <time datetime="..."> elements
    const lastIso = await page.evaluate(() => {
      const timeEls = document.querySelectorAll('time[datetime]');
      if (timeEls.length === 0) return null;
      // Last <time> element = most recent message
      return timeEls[timeEls.length - 1].getAttribute('datetime');
    });

    const lastDate = lastIso || '';

    const entry: ConversationEntry = {
      name: conv.name,
      matchId: conv.matchId,
      profileUrl: `https://tinder.com/app/messages/${conv.matchId}`,
      conversationUrl: `https://tinder.com/app/messages/${conv.matchId}`,
      lastMessage: conv.preview,
      lastMessageDate: lastDate,
      lastMessageFrom: conv.lastMessageFrom as 'me' | 'them' | 'unknown',
    };

    // If we have a since filter, compare ISO timestamps directly
    if (since && lastDate) {
      const parsed = new Date(lastDate);
      if (!isNaN(parsed.getTime()) && parsed < since) {
        logger.info(`  ${conv.name}: ${lastDate} — before cutoff, stopping`);
        // Tinder shows conversations in reverse chronological order,
        // so once we hit one that's too old, we can stop
        break;
      }
    }

    results.push(entry);
    logger.info(`  ${conv.name}: ${lastDate || '(no date)'} — "${conv.preview.slice(0, 40)}"`);

    // Pause between opening each conversation (like a human browsing)
    await page.waitForTimeout(randomize(1000, 0.3));
  }

  return results;
}

