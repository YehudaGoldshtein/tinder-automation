import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { launchBrowser, closeBrowser, getPage } from './browser';
import { isLoggedIn, waitForManualLogin } from './actions/auth';
import { dismissPopups } from './actions/popups';
import { readCurrentProfile, swipeRight, swipeLeft, swipeSession } from './actions/swipe';
import { getMatches, openMatchById } from './actions/matches';
import { readMessages, sendMessage } from './actions/messages';
import { sendOpeners, sendFollowUps } from './actions/opener';
import { scanProfile } from './actions/profile-scan';
import { getConversationsSince } from './actions/conversation-list';
import { runDailyRoutine } from './routines/daily';
import logger from './utils/logger';

let browserReady = false;

async function ensureBrowser(): Promise<void> {
  if (!browserReady) {
    await launchBrowser(false);
    browserReady = true;
  }
}

const server = new McpServer({
  name: 'tinder-auto',
  version: '1.0.0',
});

// --- Status / Auth ---

server.tool('tinder_status', 'Check if logged in and browser is running', {}, async () => {
  await ensureBrowser();
  const page = getPage();
  const loggedIn = await isLoggedIn(page);
  return { content: [{ type: 'text', text: JSON.stringify({ loggedIn, url: page.url() }) }] };
});

server.tool('tinder_login', 'Open browser for manual Tinder login', {}, async () => {
  await ensureBrowser();
  const page = getPage();
  const loggedIn = await isLoggedIn(page);
  if (loggedIn) {
    return { content: [{ type: 'text', text: 'Already logged in!' }] };
  }
  await waitForManualLogin(page);
  return { content: [{ type: 'text', text: 'Login successful! Session saved.' }] };
});

// --- Swiping ---

