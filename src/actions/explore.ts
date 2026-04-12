import { Page } from 'playwright';
import { dismissPopups } from './popups';
import { swipeBlindly } from './swipe';
import { randomize } from '../utils/delay';
import logger from '../utils/logger';

const SKIP_CATEGORIES = ['Long-term partner'];

export interface ExploreCategory {
  name: string;
  type: 'category' | 'goal';
}

const CATEGORY_BUTTON_SELECTOR = 'button.focus-button-style[aria-label]';

/** Navigate to /app/explore and scrape available categories */
export async function getExploreCategories(page: Page): Promise<ExploreCategory[]> {
  await page.goto('https://tinder.com/app/explore', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(randomize(3000));
  await dismissPopups(page);

  const labels: string[] = await page.evaluate((sel) => {
    const buttons = document.querySelectorAll(sel);
    return Array.from(buttons).map(btn => btn.getAttribute('aria-label') || '');
  }, CATEGORY_BUTTON_SELECTOR);

  logger.info(`[getExploreCategories] Found ${labels.length} buttons`);

  const categories: ExploreCategory[] = labels.map((label) => {
    const isTryNow = label.includes('- TRY NOW');
    const name = label.replace(/ - TRY NOW$/, '').replace(/ - undefined$/, '').trim();
    return { name, type: isTryNow ? 'category' : 'goal' };
  });

  logger.info(`[getExploreCategories] Parsed ${categories.length} categories: ${categories.map(c => c.name).join(', ')}`);
  return categories;
}

/** Click a category by name to enter its swipe page */
export async function enterExploreCategory(page: Page, categoryName: string): Promise<string | null> {
  // Ensure we're on the explore page
  if (!page.url().includes('/app/explore') || page.url().match(/\/app\/explore\/.+/)) {
    await page.goto('https://tinder.com/app/explore', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(randomize(3000));
    await dismissPopups(page);
  }

  const clicked = await page.evaluate((args) => {
    const buttons = document.querySelectorAll(args.sel);
    for (const btn of Array.from(buttons)) {
      const label = btn.getAttribute('aria-label') || '';
      const name = label.replace(/ - TRY NOW$/, '').replace(/ - undefined$/, '').trim();
      if (name.toLowerCase() === args.name.toLowerCase()) {
        (btn as HTMLElement).click();
        return true;
      }
    }
    return false;
  }, { sel: CATEGORY_BUTTON_SELECTOR, name: categoryName });

  if (!clicked) {
    logger.warn(`[enterExploreCategory] Category "${categoryName}" not found`);
    return null;
  }

  await page.waitForTimeout(randomize(2500));
  const url = page.url();
  logger.info(`[enterExploreCategory] Entered "${categoryName}" -> ${url}`);
  return url;
}

export interface ExploreSweepResult {
  totalSwiped: number;
  totalLikes: number;
  totalPasses: number;
  totalMatches: number;
  perCategory: Array<{ name: string; likes: number; passes: number; matches: number; swiped: number }>;
  skipped: string[];
}

/** Swipe blindly across all explore categories, accumulating count across them */
export async function sweepExploreCategories(
  page: Page,
  count: number,
  likeChance: number
): Promise<ExploreSweepResult> {
  const categories = await getExploreCategories(page);
  const unlimited = count === -1;
  let remaining = count;
  let totalSwiped = 0, totalLikes = 0, totalPasses = 0, totalMatches = 0;
  const perCategory: ExploreSweepResult['perCategory'] = [];
  const skipped: string[] = [];

  for (const cat of categories) {
    if (!unlimited && remaining <= 0) break;

    if (SKIP_CATEGORIES.some(s => s.toLowerCase() === cat.name.toLowerCase())) {
      logger.info(`[sweepExploreCategories] Skipping "${cat.name}"`);
      skipped.push(cat.name);
      continue;
    }

    const entered = await enterExploreCategory(page, cat.name);
    if (!entered) {
      logger.warn(`[sweepExploreCategories] Could not enter "${cat.name}", skipping`);
      skipped.push(cat.name);
      continue;
    }

    const catCount = unlimited ? -1 : remaining;
    const result = await swipeBlindly(page, catCount, likeChance);

    perCategory.push({ name: cat.name, likes: result.likes, passes: result.passes, matches: result.matches, swiped: result.total });
    totalSwiped += result.total;
    totalLikes += result.likes;
    totalPasses += result.passes;
    totalMatches += result.matches;
    if (!unlimited) remaining -= result.total;

    logger.info(`[sweepExploreCategories] "${cat.name}": ${result.total} swiped (${result.likes}L/${result.passes}P). Total: ${totalSwiped}`);
  }

  logger.info(`[sweepExploreCategories] Done: ${totalSwiped} total (${totalLikes}L/${totalPasses}P/${totalMatches}M) across ${perCategory.length} categories`);
  return { totalSwiped, totalLikes, totalPasses, totalMatches, perCategory, skipped };
}
