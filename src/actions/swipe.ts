import { Page } from 'playwright';
import { S } from '../selectors';
import { Profile } from '../types';
import { randomDelay, humanDelay } from '../utils/delay';
import { dismissPopups, dismissMatchPopup } from './popups';
import config from '../config';
import logger from '../utils/logger';

/** Read the current profile card */
export async function readCurrentProfile(page: Page): Promise<Profile | null> {
  try {
    await dismissPopups(page);

    const name = await page.locator(S.PROFILE_NAME).first().textContent({ timeout: 3000 }).catch(() => '');
    const age = await page.locator(S.PROFILE_AGE).first().textContent({ timeout: 1000 }).catch(() => '');
    const bio = await page.locator(S.PROFILE_BIO).first().textContent({ timeout: 1000 }).catch(() => '');
    const distance = await page.locator(S.PROFILE_DISTANCE).first().textContent({ timeout: 1000 }).catch(() => '');

    if (!name) return null;

    return {
      name: name.trim(),
      age: age?.trim() || '',
      bio: bio?.trim() || '',
      distance: distance?.trim() || '',
    };
  } catch {
    return null;
  }
}

/** Click the Like button */
export async function swipeRight(page: Page): Promise<boolean> {
  try {
    const btn = page.locator(S.LIKE_BUTTON).first();
    await btn.waitFor({ timeout: 5000 });
    await btn.click();
    await humanDelay();

    // Check for match popup
    const wasMatch = await dismissMatchPopup(page);
    if (wasMatch) {
      logger.info('New match from swipe!');
    }
    return true;
  } catch (e) {
    logger.error(`Failed to swipe right: ${e}`);
    return false;
  }
}

/** Click the Nope button */
export async function swipeLeft(page: Page): Promise<boolean> {
  try {
    const btn = page.locator(S.NOPE_BUTTON).first();
    await btn.waitFor({ timeout: 5000 });
    await btn.click();
    await humanDelay();
    return true;
  } catch (e) {
    logger.error(`Failed to swipe left: ${e}`);
    return false;
  }
}

/** Run a swiping session for `count` profiles */
export async function swipeSession(
  page: Page,
  count: number
): Promise<{ likes: number; passes: number; matches: number }> {
  const { likeRatio, delayBetweenSwipes, longPauseChance, longPauseRange } = config.swipe;
  let likes = 0, passes = 0, matches = 0;

  // Dismiss any popups before navigating (e.g. privacy dialog)
  await dismissPopups(page);

  // Navigate to recs
  await page.goto('https://tinder.com/app/recs', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await dismissPopups(page);

  for (let i = 0; i < count; i++) {
    logger.info(`Swipe ${i + 1}/${count}`);

    const profile = await readCurrentProfile(page);
    if (profile) {
      logger.info(`  ${profile.name}, ${profile.age} - ${profile.bio?.slice(0, 60) || '(no bio)'}`);
    } else {
      logger.warn('  Could not read profile, trying to continue...');
      await dismissPopups(page);
      await page.waitForTimeout(2000);
    }

    // Decide like or pass
    const shouldLike = Math.random() < likeRatio;

    if (shouldLike) {
      const success = await swipeRight(page);
      if (success) likes++;
    } else {
      const success = await swipeLeft(page);
      if (success) passes++;
    }

    // Delay between swipes
    await randomDelay(delayBetweenSwipes.min, delayBetweenSwipes.max);

    // Occasional long pause
    if (Math.random() < longPauseChance) {
      const pause = Math.floor(Math.random() * (longPauseRange.max - longPauseRange.min) + longPauseRange.min);
      logger.info(`  Taking a break for ${Math.round(pause / 1000)}s...`);
      await new Promise(r => setTimeout(r, pause));
    }

    await dismissPopups(page);
  }

  logger.info(`Swipe session complete: ${likes} likes, ${passes} passes, ${matches} matches`);
  return { likes, passes, matches };
}
