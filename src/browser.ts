import { chromium, BrowserContext, Page } from 'playwright';
import config from './config';
import logger from './utils/logger';

let context: BrowserContext | null = null;
let page: Page | null = null;

export async function launchBrowser(headless?: boolean): Promise<{ context: BrowserContext; page: Page }> {
  const isHeadless = headless ?? config.browser.headless;

  logger.info(`Launching browser (headless: ${isHeadless})`);

  context = await chromium.launchPersistentContext(config.browser.userDataDir, {
    headless: isHeadless,
    slowMo: config.browser.slowMo,
    viewport: config.browser.viewport,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/Asuncion',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--no-first-run',
    ],
  });

  // Use existing page or create new one
  page = context.pages()[0] || (await context.newPage());

  // Remove webdriver flag
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  return { context, page };
}

export async function closeBrowser(): Promise<void> {
  if (context) {
    await context.close();
    context = null;
    page = null;
    logger.info('Browser closed');
  }
}

export function getPage(): Page {
  if (!page) throw new Error('Browser not launched. Call launchBrowser() first.');
  return page;
}

export function getContext(): BrowserContext {
  if (!context) throw new Error('Browser not launched. Call launchBrowser() first.');
  return context;
}
