import { Page } from 'playwright';
import { S } from '../selectors';
import { Message } from '../types';
import { humanDelay, actionPause, microPause, humanType, readingDelay, randomize } from '../utils/delay';
import { sanitizeEmojis } from '../utils/emoji-sanitizer';
import logger from '../utils/logger';

/** Read messages in the currently open conversation */
export async function readMessages(page: Page): Promise<Message[]> {
  const messages: Message[] = [];
  logger.info('[readMessages] Reading messages from current conversation...');

  try {
    // Wait for chat to load
    await page.waitForSelector(S.CHAT_CONTAINER, { timeout: 5000 }).catch(() => {});

    const bubbles = page.locator(S.CHAT_MSG_ALL);
    const count = await bubbles.count();

    for (let i = 0; i < count; i++) {
      const bubble = bubbles.nth(i);
      const textEl = bubble.locator(S.CHAT_MSG_TEXT).first();
      const text = await textEl.textContent({ timeout: 1000 }).catch(() => '');
      if (!text?.trim()) continue;

      const classList = await bubble.getAttribute('class') || '';
      const isMe = !classList.includes('received');

      const statusEl = bubble.locator('..').locator(S.CHAT_MSG_STATUS).first();
      const time = await statusEl.textContent({ timeout: 500 }).catch(() => '');

      messages.push({
        from: isMe ? 'me' : 'them',
        text: text.trim(),
        time: time?.trim() || '',
      });

      // Brief pause between reading each message bubble
      if (i < count - 1) await page.waitForTimeout(randomize(200, 0.4));
    }
  } catch (e) {
    logger.error(`[readMessages] Failed: ${e}`);
  }

  logger.info(`[readMessages] Read ${messages.length} messages`);
  return messages;
}

/** Send a message in the currently open conversation */
export async function sendMessage(page: Page, text: string): Promise<boolean> {
  // Sanitize emojis: Tinder only supports BMP (U+0000–U+FFFF)
  const sanitized = sanitizeEmojis(text);
  if (sanitized !== text) {
    logger.info(`[sendMessage] Emoji sanitized: "${text.slice(0, 50)}" → "${sanitized.slice(0, 50)}"`);
  }
  text = sanitized;

  logger.info(`[sendMessage] Sending: "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}"`);
  try {
    // Simulate reading the conversation first
    await readingDelay(text);

    // Find the textarea
    const input = page.locator(S.CHAT_INPUT).first();
    await input.waitFor({ timeout: 5000 });

    // Pause before clicking input (like moving mouse to it)
    await microPause();
    await input.click();

    // Pause before starting to type (thinking what to write)
    await humanDelay(2000, 1000);

    // Human-style typing with variable speed and occasional typos
    await input.fill('');
    await humanType(page, text);

    // Pause after typing (re-reading what you wrote)
    await humanDelay(1500, 800);

    // Click submit button
    const sendBtn = page.locator(S.CHAT_SEND_BUTTON).first();
    await sendBtn.waitFor({ timeout: 3000 });
    await page.waitForFunction(
      (sel) => {
        const btn = document.querySelector(sel) as HTMLButtonElement;
        return btn && !btn.disabled;
      },
      S.CHAT_SEND_BUTTON,
      { timeout: 3000 }
    ).catch(() => {
      logger.info('Send button not enabled, pressing Enter instead');
    });

    await microPause();

    try {
      if (await sendBtn.isEnabled({ timeout: 500 })) {
        await sendBtn.click();
      } else {
        await page.keyboard.press('Enter');
      }
    } catch {
      await page.keyboard.press('Enter');
    }

    logger.info(`Message sent: "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}"`);

    // Post-send pause (like watching the message appear)
    await actionPause();
    return true;
  } catch (e) {
    logger.error(`Failed to send message: ${e}`);
    return false;
  }
}
