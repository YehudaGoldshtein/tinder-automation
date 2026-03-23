import { Page } from 'playwright';
import { getMatches, openMatchById } from './matches';
import { readMessages, sendMessage } from './messages';
import { loadState, saveState } from '../data/store';
import config from '../config';
import { humanDelay, randomDelay } from '../utils/delay';
import logger from '../utils/logger';

function pickOpener(name: string): string {
  const templates = config.messages.openers;
  const template = templates[Math.floor(Math.random() * templates.length)];
  return template.replace(/\{\{name\}\}/g, name);
}

function pickFollowUp(): string {
  const templates = config.messages.followUp.templates;
  return templates[Math.floor(Math.random() * templates.length)];
}

/** Send openers to uncontacted matches */
export async function sendOpeners(page: Page): Promise<number> {
  const state = loadState();
  const matches = await getMatches(page);
  let sent = 0;

  for (let i = 0; i < matches.length && sent < config.messages.maxNewOpeners; i++) {
    const match = matches[i];

    // Skip already contacted
    if (state.contactedMatches.includes(match.name)) continue;

    // Open the conversation
    if (!(await openMatchById(page, match.id))) continue;
    await humanDelay();

    // Check if conversation is empty (no messages yet)
    const messages = await readMessages(page);
    if (messages.length > 0) {
      // Already has messages, mark as contacted
      state.contactedMatches.push(match.name);
      continue;
    }

    // Send opener
    const opener = pickOpener(match.name);
    const success = await sendMessage(page, opener);
    if (success) {
      state.contactedMatches.push(match.name);
      sent++;
      logger.info(`Opener sent to ${match.name}: "${opener}"`);
    }

    await randomDelay(3000, 8000);
  }

  saveState(state);
  logger.info(`Sent ${sent} openers`);
  return sent;
}

/** Follow up on stale conversations */
export async function sendFollowUps(page: Page): Promise<number> {
  const matches = await getMatches(page);
  let sent = 0;

  for (let i = 0; i < matches.length; i++) {
    if (!(await openMatchById(page, matches[i].id))) continue;
    await humanDelay();

    const messages = await readMessages(page);
    if (messages.length === 0) continue;

    // Check if last message is from me and old enough to follow up
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.from === 'me') {
      // We already sent the last message, could follow up
      // For now, skip — more sophisticated time-based logic would go here
      continue;
    }

    // Last message is from them — they replied! Skip follow up.
    // (In a more advanced version, we'd handle conversation continuation here)

    await randomDelay(2000, 5000);
  }

  logger.info(`Sent ${sent} follow-ups`);
  return sent;
}
