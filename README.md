# Tinder Automation

Playwright-based Tinder web automation with MCP server integration for Claude Code.

## Features

- **Swipe automation** — like/pass with human-like delays and randomization
- **Match management** — list new matches and conversations
- **Message reading & sending** — read and send messages in any conversation
- **Auto-openers** — send first messages to uncontacted matches from templates
- **Daily routine** — automated swipe + opener + follow-up workflow
- **MCP server** — use as tools from Claude Code or any MCP-compatible AI
- **Anti-detection** — random delays, persistent browser profile, no webdriver flag

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Playwright](https://playwright.dev/) Chromium browser

## Installation

```bash
git clone https://github.com/YehudaGoldshtein/tinder-automation.git
cd tinder-automation
npm install
npx playwright install chromium
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
  dailyLimit: 80        # max swipes per run
  likeRatio: 0.7        # 70% right swipe
  delayBetweenSwipes:
    min: 2000
    max: 6000

messages:
  openers:
    - "Hey {{name}}! What's the most spontaneous thing you've done recently?"
    - "Hi {{name}}, what brings you here?"
  maxNewOpeners: 10
```

## Usage

### CLI Commands

```bash
# Check login status
npx ts-node src/index.ts status

# Swipe through profiles
npx ts-node src/index.ts swipe --count 20

# List matches and conversations
npx ts-node src/index.ts matches

# Send openers to new matches
npx ts-node src/index.ts opener

# Run full daily routine (swipe + openers + follow-ups)
npx ts-node src/index.ts daily

# Manual login (if session expired)
npx ts-node src/index.ts login
```

### MCP Server (Claude Code Integration)

#### Option 1: Add to Claude Code config

Add this to your `~/.claude.json` under `mcpServers`:

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

Build first:

```bash
npm run build
```

Then restart Claude Code. You'll have these tools available:

| Tool | Description |
|------|-------------|
| `tinder_status` | Check if logged in |
| `tinder_login` | Open browser for manual login |
| `tinder_get_profile` | Read current profile on swipe stack |
| `tinder_like` | Like current profile |
| `tinder_pass` | Pass on current profile |
| `tinder_swipe_session` | Auto-swipe N profiles |
| `tinder_get_matches` | List all matches & conversations |
| `tinder_read_messages` | Read messages with a match by name |
| `tinder_send_message` | Send a message to a match |
| `tinder_send_openers` | Send openers to uncontacted matches |
| `tinder_daily_routine` | Run full daily routine |
| `tinder_close` | Close the browser |

#### Option 2: Run standalone

```bash
node dist/mcp-server.js
```

## How It Works

The tool uses Playwright to control a real Chromium browser, interacting with Tinder's web app exactly like a human would. No unofficial API calls — just browser automation.

- **Login persistence**: Uses Playwright's persistent browser context (`browser-data/`) to keep your Tinder session across runs
- **Selectors**: All DOM selectors are mapped from the live Tinder web app and centralized in `src/selectors.ts` for easy updates
- **Anti-detection**: Random delays (gaussian distribution), no `navigator.webdriver` flag, persistent browser profile

## Updating Selectors

If Tinder updates their web UI, you may need to update selectors:

1. Open Tinder in the Playwright browser (`npx ts-node src/index.ts login`)
2. Open DevTools (F12) and inspect elements
3. Update `src/selectors.ts` with new selectors
4. Rebuild: `npm run build`

## Disclaimer

This tool is for educational and personal automation purposes only. Use at your own risk. Automating Tinder may violate their Terms of Service and could result in account restrictions or bans. The authors are not responsible for any consequences.

## License

MIT
