import { Page } from 'playwright';
import { isLoggedIn } from '../actions/auth';
import { dismissPopups } from '../actions/popups';
import { swipeSession } from '../actions/swipe';
import { sendOpeners, sendFollowUps } from '../actions/opener';
import { loadState, saveState, todayStats } from '../data/store';
import config from '../config';
import logger from '../utils/logger';

export async function runDailyRoutine(page: Page): Promise<void> {
  logger.info('========================================');
  logger.info(' Starting daily routine');
  logger.info('========================================');

  // 1. Check login
  const loggedIn = await isLoggedIn(page);
  if (!loggedIn) {
    logger.error('Not logged in! Run "tinder-auto login" first.');
    return;
  }
  logger.info('Session valid, logged in.');

  // 2. Dismiss any initial popups
  await dismissPopups(page);

  const state = loadState();
  const stats = todayStats(state);

  // 3. Swipe session
  const remaining = config.swipe.dailyLimit - stats.swipes;
  if (remaining > 0) {
    logger.info(`Swiping ${remaining} profiles...`);
    const result = await swipeSession(page, remaining);
    stats.swipes += result.likes + result.passes;
    stats.likes += result.likes;
    stats.passes += result.passes;
    stats.newMatches += result.matches;
  } else {
    logger.info('Daily swipe limit already reached.');
  }

  // 4. Send openers to new matches
  logger.info('Checking for new matches to open...');
  const openersSent = await sendOpeners(page);
  stats.openersSent += openersSent;

  // 5. Follow up on stale conversations
  logger.info('Checking for stale conversations...');
  const followUpsSent = await sendFollowUps(page);
  stats.followUpsSent += followUpsSent;

  // Save state
  saveState(state);

  logger.info('========================================');
  logger.info(' Daily routine complete!');
  logger.info(` Swipes: ${stats.swipes} (${stats.likes}L / ${stats.passes}P)`);
  logger.info(` Matches: ${stats.newMatches}`);
  logger.info(` Openers sent: ${stats.openersSent}`);
  logger.info(` Follow-ups sent: ${stats.followUpsSent}`);
  logger.info('========================================');
}
