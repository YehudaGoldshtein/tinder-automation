# Tinder Automation

Playwright-based Tinder web automation with MCP server integration for Claude Code.

## Features

- **Swipe automation** — like/pass with human-like delays and randomization
- **Match management** — list new matches and conversations
- **Message reading & sending** — read and send messages in any conversation
- **Profile scanning** — full profile extraction (photos, bio, interests, lifestyle, basics, messages)
- **Conversation history** — list all conversations with timestamps and last message info
- **Auto-openers** — send first messages to uncontacted matches from templates
- **Daily routine** — automated swipe + opener + follow-up workflow
- **MCP server** — use as tools from Claude Code or any MCP-compatible AI
- **Anti-detection** — random delays, persistent browser profile, no webdriver flag
- **Match caching** — 3-minute cache avoids re-scrolling the match list on every call
- **Timeouts** — every tool accepts an optional timeout so nothing hangs forever

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Playwright](https://playwright.dev/) Chromium browser

## Installation

```bash
git clone https://github.com/YehudaGoldshtein/tinder-automation.git
cd tinder-automation
npm install
npx playwright install chromium
npm run build
```

## Setup

### 1. First Login

Run the login command to open a browser and log in to Tinder manually:

```bash
npx ts-node src/index.ts login
```

This opens a Chromium window. Log in with your Tinder account (Google, phone, etc.). Once you see the swipe page, the session is saved in `browser-data/` and reused for future runs.

### 2. Configure

Edit `config.yaml` to customize:

```yaml
swipe:
  dailyLimit: 80
  likeRatio: 0.7
  delayBetweenSwipes:
    min: 2000
    max: 6000

messages:
  openers:
    - "Hey {{name}}! What's the most spontaneous thing you've done recently?"
    - "Hi {{name}}, what brings you here?"
  maxNewOpeners: 10

logging:
  level: info
  file: ./logs/tinder-auto.log
```

## Usage

### MCP Server (Claude Code Integration)

Add to `~/.claude/settings.json` under `mcpServers`:

```json
{
  "mcpServers": {
    "tinder": {
      "type": "stdio",
      "command": "node",
      "args": ["<path-to-repo>/dist/mcp-server.js"],
      "cwd": "<path-to-repo>"
    }
  }
}
```

Then restart Claude Code.

### Tools

All tools accept an optional `timeout` parameter (in ms). If a tool exceeds its timeout, it returns an error instead of hanging.

| Tool | Description | Key Params | Default Timeout |
|------|-------------|------------|-----------------|
| `tinder_status` | Check if logged in and browser is running | | 60s |
| `tinder_login` | Open browser for manual login | | 5m |
| `tinder_get_profile` | Read current profile on swipe stack | | 60s |
| `tinder_like` | Like (swipe right) current profile | | 60s |
| `tinder_pass` | Pass (swipe left) on current profile | | 60s |
| `tinder_swipe_session` | Auto-swipe N profiles | `count` | 10m |
| `tinder_get_matches` | List all matches & conversations | | 2m |
| `tinder_read_messages` | Read messages with a match | `name?`, `matchId?` | 2m |
| `tinder_send_message` | Send a message to a match | `name?`, `matchId?`, `message` | 2m |
| `tinder_scan_profile` | Full profile scan (photos, bio, interests, messages) | `name?`, `matchId?` | 2m |
| `tinder_conversations_since` | List conversations since a date | `since?` | 5m |
| `tinder_send_openers` | Send openers to uncontacted matches | | 5m |
| `tinder_daily_routine` | Run full daily routine (swipe + openers + follow-ups) | | 10m |
| `tinder_run_js` | Execute arbitrary JS in the browser page | `code` | 60s |
| `tinder_navigate` | Navigate browser to a URL | `url` | 60s |
| `tinder_close` | Close the browser | | 60s |

#### matchId bypass

`tinder_read_messages`, `tinder_send_message`, and `tinder_scan_profile` accept an optional `matchId` parameter. When provided, the tool navigates directly to `/app/messages/{matchId}` instead of loading and scrolling through the entire match list — reducing call time from ~90s to ~2s.

You can get match IDs from `tinder_get_matches` or `tinder_conversations_since`.

### CLI Commands

```bash
npx ts-node src/index.ts status      # Check login status
npx ts-node src/index.ts login       # Manual login
npx ts-node src/index.ts swipe --count 20
npx ts-node src/index.ts matches
npx ts-node src/index.ts opener
npx ts-node src/index.ts daily
```

## Logging

All tool calls are logged with timestamps, elapsed time, and result previews:

```
2026-03-26 16:20:13 [INFO] [tinder_send_message] START (timeout: 120000ms)
2026-03-26 16:20:15 [INFO] [tinder_send_message] OK (2340ms) Message sent to Ana: "hey!"
```

Logs go to `./logs/tinder-auto.log` (configurable in `config.yaml`).

## How It Works

Uses Playwright to control a real Chromium browser, interacting with Tinder's web app like a human. No unofficial API calls — just browser automation.

- **Login persistence** — Playwright persistent browser context (`browser-data/`) keeps sessions across runs
- **Match cache** — 3-minute TTL cache on the match list, so consecutive tool calls don't re-scroll
- **Anti-detection** — gaussian-distributed delays, simulated typos, photo browsing, no `navigator.webdriver` flag
- **Selectors** — all DOM selectors centralized in `src/selectors.ts` for easy updates when Tinder changes their UI

## Updating Selectors

If Tinder updates their web UI:

1. Open Tinder in the Playwright browser (`npx ts-node src/index.ts login`)
2. Open DevTools (F12) and inspect elements
3. Update `src/selectors.ts`
4. Rebuild: `npm run build`

## Disclaimer

This tool is for educational and personal automation purposes only. Use at your own risk. Automating Tinder may violate their Terms of Service and could result in account restrictions or bans.

## License

MIT
