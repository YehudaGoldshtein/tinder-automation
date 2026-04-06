import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { launchBrowser, closeBrowser, getPage, isBrowserAlive } from './browser';
import { isLoggedIn, waitForManualLogin } from './actions/auth';
import { dismissPopups } from './actions/popups';
import { readCurrentProfile, swipeRight, swipeLeft, swipeSession } from './actions/swipe';
import { getMatches, openMatchById, resolveMatch } from './actions/matches';
import { readMessages, sendMessage } from './actions/messages';
import { scanProfile } from './actions/profile-scan';
import { getConversationsSince } from './actions/conversation-list';
import { runDailyRoutine } from './routines/daily';
import { randomize } from './utils/delay';
import logger from './utils/logger';

const DEFAULT_TIMEOUT_MS = 60000;

/** Strip unpaired UTF-16 surrogates that break JSON serialization */
function sanitize(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
}

type ToolResult = { content: { type: 'text'; text: string }[] };

/** Wrap a tool handler with timeout + logging */
function withTimeout(
  toolName: string,
  fn: () => Promise<ToolResult>,
  timeoutMs: number
): Promise<ToolResult> {
  const start = Date.now();
  logger.info(`[${toolName}] START (timeout: ${timeoutMs}ms)`);

  const work = fn().then(result => {
    const elapsed = Date.now() - start;
    const preview = result.content[0]?.text?.slice(0, 100) || '';
    logger.info(`[${toolName}] OK (${elapsed}ms) ${preview}`);
    return result;
  });

  const timeout = new Promise<ToolResult>((resolve) => {
    setTimeout(() => {
      const elapsed = Date.now() - start;
      const msg = `[${toolName}] TIMEOUT after ${elapsed}ms`;
      logger.error(msg);
      resolve({ content: [{ type: 'text', text: `Error: ${toolName} timed out after ${timeoutMs}ms` }] });
    }, timeoutMs);
  });

  return Promise.race([work, timeout]).catch(err => {
    const elapsed = Date.now() - start;
    const msg = `[${toolName}] ERROR (${elapsed}ms): ${err?.message || err}`;
    logger.error(msg);
    return { content: [{ type: 'text', text: `Error in ${toolName}: ${err?.message || err}` }] };
  });
}

let browserReady = false;

async function ensureBrowser(): Promise<void> {
  if (!browserReady || !isBrowserAlive()) {
    logger.info('Browser not running, launching...');
    await launchBrowser(false);
    browserReady = true;
    logger.info('Browser launched successfully');
  }
}

const server = new McpServer({
  name: 'tinder-auto',
  version: '1.1.0',
});

// Schema fragment reused by every tool
const timeoutParam = z.number().optional().describe('Timeout in ms (default 60000). Tool returns an error if it takes longer.');

// --- Status / Auth ---

server.tool('tinder_status', 'Check if logged in and browser is running', { timeout: timeoutParam }, async ({ timeout }) => {
  return withTimeout('tinder_status', async () => {
    await ensureBrowser();
    const page = getPage();
    const loggedIn = await isLoggedIn(page);
    logger.info(`[tinder_status] loggedIn=${loggedIn}, url=${page.url()}`);
    return { content: [{ type: 'text', text: JSON.stringify({ loggedIn, url: page.url() }) }] };
  }, timeout ?? DEFAULT_TIMEOUT_MS);
});

server.tool('tinder_login', 'Open browser for manual Tinder login', { timeout: timeoutParam }, async ({ timeout }) => {
  return withTimeout('tinder_login', async () => {
    await ensureBrowser();
    const page = getPage();
    const loggedIn = await isLoggedIn(page);
    if (loggedIn) {
      logger.info('[tinder_login] Already logged in');
      return { content: [{ type: 'text', text: 'Already logged in!' }] };
    }
    logger.info('[tinder_login] Waiting for manual login...');
    await waitForManualLogin(page);
    logger.info('[tinder_login] Login successful');
    return { content: [{ type: 'text', text: 'Login successful! Session saved.' }] };
  }, timeout ?? 300000); // login gets 5 min default
});

