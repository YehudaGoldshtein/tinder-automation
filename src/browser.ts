import { chromium, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import config from './config';
import logger from './utils/logger';

let context: BrowserContext | null = null;
let page: Page | null = null;

const LOCK_FILE = path.join(config.browser.userDataDir, '.mcp-lock');

function acquireLock(): boolean {
  try {
    // Write our PID to the lock file exclusively
    fs.mkdirSync(config.browser.userDataDir, { recursive: true });
    fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: 'wx' });
    return true;
  } catch {
    // Lock file exists — check if the owning process is still alive
    try {
      const pid = parseInt(fs.readFileSync(LOCK_FILE, 'utf-8').trim(), 10);
      if (pid && pid !== process.pid) {
        try {
          process.kill(pid, 0); // Check if process exists
          logger.error(`Another MCP instance (PID ${pid}) holds the browser lock`);
          return false;
        } catch {
          // Process is dead, steal the lock
          logger.info(`Stale lock from PID ${pid}, taking over`);
          fs.writeFileSync(LOCK_FILE, String(process.pid));
          return true;
        }
      }
      return true; // Our own PID
    } catch {
      // Can't read lock file, overwrite it
      fs.writeFileSync(LOCK_FILE, String(process.pid));
      return true;
    }
  }
}

function releaseLock(): void {
  try {
    const content = fs.readFileSync(LOCK_FILE, 'utf-8').trim();
    if (content === String(process.pid)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch {
    // ignore
  }
}

export async function launchBrowser(headless?: boolean): Promise<{ context: BrowserContext; page: Page }> {
  const isHeadless = headless ?? config.browser.headless;

  logger.info(`Launching browser (headless: ${isHeadless})`);
  logger.info(`Using userDataDir: ${config.browser.userDataDir}`);

  if (!acquireLock()) {
    throw new Error('Another MCP instance is already using the browser. Aborting launch.');
  }

  try {
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
  } catch (err: any) {
    releaseLock();
    logger.error(`Browser launch failed: ${err.message}`);
    throw err;
  }

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
    releaseLock();
    logger.info('Browser closed');
  }
}

export function isBrowserAlive(): boolean {
  try {
    if (!context || !page) return false;
    return context.pages().length > 0;
  } catch {
    return false;
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

// Clean up lock on exit
process.on('exit', releaseLock);
