import { Page } from 'playwright';
import { S } from '../selectors';
import { randomize } from '../utils/delay';
import logger from '../utils/logger';

/** Try to dismiss any popups/modals that Tinder throws at us */
export async function dismissPopups(page: Page): Promise<void> {
  // First: dismiss the Privacy Preferences / cookie banner
  try {
    const privacyDialog = page.locator('[aria-label="Privacy Preferences"]');
    if (await privacyDialog.isVisible({ timeout: 500 })) {
      // Click "I Accept" or "Decline" or any dismiss button in the dialog
      const acceptBtn = privacyDialog.locator('button:has-text("I Accept"), button:has-text("Accept"), button:has-text("Decline"), button:has-text("OK")').first();
      if (await acceptBtn.isVisible({ timeout: 500 })) {
        await acceptBtn.click();
        logger.info('Dismissed Privacy Preferences dialog');
        await page.waitForTimeout(randomize(500));
      }
    }
  } catch { /* not visible */ }

  const dismissSelectors = [
    S.NOT_INTERESTED,
    S.MAYBE_LATER,
    S.MODAL_CLOSE,
    S.KEEP_SWIPING,
  ];

  for (const selector of dismissSelectors) {
    try {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 500 })) {
        await btn.click();
        logger.info(`Dismissed popup: ${selector}`);
        // Wait a beat, then check for more popups
        await page.waitForTimeout(randomize(500));
      }
    } catch {
      // Not visible, move on
    }
  }
}

/** Check if "It's a Match" popup is showing */
export async function isMatchPopup(page: Page): Promise<boolean> {
  try {
    return await page.locator(S.ITS_A_MATCH).isVisible({ timeout: 1000 });
  } catch {
    return false;
  }
}

/** Dismiss match popup and return true if it was showing */
export async function dismissMatchPopup(page: Page): Promise<boolean> {
  if (await isMatchPopup(page)) {
    logger.info('Match popup detected!');
    try {
      // Click "Keep Swiping" or close
      const keepSwiping = page.locator('button:has-text("Keep Swiping")');
      if (await keepSwiping.isVisible({ timeout: 1000 })) {
        await keepSwiping.click();
      } else {
        await dismissPopups(page);
      }
      return true;
    } catch {
      await dismissPopups(page);
      return true;
    }
  }
  return false;
}
