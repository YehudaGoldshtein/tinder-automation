import { Page } from 'playwright';
import { S } from '../selectors';
import { Profile } from '../types';
import { randomDelay, humanDelay, actionPause, readingDelay, randomize } from '../utils/delay';
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

  // Navigate to recs only if not already on a swipe-capable page (recs or explore category)
  const url = page.url();
  const onSwipePage = url.includes('/app/recs') || url.includes('/app/explore');
  if (!onSwipePage) {
    await page.goto('https://tinder.com/app/recs', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(randomize(3000));
    await dismissPopups(page);
  }

  for (let i = 0; i < count; i++) {
    logger.info(`Swipe ${i + 1}/${count}`);

    const profile = await readCurrentProfile(page);
    if (profile) {
      logger.info(`  ${profile.name}, ${profile.age} - ${profile.bio?.slice(0, 60) || '(no bio)'}`);
      // Simulate looking at the profile (reading bio, checking photos)
      if (profile.bio) {
        await readingDelay(profile.bio);
      } else {
        await actionPause(); // 5-12s looking at photos
      }
      // Sometimes browse photos (click next photo)
      if (Math.random() < 0.4) {
        const photoCount = Math.floor(Math.random() * 3) + 1;
        for (let p = 0; p < photoCount; p++) {
          try {
            await page.locator('[aria-label="Next Photo"]').first().click();
            await randomDelay(randomize(1500, 0.3), randomize(4000, 0.3));
          } catch { break; }
        }
      }
    } else {
      logger.warn('  Could not read profile, trying to continue...');
      await dismissPopups(page);
      await actionPause();
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

    // Human-like delay between swipes (5-15 seconds base, randomized)
    await randomDelay(
      randomize(Math.max(delayBetweenSwipes.min, 5000), 0.3),
      randomize(Math.max(delayBetweenSwipes.max, 15000), 0.3)
    );

    // Occasional long pause (10% chance, 30-120 seconds)
    if (Math.random() < longPauseChance) {
      const pause = Math.floor(Math.random() * (longPauseRange.max - longPauseRange.min) + longPauseRange.min);
      logger.info(`  Taking a break for ${Math.round(pause / 1000)}s...`);
      await new Promise(r => setTimeout(r, pause));
    }

    // Very rare "distraction" pause (3% chance, 2-5 minutes — like checking another app)
    if (Math.random() < 0.03) {
      const longBreak = Math.floor(120000 + Math.random() * 180000);
      logger.info(`  Long distraction break for ${Math.round(longBreak / 1000)}s...`);
      await new Promise(r => setTimeout(r, longBreak));
    }

    await dismissPopups(page);
  }

  logger.info(`Swipe session complete: ${likes} likes, ${passes} passes, ${matches} matches`);
  return { likes, passes, matches };
}

/** Swipe blindly without reading profiles. count=-1 means until out of profiles. */
export async function swipeBlindly(
  page: Page,
  count: number,
  likeChance: number
): Promise<{ likes: number; passes: number; matches: number; total: number }> {
  const ratio = Math.max(0, Math.min(100, likeChance)) / 100;
  let likes = 0, passes = 0, matches = 0, total = 0;
  const unlimited = count === -1;
  let consecutiveFails = 0;

  await dismissPopups(page);

  const url = page.url();
  const onSwipePage = url.includes('/app/recs') || url.includes('/app/explore');
  if (!onSwipePage) {
    await page.goto('https://tinder.com/app/recs', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(randomize(3000));
    await dismissPopups(page);
  }

  while (unlimited || total < count) {
    const shouldLike = Math.random() < ratio;

    let success: boolean;
    if (shouldLike) {
      success = await swipeRight(page);
      if (success) likes++;
    } else {
      success = await swipeLeft(page);
      if (success) passes++;
    }

    if (success) {
      consecutiveFails = 0;
      total++;
      if (total % 10 === 0) {
        logger.info(`[swipeBlindly] Progress: ${total} swiped (${likes} likes, ${passes} passes)`);
      }
    } else {
      consecutiveFails++;
      await dismissPopups(page);

      // Check for "out of profiles" message
      const outOfProfiles = await page.evaluate(() =>
        document.body.innerText.includes("We've run out of potential matches")
      );
      if (outOfProfiles) {
        logger.info(`[swipeBlindly] "We've run out of potential matches" detected`);
        break;
      }

      if (consecutiveFails >= 3) {
        logger.info(`[swipeBlindly] 3 consecutive fails — out of profiles`);
        break;
      }
    }

    // Brief delay to avoid detection
    await page.waitForTimeout(randomize(800, 0.4));
  }

  logger.info(`[swipeBlindly] Done: ${total} swiped (${likes} likes, ${passes} passes, ${matches} matches)`);
  return { likes, passes, matches, total };
}
