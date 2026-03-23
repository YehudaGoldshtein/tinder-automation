import { Page } from 'playwright';
import { S } from '../selectors';
import { Message } from '../types';
import { humanDelay } from '../utils/delay';
import logger from '../utils/logger';

/** Read messages in the currently open conversation */
export async function readMessages(page: Page): Promise<Message[]> {
  const messages: Message[] = [];

  try {
    // Wait for chat to load
    await page.waitForSelector(S.CHAT_CONTAINER, { timeout: 5000 }).catch(() => {});

    const bubbles = page.locator(S.CHAT_MSG_ALL);
    const count = await bubbles.count();

    for (let i = 0; i < count; i++) {
      const bubble = bubbles.nth(i);
      // Get text from the span.text inside the bubble
      const textEl = bubble.locator(S.CHAT_MSG_TEXT).first();
      const text = await textEl.textContent({ timeout: 1000 }).catch(() => '');
      if (!text?.trim()) continue;

      // Determine direction: "received" in className means it's from them
      const classList = await bubble.getAttribute('class') || '';
      const isMe = !classList.includes('received');

      // Try to get timestamp from nearby msg__status
      const statusEl = bubble.locator('..').locator(S.CHAT_MSG_STATUS).first();
      const time = await statusEl.textContent({ timeout: 500 }).catch(() => '');

      messages.push({
        from: isMe ? 'me' : 'them',
        text: text.trim(),
        time: time?.trim() || '',
      });
    }
  } catch (e) {
    logger.error(`Failed to read messages: ${e}`);
  }

  return messages;
}

/** Send a message in the currently open conversation */
export async function sendMessage(page: Page, text: string): Promise<boolean> {
  try {
    // Find the textarea with placeholder "Type a message"
    const input = page.locator(S.CHAT_INPUT).first();
    await input.waitFor({ timeout: 5000 });
    await input.click();
    await humanDelay();

    // Type with human-like speed (30-80ms per keystroke)
    await input.fill('');
    await page.keyboard.type(text, { delay: 30 + Math.random() * 50 });
    await humanDelay();

    // Click submit button (it gets enabled after typing)
    const sendBtn = page.locator(S.CHAT_SEND_BUTTON).first();
    await sendBtn.waitFor({ timeout: 3000 });
    // Wait for button to become enabled
    await page.waitForFunction(
      (sel) => {
        const btn = document.querySelector(sel) as HTMLButtonElement;
        return btn && !btn.disabled;
      },
      S.CHAT_SEND_BUTTON,
      { timeout: 3000 }
    ).catch(() => {
      // Fallback: press Enter
      logger.info('Send button not enabled, pressing Enter instead');
    });

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
    await humanDelay();
    return true;
  } catch (e) {
    logger.error(`Failed to send message: ${e}`);
    return false;
  }
}