// --- Swiping ---

server.tool(
  'tinder_get_profile',
  'Read the current profile on the swipe stack (name, age, bio, distance)',
  { timeout: timeoutParam },
  async ({ timeout }) => {
    return withTimeout('tinder_get_profile', async () => {
      await ensureBrowser();
      const page = getPage();
      logger.info('[tinder_get_profile] Navigating to recs...');
      await page.goto('https://tinder.com/app/recs', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(randomize(3000));
      await dismissPopups(page);
      const profile = await readCurrentProfile(page);
      logger.info(`[tinder_get_profile] Read: ${profile?.name || '(none)'}`);
      return {
        content: [{ type: 'text', text: sanitize(profile ? JSON.stringify(profile) : 'Could not read profile') }],
      };
    }, timeout ?? DEFAULT_TIMEOUT_MS);
  }
);

server.tool('tinder_like', 'Like (swipe right) the current profile', { timeout: timeoutParam }, async ({ timeout }) => {
  return withTimeout('tinder_like', async () => {
    await ensureBrowser();
    const page = getPage();
    const profile = await readCurrentProfile(page);
    logger.info(`[tinder_like] Liking ${profile?.name || 'unknown'}...`);
    const success = await swipeRight(page);
    logger.info(`[tinder_like] ${success ? 'OK' : 'FAILED'}`);
    return {
      content: [{
        type: 'text',
        text: success
          ? `Liked ${profile?.name || 'unknown'}`
          : 'Failed to like',
      }],
    };
  }, timeout ?? DEFAULT_TIMEOUT_MS);
});

server.tool('tinder_pass', 'Pass (swipe left) on the current profile', { timeout: timeoutParam }, async ({ timeout }) => {
  return withTimeout('tinder_pass', async () => {
    await ensureBrowser();
    const page = getPage();
    const profile = await readCurrentProfile(page);
    logger.info(`[tinder_pass] Passing on ${profile?.name || 'unknown'}...`);
    const success = await swipeLeft(page);
    logger.info(`[tinder_pass] ${success ? 'OK' : 'FAILED'}`);
    return {
      content: [{
        type: 'text',
        text: success
          ? `Passed on ${profile?.name || 'unknown'}`
          : 'Failed to pass',
      }],
    };
  }, timeout ?? DEFAULT_TIMEOUT_MS);
});

server.tool(
  'tinder_swipe_session',
  'Run an automated swiping session for N profiles',
  {
    count: z.number().describe('Number of profiles to swipe through'),
    timeout: timeoutParam,
  },
  async ({ count, timeout }) => {
    return withTimeout('tinder_swipe_session', async () => {
      await ensureBrowser();
      const page = getPage();
      logger.info(`[tinder_swipe_session] Starting session for ${count} profiles`);
      const result = await swipeSession(page, count);
      logger.info(`[tinder_swipe_session] Done: ${JSON.stringify(result)}`);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }, timeout ?? 600000); // swipe sessions can be long
  }
);

// --- Matches ---

server.tool('tinder_get_matches', 'Get list of all matches and conversations', { timeout: timeoutParam }, async ({ timeout }) => {
  return withTimeout('tinder_get_matches', async () => {
    await ensureBrowser();
    const page = getPage();
    logger.info('[tinder_get_matches] Fetching matches...');
    const matches = await getMatches(page);
    logger.info(`[tinder_get_matches] Found ${matches.length} matches`);
    const summary = matches.map((m, i) => {
      const tag = m.isNew ? ' [NEW]' : '';
      const preview = m.lastMessage ? ` — "${m.lastMessage.slice(0, 60)}"` : '';
      return `${i + 1}. ${m.name}${tag}${preview}`;
    });
    return {
      content: [{
        type: 'text',
        text: sanitize(`${matches.length} matches:\n${summary.join('\n')}`),
      }],
    };
  }, timeout ?? 120000); // matches involves scrolling
});

// --- Messages ---

server.tool(
  'tinder_read_messages',
  'Read messages in a conversation with a match',
  {
    name: z.string().optional().describe('Name of the match (not needed if matchId provided)'),
    matchId: z.string().optional().describe('Direct match ID — skips slow match list scan'),
    timeout: timeoutParam,
  },
  async ({ name, matchId, timeout }) => {
    return withTimeout('tinder_read_messages', async () => {
      await ensureBrowser();
      const page = getPage();
      logger.info(`[tinder_read_messages] Looking for match name="${name}" matchId="${matchId}"...`);
      const match = await resolveMatch(page, name, matchId);
      if (!match) {
        logger.warn(`[tinder_read_messages] Match not found`);
        return { content: [{ type: 'text', text: `Match not found (name="${name}", matchId="${matchId}")` }] };
      }
      logger.info(`[tinder_read_messages] Opening conversation with ${match.name} (${match.id})`);
      await openMatchById(page, match.id);
      await page.waitForTimeout(randomize(2000));
      await dismissPopups(page);
      const messages = await readMessages(page);
      logger.info(`[tinder_read_messages] Read ${messages.length} messages from ${match.name}`);
      const formatted = messages.map(m => `${m.from === 'me' ? 'YOU' : 'THEM'}: ${m.text}`);
      return {
        content: [{
          type: 'text',
          text: sanitize(formatted.length > 0
            ? `Conversation with ${match.name}:\n${formatted.join('\n')}`
            : `No messages yet with ${match.name}`),
        }],
      };
    }, timeout ?? 120000);
  }
);

server.tool(
  'tinder_send_message',
  'Send a message to a match',
  {
    name: z.string().optional().describe('Name of the match (not needed if matchId provided)'),
    matchId: z.string().optional().describe('Direct match ID — skips slow match list scan'),
    message: z.string().describe('The message to send'),
    timeout: timeoutParam,
  },
  async ({ name, matchId, message, timeout }) => {
    return withTimeout('tinder_send_message', async () => {
      await ensureBrowser();
      const page = getPage();
      logger.info(`[tinder_send_message] Sending to name="${name}" matchId="${matchId}": "${message.slice(0, 50)}"`);
      const match = await resolveMatch(page, name, matchId);
      if (!match) {
        logger.warn(`[tinder_send_message] Match not found`);
        return { content: [{ type: 'text', text: `Match not found (name="${name}", matchId="${matchId}")` }] };
      }
      await openMatchById(page, match.id);
      await page.waitForTimeout(randomize(2000));
      await dismissPopups(page);
      const success = await sendMessage(page, message);
      logger.info(`[tinder_send_message] ${success ? 'Sent' : 'FAILED'} to ${match.name}`);
      return {
        content: [{
          type: 'text',
          text: success
            ? `Message sent to ${match.name}: "${message}"`
            : `Failed to send message to ${match.name}`,
        }],
      };
    }, timeout ?? 120000);
  }
);

// --- Profile Scan ---

server.tool(
  'tinder_scan_profile',
  'Full profile scan: photos, bio, interests, lifestyle, basics, looking for, and all messages with a match',
  {
    name: z.string().optional().describe('Name of the match (not needed if matchId provided)'),
    matchId: z.string().optional().describe('Direct match ID — skips slow match list scan'),
    timeout: timeoutParam,
  },
  async ({ name, matchId, timeout }) => {
    return withTimeout('tinder_scan_profile', async () => {
      await ensureBrowser();
      const page = getPage();
      logger.info(`[tinder_scan_profile] Scanning name="${name}" matchId="${matchId}"...`);
      const match = await resolveMatch(page, name, matchId);
      if (!match) {
        logger.warn(`[tinder_scan_profile] Match not found`);
        return { content: [{ type: 'text', text: `Match not found (name="${name}", matchId="${matchId}")` }] };
      }
      await openMatchById(page, match.id);
      await page.waitForTimeout(randomize(2000));
      await dismissPopups(page);
      const profile = await scanProfile(page);
      logger.info(`[tinder_scan_profile] Scanned ${profile.name || name}: ${profile.photos.length} photos, ${profile.messages.length} messages`);

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

      return { content: [{ type: 'text', text: sanitize(lines.join('\n')) }] };
    }, timeout ?? 120000);
  }
);

// --- Conversation List ---

server.tool(
  'tinder_conversations_since',
  'Get list of all conversations with profile/conversation URLs since a given date. Returns name, matchId, URLs, last message, date, and sender.',
  {
    since: z.string().optional().describe('ISO datetime string (e.g. "2026-03-01" or "2026-03-25T14:30"). Supports minute-level precision. If omitted, returns all conversations.'),
    timeout: timeoutParam,
  },
  async ({ since, timeout }) => {
    return withTimeout('tinder_conversations_since', async () => {
      await ensureBrowser();
      const page = getPage();
      logger.info(`[tinder_conversations_since] Fetching convos${since ? ` since ${since}` : ''}...`);
      const convs = await getConversationsSince(page, since);
      logger.info(`[tinder_conversations_since] Found ${convs.length} conversations`);

      const lines = convs.map((c, i) => {
        const from = c.lastMessageFrom === 'me' ? '(you)' : c.lastMessageFrom === 'them' ? '(them)' : '';
        return `${i + 1}. ${c.name} ${c.lastMessageDate ? `[${c.lastMessageDate}]` : ''} ${from}\n   Last: "${c.lastMessage.slice(0, 60)}"\n   URL: ${c.conversationUrl}`;
      });

      return {
        content: [{
          type: 'text',
          text: sanitize(`${convs.length} conversations${since ? ` since ${since}` : ''}:\n\n${lines.join('\n\n')}`),
        }],
      };
    }, timeout ?? 300000); // can be slow — opens each convo
  }
);

// --- Untexted matches ---

server.tool(
  'tinder_get_untexted_matches',
  'Get all matches that have never been texted (no messages in conversation). Returns match info including matchId, name, matchedAt. Use tinder_scan_profile + tinder_send_message to handle each one.',
  {
    since: z.string().optional().describe('ISO datetime string (e.g. "2026-03-01" or "2026-03-25T14:30"). If omitted, returns all untexted matches.'),
    verify: z.boolean().optional().describe('If true, open each conversation to verify zero messages (slow — ~3s per match). Default false: trust the match-list preview data.'),
    timeout: timeoutParam,
  },
  async ({ since, verify, timeout }) => {
    return withTimeout('tinder_get_untexted_matches', async () => {
      await ensureBrowser();
      const page = getPage();
      logger.info(`[tinder_get_untexted_matches] Fetching new matches only${since ? ` since ${since}` : ''}... (verify=${!!verify})`);
      const matches = await getMatches(page, { newOnly: true });

      const sinceCutoff = since ? new Date(since).getTime() : null;

      // Pre-filter using match-list preview data (hasOpener / lastMessage)
      const candidates = matches.filter(match => {
        // Already has messages from the match list preview
        if (match.hasOpener || match.lastMessage) return false;

        // Filter by since date if requested — skip matches older than cutoff
        if (sinceCutoff != null) {
          if (!match.matchedAt) return false; // no date info, skip when filtering by date
          const matchTime = new Date(match.matchedAt).getTime();
          if (matchTime < sinceCutoff) return false;
        }

        return true;
      });

      logger.info(`[tinder_get_untexted_matches] ${candidates.length} candidates out of ${matches.length} total`);

      let untexted: typeof matches;

      if (verify) {
        // Slow path: open each conversation to confirm zero messages (~3s per match)
        untexted = [];
        for (const match of candidates) {
          if (!(await openMatchById(page, match.id))) continue;
          await page.waitForTimeout(randomize(1500));
          const messages = await readMessages(page);
          if (messages.length === 0) {
            untexted.push(match);
          }
          await page.waitForTimeout(randomize(1000));
        }
      } else {
        // Fast path: trust the preview data — no per-match DOM navigation
        untexted = candidates;
      }

      logger.info(`[tinder_get_untexted_matches] Found ${untexted.length} untexted matches out of ${matches.length} total`);

      const result = untexted.map(m => ({
        matchId: m.id,
        name: m.name,
        matchedAt: m.matchedAt || null,
      }));

      return {
        content: [{
          type: 'text',
          text: sanitize(JSON.stringify({ count: untexted.length, matches: result }, null, 2)),
        }],
      };
    }, timeout ?? 300000);
  }
);

// --- Auto routines ---

server.tool('tinder_daily_routine', 'Run the full daily routine (swipe + openers + follow-ups)', { timeout: timeoutParam }, async ({ timeout }) => {
  return withTimeout('tinder_daily_routine', async () => {
    await ensureBrowser();
    const page = getPage();
    logger.info('[tinder_daily_routine] Starting full daily routine...');
    await runDailyRoutine(page);
    logger.info('[tinder_daily_routine] Complete');
    return { content: [{ type: 'text', text: 'Daily routine completed!' }] };
  }, timeout ?? 600000); // daily routine can take 10 min
});

server.tool(
  'tinder_run_js',
  'Run arbitrary JavaScript on the current Tinder page and return the result',
  {
    code: z.string().describe('JavaScript code to evaluate in the browser page'),
    timeout: timeoutParam,
  },
  async ({ code, timeout }) => {
    return withTimeout('tinder_run_js', async () => {
      await ensureBrowser();
      const page = getPage();
      logger.info(`[tinder_run_js] Evaluating: ${code.slice(0, 80)}...`);
      try {
        const result = await page.evaluate(code);
        logger.info(`[tinder_run_js] Result: ${JSON.stringify(result)?.slice(0, 100)}`);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) || 'done' }] };
      } catch (e: any) {
        logger.error(`[tinder_run_js] Error: ${e.message}`);
        return { content: [{ type: 'text', text: `Error: ${e.message}` }] };
      }
    }, timeout ?? DEFAULT_TIMEOUT_MS);
  }
);