server.tool(
  'tinder_get_profile',
  'Read the current profile on the swipe stack (name, age, bio, distance)',
  {},
  async () => {
    await ensureBrowser();
    const page = getPage();
    await page.goto('https://tinder.com/app/recs', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await dismissPopups(page);
    const profile = await readCurrentProfile(page);
    return {
      content: [{ type: 'text', text: profile ? JSON.stringify(profile) : 'Could not read profile' }],
    };
  }
);

server.tool('tinder_like', 'Like (swipe right) the current profile', {}, async () => {
  await ensureBrowser();
  const page = getPage();
  const profile = await readCurrentProfile(page);
  const success = await swipeRight(page);
  return {
    content: [{
      type: 'text',
      text: success
        ? `Liked ${profile?.name || 'unknown'}`
        : 'Failed to like',
    }],
  };
});

server.tool('tinder_pass', 'Pass (swipe left) on the current profile', {}, async () => {
  await ensureBrowser();
  const page = getPage();
  const profile = await readCurrentProfile(page);
  const success = await swipeLeft(page);
  return {
    content: [{
      type: 'text',
      text: success
        ? `Passed on ${profile?.name || 'unknown'}`
        : 'Failed to pass',
    }],
  };
});

server.tool(
  'tinder_swipe_session',
  'Run an automated swiping session for N profiles',
  { count: z.number().describe('Number of profiles to swipe through') },
  async ({ count }) => {
    await ensureBrowser();
    const page = getPage();
    const result = await swipeSession(page, count);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

// --- Matches ---

server.tool('tinder_get_matches', 'Get list of all matches and conversations', {}, async () => {
  await ensureBrowser();
  const page = getPage();
  const matches = await getMatches(page);
  const summary = matches.map((m, i) => {
    const tag = m.isNew ? ' [NEW]' : '';
    const preview = m.lastMessage ? ` — "${m.lastMessage.slice(0, 60)}"` : '';
    return `${i + 1}. ${m.name}${tag}${preview}`;
  });
  return {
    content: [{
      type: 'text',
      text: `${matches.length} matches:\n${summary.join('\n')}`,
    }],
  };
});

// --- Messages ---

server.tool(
  'tinder_read_messages',
  'Read messages in a conversation with a match',
  { name: z.string().describe('Name of the match to read messages from') },
  async ({ name }) => {
    await ensureBrowser();
    const page = getPage();
    const matches = await getMatches(page);
    const match = matches.find(m => m.name.toLowerCase() === name.toLowerCase());
    if (!match) {
      return { content: [{ type: 'text', text: `Match "${name}" not found` }] };
    }
    await openMatchById(page, match.id);
    await page.waitForTimeout(2000);
    await dismissPopups(page);
    const messages = await readMessages(page);
    const formatted = messages.map(m => `${m.from === 'me' ? 'YOU' : 'THEM'}: ${m.text}`);
    return {
      content: [{
        type: 'text',
        text: formatted.length > 0
          ? `Conversation with ${match.name}:\n${formatted.join('\n')}`
          : `No messages yet with ${match.name}`,
      }],
    };
  }
);

server.tool(
  'tinder_send_message',
  'Send a message to a match',
  {
    name: z.string().describe('Name of the match to message'),
    message: z.string().describe('The message to send'),
  },
  async ({ name, message }) => {
    await ensureBrowser();
    const page = getPage();
    const matches = await getMatches(page);
    const match = matches.find(m => m.name.toLowerCase() === name.toLowerCase());
    if (!match) {
      return { content: [{ type: 'text', text: `Match "${name}" not found` }] };
    }
    await openMatchById(page, match.id);
    await page.waitForTimeout(2000);
    await dismissPopups(page);
    const success = await sendMessage(page, message);
    return {
      content: [{
        type: 'text',
        text: success
          ? `Message sent to ${match.name}: "${message}"`
          : `Failed to send message to ${match.name}`,
      }],
    };
  }
);

// --- Profile Scan ---

server.tool(
  'tinder_scan_profile',
  'Full profile scan: photos, bio, interests, lifestyle, basics, looking for, and all messages with a match',
  { name: z.string().describe('Name of the match to scan') },
  async ({ name }) => {
    await ensureBrowser();
    const page = getPage();
    const matches = await getMatches(page);
    const match = matches.find(m => m.name.toLowerCase() === name.toLowerCase());
    if (!match) {
      return { content: [{ type: 'text', text: `Match "${name}" not found` }] };
    }
    await openMatchById(page, match.id);
    await page.waitForTimeout(2000);
    await dismissPopups(page);
    const profile = await scanProfile(page);

    // Format output
    const lines: string[] = [];
    lines.push(`=== ${profile.name || name}, ${profile.age} ===`);
    if (profile.distance) lines.push(`Distance: ${profile.distance}`);
    if (profile.bio) lines.push(`Bio: ${profile.bio}`);
    if (profile.lookingFor) lines.push(`Looking for: ${profile.lookingFor}`);

    if (profile.photos.length > 0) {
      lines.push(`\nPhotos (${profile.photos.length}):`);
      profile.photos.forEach((p, i) => lines.push(`  ${i + 1}. ${p}`));
    }

    if (Object.keys(profile.essentials).length > 0) {
      lines.push('\nEssentials:');
      for (const [k, v] of Object.entries(profile.essentials)) lines.push(`  ${k}: ${v}`);
    }
    if (Object.keys(profile.lifestyle).length > 0) {
      lines.push('\nLifestyle:');
      for (const [k, v] of Object.entries(profile.lifestyle)) lines.push(`  ${k}: ${v}`);
    }
    if (Object.keys(profile.basics).length > 0) {
      lines.push('\nBasics:');
      for (const [k, v] of Object.entries(profile.basics)) lines.push(`  ${k}: ${v}`);
    }
    if (profile.interests.length > 0) {
      lines.push(`\nInterests: ${profile.interests.join(', ')}`);
    }

    if (profile.messages.length > 0) {
      lines.push(`\nMessages (${profile.messages.length}):`);
      profile.messages.forEach(m => {
        const who = m.from === 'me' ? 'YOU' : 'THEM';
        const time = m.time ? ` [${m.time}]` : '';
        lines.push(`  ${who}${time}: ${m.text}`);
      });
    } else {
      lines.push('\nNo messages yet.');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// --- Conversation List ---

server.tool(
  'tinder_conversations_since',
  'Get list of all conversations with profile/conversation URLs since a given date. Returns name, matchId, URLs, last message, date, and sender.',
  { since: z.string().optional().describe('ISO date string (e.g. "2026-03-01"). If omitted, returns all conversations.') },
  async ({ since }) => {
    await ensureBrowser();
    const page = getPage();
    const convs = await getConversationsSince(page, since);

    const lines = convs.map((c, i) => {
      const from = c.lastMessageFrom === 'me' ? '(you)' : c.lastMessageFrom === 'them' ? '(them)' : '';
      return `${i + 1}. ${c.name} ${c.lastMessageDate ? `[${c.lastMessageDate}]` : ''} ${from}\n   Last: "${c.lastMessage.slice(0, 60)}"\n   URL: ${c.conversationUrl}`;
    });

    return {
      content: [{
        type: 'text',
        text: `${convs.length} conversations${since ? ` since ${since}` : ''}:\n\n${lines.join('\n\n')}`,
      }],
    };
  }
);

// --- Auto routines ---

server.tool('tinder_send_openers', 'Send opener messages to new uncontacted matches', {}, async () => {
  await ensureBrowser();
  const page = getPage();
  const count = await sendOpeners(page);
  return { content: [{ type: 'text', text: `Sent ${count} opener messages` }] };
});

server.tool('tinder_daily_routine', 'Run the full daily routine (swipe + openers + follow-ups)', {}, async () => {
  await ensureBrowser();
  const page = getPage();
  await runDailyRoutine(page);
  return { content: [{ type: 'text', text: 'Daily routine completed!' }] };
});

server.tool('tinder_close', 'Close the browser', {}, async () => {
  await closeBrowser();
  browserReady = false;
  return { content: [{ type: 'text', text: 'Browser closed' }] };
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('Tinder MCP server running on stdio');
}

main().catch(console.error);
