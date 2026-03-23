import { Page } from 'playwright';
import { S } from '../selectors';
import logger from '../utils/logger';

const TINDER_APP_URL = 'https://tinder.com/app/recs';

/** Navigate to Tinder and check if we're logged in */
export async function isLoggedIn(page: Page): Promise<boolean> {
  await page.goto(TINDER_APP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Wait for redirect/load to settle
  await page.waitForTimeout(3000);

  // Check if we ended up on an app page (logged in) or login/landing page
  const url = page.url();
  if (url.includes('/app/')) {
    logger.info(`On app page: ${url}`);
    return true;
  }

  // Fallback: check for nav elements
  try {
    await page.waitForSelector(S.LOGGED_IN_INDICATOR, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Manual login flow: opens visible browser, waits for user to log in.
 * Returns when login is detected.
 */
export async function waitForManualLogin(page: Page): Promise<void> {
  logger.info('Navigating to Tinder...');
  await page.goto('https://tinder.com', { waitUntil: 'domcontentloaded' });

  // Check if already logged in (auto-redirect to /app/)
  await page.waitForTimeout(3000);
  if (page.url().includes('/app/')) {
    logger.info('Already logged in!');
    return;
  }

  logger.info('==============================================');
  logger.info(' Please log in to Tinder manually in the browser window.');
  logger.info(' Waiting for login to complete...');
  logger.info('==============================================');

  // Wait up to 5 minutes for URL to change to /app/
  await page.waitForURL('**/app/**', { timeout: 300000 });
  logger.info('Login detected! Session saved for future runs.');
}
