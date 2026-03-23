import { Command } from 'commander';
import { launchBrowser, closeBrowser } from './browser';
import { isLoggedIn, waitForManualLogin } from './actions/auth';
import { swipeSession } from './actions/swipe';
import { getMatches } from './actions/matches';
import { sendOpeners } from './actions/opener';
import { runDailyRoutine } from './routines/daily';
import { loadState, todayStats } from './data/store';
import logger from './utils/logger';

const program = new Command();

program.name('tinder-auto').description('Playwright-based Tinder automation').version('1.0.0');

program
  .command('login')
  .description('Open browser for manual Tinder login')
  .action(async () => {
    const { page } = await launchBrowser(false); // Always visible for login
    const loggedIn = await isLoggedIn(page);
    if (loggedIn) {
      logger.info('Already logged in!');
    } else {
      await waitForManualLogin(page);
    }
    logger.info('Login session saved. You can close this or press Ctrl+C.');
    // Keep browser open so user can verify
    await new Promise(() => {}); // Wait forever until Ctrl+C
  });

program
  .command('swipe')
  .description('Run a swiping session')
  .option('-c, --count <n>', 'Number of swipes', '20')
  .action(async (opts) => {
    const { page } = await launchBrowser();
    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      logger.error('Not logged in! Run "tinder-auto login" first.');
      await closeBrowser();
      return;
    }
    await swipeSession(page, parseInt(opts.count));
    await closeBrowser();
  });

program
  .command('matches')
  .description('List current matches')
  .action(async () => {
    const { page } = await launchBrowser();
    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      logger.error('Not logged in!');
      await closeBrowser();
      return;
    }
    const matches = await getMatches(page);
    matches.forEach((m, i) => logger.info(`${i + 1}. ${m.name}`));
    await closeBrowser();
  });

program
  .command('opener')
  .description('Send openers to uncontacted matches')
  .action(async () => {
    const { page } = await launchBrowser();
    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      logger.error('Not logged in!');
      await closeBrowser();
      return;
    }
    await sendOpeners(page);
    await closeBrowser();
  });

program
  .command('daily')
  .description('Run the full daily routine')
  .action(async () => {
    const { page } = await launchBrowser();
    await runDailyRoutine(page);
    await closeBrowser();
  });

program
  .command('status')
  .description('Show login status and today\'s stats')
  .action(async () => {
    const { page } = await launchBrowser();
    const loggedIn = await isLoggedIn(page);
    logger.info(`Logged in: ${loggedIn}`);
    if (loggedIn) {
      const state = loadState();
      const stats = todayStats(state);
      logger.info(`Today: ${stats.swipes} swipes, ${stats.likes} likes, ${stats.openersSent} openers`);
    }
    await closeBrowser();
  });

program.parse();