server.tool(
  'tinder_navigate',
  'Navigate the browser to a URL',
  {
    url: z.string().describe('URL to navigate to'),
    timeout: timeoutParam,
  },
  async ({ url, timeout }) => {
    return withTimeout('tinder_navigate', async () => {
      await ensureBrowser();
      const page = getPage();
      logger.info(`[tinder_navigate] Going to ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(randomize(2000));
      logger.info(`[tinder_navigate] Arrived at ${page.url()}`);
      return { content: [{ type: 'text', text: `Navigated to ${page.url()}` }] };
    }, timeout ?? DEFAULT_TIMEOUT_MS);
  }
);

server.tool('tinder_close', 'Close the browser', { timeout: timeoutParam }, async ({ timeout }) => {
  return withTimeout('tinder_close', async () => {
    logger.info('[tinder_close] Closing browser...');
    await closeBrowser();
    browserReady = false;
    logger.info('[tinder_close] Browser closed');
    return { content: [{ type: 'text', text: 'Browser closed' }] };
  }, timeout ?? DEFAULT_TIMEOUT_MS);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('Tinder MCP server v1.1.0 running on stdio');
  logger.info(`Log file: ${process.env.TINDER_LOG_FILE || 'see config.yaml logging.file'}`);
}

main().catch((err) => {
  logger.error(`Fatal: ${err.message || err}`);
  console.error(err);
  process.exit(1);
});
