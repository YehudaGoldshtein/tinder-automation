import { Page } from 'playwright';

/** Random delay between min and max ms */
export function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min) + min);
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Gaussian-ish human delay centered around centerMs */
export function humanDelay(centerMs = 3000, spreadMs = 1500): Promise<void> {
  const u1 = Math.random();
  const u2 = Math.random();
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const ms = Math.max(1000, Math.floor(centerMs + normal * spreadMs));
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Simulate reading time based on text length */
export function readingDelay(text: string): Promise<void> {
  const wordsPerMinute = 150 + Math.random() * 100; // 150-250 WPM, varies
  const words = text.split(/\s+/).length;
  const ms = Math.max(1500, (words / wordsPerMinute) * 60 * 1000);
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Big human-like pause between major actions (5-12 seconds) */
export function actionPause(): Promise<void> {
  return randomDelay(5000, 12000);
}

/** Small micro-pause like hesitation (300-800ms) */
export function microPause(): Promise<void> {
  return randomDelay(300, 800);
}

/**
 * Human-style typing into an element.
 * Variable speed per character, occasional pauses mid-word,
 * sometimes types wrong and corrects.
 */
export async function humanType(page: Page, text: string): Promise<void> {
  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    // Base delay per keystroke: 40-120ms (varies per person)
    let delay = 40 + Math.random() * 80;

    // Slower after spaces (thinking between words)
    if (char === ' ') {
      delay += Math.random() * 200;
    }

    // Occasional longer pause mid-sentence (like thinking)
    if (Math.random() < 0.03) {
      await randomDelay(500, 1500);
    }

    // Rare typo + correction (2% chance, skip for emojis/special chars)
    if (Math.random() < 0.02 && /[a-zA-Z]/.test(char) && i < text.length - 1) {
      // Type wrong char
      const wrongChar = String.fromCharCode(char.charCodeAt(0) + (Math.random() > 0.5 ? 1 : -1));
      await page.keyboard.type(wrongChar, { delay });
      await randomDelay(200, 500);
      await page.keyboard.press('Backspace');
      await randomDelay(100, 300);
    }

    await page.keyboard.type(char, { delay });
  }
}

/**
 * Randomize a duration by adding/removing up to `portion` of it.
 * e.g. randomize(10000, 0.3) => 7000–13000ms
 */
export function randomize(ms: number, portion = 0.25): number {
  const jitter = ms * portion;
  return Math.round(ms + (Math.random() * 2 - 1) * jitter);
}

/**
 * Random jitter for cron-like scheduling.
 * Returns a delay in ms to add to scheduled time (0 to maxJitterMs).
 */
export function scheduleJitter(maxJitterMs = 300000): number {
  return Math.floor(Math.random() * maxJitterMs);
}
