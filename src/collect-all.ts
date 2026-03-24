import fs from 'fs';
import path from 'path';
import { launchBrowser, closeBrowser } from './browser';
import { isLoggedIn } from './actions/auth';
import { getMatches, openMatchById } from './actions/matches';
import { dismissPopups } from './actions/popups';
import { scanProfile } from './actions/profile-scan';
import logger from './utils/logger';

const OUTPUT_DIR = path.resolve(__dirname, '..', 'data', 'profiles');

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const { page } = await launchBrowser(false);
  const loggedIn = await isLoggedIn(page);
  if (!loggedIn) { logger.error('Not logged in!'); await closeBrowser(); return; }

  // Get all matches
  const matches = await getMatches(page);
  const conversations = matches.filter(m => !m.isNew);
  logger.info(`Scanning ${conversations.length} conversations...`);

  // Load existing profiles to skip already-scanned ones
  const existingIds = new Set<string>();
  const existingFiles = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  for (const file of existingFiles) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, file), 'utf-8'));
      if (data.matchId) existingIds.add(data.matchId);
    } catch { /* skip */ }
  }
  logger.info(`Already scanned: ${existingIds.size} profiles, skipping those`);

  const allProfiles: any[] = [];
  let scanned = 0;
  let skipped = 0;
  let failed = 0;

  for (const match of conversations) {
    scanned++;

    if (existingIds.has(match.id)) {
      skipped++;
      continue;
    }

    logger.info(`\n[${scanned}/${conversations.length}] Scanning: ${match.name}`);

    try {
      await openMatchById(page, match.id);
      await page.waitForTimeout(2000);
      await dismissPopups(page);

      const profile = await scanProfile(page);

      const entry = {
        matchId: match.id,
        conversationUrl: `https://tinder.com/app/messages/${match.id}`,
        scannedAt: new Date().toISOString(),
        ...profile,
      };

      allProfiles.push(entry);

      // Save individual profile
      const safeName = match.name.replace(/[^a-zA-Z0-9]/g, '_');
      const filePath = path.join(OUTPUT_DIR, `${safeName}_${match.id.slice(0, 8)}.json`);
      fs.writeFileSync(filePath, JSON.stringify(entry, null, 2));
      logger.info(`  Saved: ${filePath}`);
    } catch (e) {
      failed++;
      logger.error(`  Failed to scan ${match.name}: ${e}`);
    }
  }

  // Reload all profiles for combined file
  const allFiles = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  const combined: any[] = [];
  for (const file of allFiles) {
    try {
      combined.push(JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, file), 'utf-8')));
    } catch { /* skip */ }
  }

  // Save combined file
  const combinedPath = path.join(OUTPUT_DIR, '_all_profiles.json');
  fs.writeFileSync(combinedPath, JSON.stringify(combined, null, 2));

  logger.info(`\n=== DONE ===`);
  logger.info(`Total conversations: ${conversations.length}`);
  logger.info(`Skipped (already scanned): ${skipped}`);
  logger.info(`New scans: ${scanned - skipped - failed}`);
  logger.info(`Failed: ${failed}`);
  logger.info(`Saved to: ${combinedPath}`);

  await closeBrowser();
}

main().catch(console.error);
