import { Page } from 'playwright';
import { S } from '../selectors';
import { dismissPopups } from './popups';
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
  await page.waitForTimeout(3000);
  await dismissPopups(page);
  await page.click(S.MESSAGES_TAB, { timeout: 5000 });
  await page.waitForSelector(S.MESSAGE_LIST_ITEM, { timeout: 10000 });
  await page.waitForTimeout(1000);

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
    await page.waitForTimeout(1500);
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
    await page.waitForTimeout(1500);
    await dismissPopups(page);

    // Extract the last message date from the chat
    const dateInfo = await page.evaluate(() => {
      // Look for date separators or timestamps
      // Tinder shows date headers like "Today", "Yesterday", "Mon, Mar 20"
      // and msg__status with "Sent" or time
      const dateHeaders: string[] = [];

      // Date separator elements
      document.querySelectorAll('[class*="separator"], [class*="date"], [class*="timestamp"]').forEach(el => {
        const text = el.textContent?.trim();
        if (text) dateHeaders.push(text);
      });

      // Also check for any text that looks like a date in the chat area
      const chatEl = document.querySelector('.chat');
      if (chatEl) {
        // Look for standalone date text nodes between messages
        chatEl.querySelectorAll('div').forEach(div => {
          const text = div.textContent?.trim() || '';
          // Match patterns like "Today", "Yesterday", "Mon, Mar 20", "3/20/26"
          if (/^(Today|Yesterday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)/.test(text) && text.length < 30) {
            dateHeaders.push(text);
          }
          if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(text)) {
            dateHeaders.push(text);
          }
        });
      }

      // Get msg__status texts (they sometimes contain timestamps)
      const statuses: string[] = [];
      document.querySelectorAll('.msg__status').forEach(el => {
        const text = el.textContent?.trim();
        if (text) statuses.push(text);
      });

      return { dateHeaders, statuses };
    });

    // Try to determine the date of the last message
    let lastDate = '';
    const allDates = [...dateInfo.dateHeaders];
    if (allDates.length > 0) {
      lastDate = allDates[allDates.length - 1]; // Last date header = most recent
    }

    const entry: ConversationEntry = {
      name: conv.name,
      matchId: conv.matchId,
      profileUrl: `https://tinder.com/app/messages/${conv.matchId}`,
      conversationUrl: `https://tinder.com/app/messages/${conv.matchId}`,
      lastMessage: conv.preview,
      lastMessageDate: lastDate,
      lastMessageFrom: conv.lastMessageFrom as 'me' | 'them' | 'unknown',
    };

    // If we have a since filter, try to parse and compare
    if (since && lastDate) {
      try {
        const parsed = parseTinderDate(lastDate);
        if (parsed && parsed < since) {
          logger.info(`  ${conv.name}: ${lastDate} — before cutoff, stopping`);
          // Tinder shows conversations in reverse chronological order,
          // so once we hit one that's too old, we can stop
          break;
        }
      } catch { /* continue if date parsing fails */ }
    }

    results.push(entry);
    logger.info(`  ${conv.name}: ${lastDate || '(no date)'} — "${conv.preview.slice(0, 40)}"`);
  }

  return results;
}

/** Parse Tinder's date formats into a Date object */
function parseTinderDate(text: string): Date | null {
  const now = new Date();

  if (text === 'Today') return now;
  if (text === 'Yesterday') {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return d;
  }

  // Try "Mon, Mar 20" format
  const match = text.match(/(\w+),\s+(\w+)\s+(\d+)/);
  if (match) {
    const dateStr = `${match[2]} ${match[3]}, ${now.getFullYear()}`;
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // Try "3/20/26" format
  const slashMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slashMatch) {
    const year = slashMatch[3].length === 2 ? 2000 + parseInt(slashMatch[3]) : parseInt(slashMatch[3]);
    return new Date(year, parseInt(slashMatch[1]) - 1, parseInt(slashMatch[2]));
  }

  return null;
}
