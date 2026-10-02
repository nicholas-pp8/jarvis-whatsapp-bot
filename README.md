<div align="center">

<img src="assets/logo.png" width="220" alt="Jarvis logo" />

<a href="https://github.com/nicholas-pp8/jarvis-whatsapp-bot">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=26&pause=1200&color=3DDCFF&center=true&vCenter=true&width=640&lines=JARVIS+WhatsApp+Bot;Downloads+music+and+video;AI+answers+with+%2Fask;Stickers+and+image+tools;Full+group+management" alt="Typing animation" />
</a>

<p>
  <img src="https://img.shields.io/badge/Node.js-20%2B-3DDCFF?style=for-the-badge&logo=node.js&logoColor=white&labelColor=0b1c2c" alt="Node" />
  <img src="https://img.shields.io/badge/Baileys-7.0-3DDCFF?style=for-the-badge&logo=whatsapp&logoColor=white&labelColor=0b1c2c" alt="Baileys" />
  <img src="https://img.shields.io/badge/commands-65-3DDCFF?style=for-the-badge&labelColor=0b1c2c" alt="Commands" />
  <img src="https://img.shields.io/badge/license-MIT-3DDCFF?style=for-the-badge&labelColor=0b1c2c" alt="License" />
</p>

<p><a href="https://nicholas-pp8.github.io/jarvis/"><b>Setup site: nicholas-pp8.github.io/jarvis</b></a> (guide + .env generator)</p>


<p><b>A modular WhatsApp bot with downloaders, AI chat, image tools and group management.</b><br/>Pairing-code login, no QR. Runs on small free hosts (about 150 MB RAM).</p>

<img src="assets/demo.gif" width="460" alt="Example chat (illustrative)" />

</div>

---

> [!WARNING]
> Baileys is an unofficial WhatsApp client. WhatsApp can restrict or ban numbers that use it, and group tools (mass tagging, adding or removing people, auto moderation) raise that risk. Use a number you can afford to lose. Read [Ban-risk notes](#ban-risk-notes) before turning anything on.

## Features

* **Downloaders**: YouTube audio (`/play`) and video (`/video`) by name or link, Pinterest images and videos by link or search term.
* **AI**: `/ask` talks to Gemini, Groq or OpenRouter, whichever keys you set. It tries them in order and falls back on errors.
* **Text to speech**: `/tts` supports 23 languages, with male/female voices where available using Microsoft Edge voices, with Google Translate as fallback. No API key. Defaults: 500 characters and 5 requests per minute for non-owner users (the owner is exempt). When voice-note conversion fails, it sends plain audio.
* **Image tools**: stickers with your own pack name, sticker to image, resize, compress, convert. Works as a caption or as a reply to media.
* **Group management**: welcome and goodbye messages, rules, warnings with history, anti-link, anti-spam, anti-flood, blocked words, mute, scheduled messages, stats, invite link tools, add/remove/promote/demote.
* **Recover**: deleted messages, deleted and normal statuses, view-once photos, videos and voice notes, profile pictures. Sent to your own chat. See the Recover section below.
* **Permission levels**: bot owner > bot admin > WhatsApp group admin > member.
* **Safe by default**: every automatic group feature is off until a group admin turns it on. Admins are never auto moderated.
* **Crash safe**: errors are caught per message and per group. One bad message never stops the bot. The connection reconnects by itself.
* **Modular**: drop a file into `src/commands/` and it becomes a command. Group tools live in `src/groups/` and plug in without touching the connection code.
* **Live stats** in `/menu` and `/status`: uptime, RAM, CPU, command usage.

## Commands

All 65 commands. The default prefix is `/` and can be changed in `.env`.

### General (4)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/menu` | Show all commands | `/start`, `/commands` |
| `/help [command]` | Explain how to use the bot or one command | `/h` |
| `/ping` | Check that the bot is alive and how fast it replies | - |
| `/setprefix <prefix>` | Change the command prefix: any symbol, number, letter or emoji (1 to 3 characters). Saved across restarts. `/setprefix reset` always works | `/prefix` |

### Downloaders (3)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/play <name or link>` | Download the audio of a YouTube video (M4A) | `/ytaudio`, `/ytmp3`, `/song` |
| `/video <name or link>` | Download a YouTube video (MP4) | `/ytvideo`, `/ytmp4`, `/yt` |
| `/pinterest <name or link>` | Find a Pinterest pin by name, or download one from a link | `/pin` |

### Image tools (6)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/sticker (send or reply to an image)` | Make a sticker from an image or short video | `/s`, `/stiker` |
| `/toimg (reply to a sticker)` | Turn a sticker into an image | `/toimage`, `/unsticker` |
| `/resize 800 (send or reply to an image)` | Resize an image to a width in pixels | - |
| `/compress 60 (quality 10-95, optional)` | Make an image smaller in file size | `/shrink` |
| `/qr <text or URL>` | Generate a 1024px PNG QR code | - |
| `/convert png (png, jpg or webp)` | Convert an image to png, jpg or webp | `/toformat` |

### AI (3)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/ask <question>` | Ask an AI anything | `/ai` |
| `/tts [language] [male, female or voice] <text>` | Text to audio. Also works as a reply. Examples: `/tts hi Namaste dosto`, `/tts en male Good morning` | `/speak`, `/say` |
| `/ttsvoices [language]` | List languages and voices | `/voices` |

### Bot (3)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/update` | Owner self-chat update review and confirmation | - |
| `/usage` | Private owner usage insights | - |
| `/status` | Show bot status: uptime, memory, usage and more | - |

### Recover (6)

Owner only, except `/getpp`. Recovered items are sent to your own chat ("message yourself"). If you type one of these commands inside someone else's chat, the bot deletes your command message and answers in your own chat.

| Command | What it does | Aliases |
| --- | --- | --- |
| `/statusdl [number, name or all]` | List saved statuses and download them | `/sdl`, `/savestatus` |
| `/antidelete [on, off, groups on, status on, vo on]` | Turn recovery of deleted messages, statuses and view-once on or off | `/antidel` |
| `/deleted [number]` | List the deleted items the bot caught, or send one again | `/recover` |
| `/vv` | Recover a view-once photo or video (reply to it, or the latest saved) | `/viewonce` |
| `/vvn` | Recover a view-once voice note | `/vvvoice` |
| `/getpp [reply, @mention or number]` | Get the profile picture of a user | `/pp`, `/dp` |

**What to know:** only items that arrive after the bot is online and the feature is on can be recovered. Nothing before that, and nothing while the bot is offline. Items are kept for 25 hours (statuses) or 48 hours (messages and view-once) with an 80 MB cap, then deleted. All four recover switches are ON by default. You can turn each off; choices persist across restarts. WhatsApp decides what a linked device receives, so view-once recovery can fail if WhatsApp only sends a placeholder. It stays on your own host and is never uploaded anywhere.

### Group management (26)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/add 919876543210` | Add a person by number (admins) | - |
| `/announce <text>` | Post an announcement (admins) | - |
| `/antiflood on|off` | Turn Anti-flood on or off (admins) | - |
| `/antilink on|off` | Turn Anti-link on or off (admins) | - |
| `/antispam on|off` | Turn Anti-spam on or off (admins) | - |
| `/blockword add|remove|list [word]` | Manage blocked words (admins) | `/badword` |
| `/botadmin add|remove|list @person` | Manage bot admins (owner only) | - |
| `/demote @person` | Remove admin rights (admins) | - |
| `/goodbye on|off` | Turn Goodbye message on or off (admins) | - |
| `/groupconfig [setting value]` | View or change group settings (admins) | `/gconfig`, `/gsettings` |
| `/groupinfo` | Show info about this group | `/ginfo` |
| `/grouplink` | Get the invite link (admins) | `/link` |
| `/groupstats` | Message counts and top members | `/gstats` |
| `/mute` | Only admins can send (admins) | - |
| `/promote @person` | Make someone an admin (admins) | - |
| `/remove @person` | Remove a person (admins) | `/kick` |
| `/resetwarn @person` | Clear warnings of a member (admins) | `/clearwarn` |
| `/revoke` | Reset the invite link (admins) | `/resetlink` |
| `/rules` | Show the group rules | - |
| `/schedule 09:00 text | list | del <id>` | Daily scheduled message (admins) | - |
| `/setrules <text>` | Set the group rules (admins) | - |
| `/tagall [message]` | Mention everyone once (admins, 10 min cooldown) | `/everyone` |
| `/unmute` | Everyone can send (admins) | - |
| `/warn @person [reason]` | Warn a member (admins) | - |
| `/warnings [@person]` | Show warnings of a member | `/warns` |
| `/welcome on|off` | Turn Welcome message on or off (admins) | - |

Group commands only work inside groups. "(admins)" means WhatsApp group admins or higher. The bot must be a group admin for `/add`, `/remove`, `/promote`, `/demote`, `/grouplink`, `/revoke`, `/mute`, `/unmute` and for deleting messages.

## Install

You need Node.js 20 or newer.

```bash
git clone https://github.com/nicholas-pp8/jarvis-whatsapp-bot.git
cd jarvis-whatsapp-bot
npm install
cp .env.example .env
```

Edit `.env`: set `OWNER_NUMBER` (digits only, with country code, no plus) and optionally `PAIRING_NUMBER`.

## Run

```bash
npm start
```

On first start the bot prints an 8 character **pairing code**. On your phone open WhatsApp, go to Linked devices, choose Link with phone number, and type the code. The login is saved in `auth/` so you only do this once.

## Configure

Everything is in `.env`. See `.env.example` for all options.

| Setting | Meaning |
| --- | --- |
| `BOT_NAME`, `PREFIX` | Name and command prefix |
| `OWNER_NUMBER` | Number with owner rights |
| `ALLOW_GROUPS`, `OWNER_ONLY` | Where and for whom the bot answers |
| `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY` | Free AI keys for `/ask`. Any one is enough |
| `BOT_TZ` | Timezone for `/schedule` |
| `MAX_FILE_SIZE_MB`, `MAX_VIDEO_HEIGHT`, `COMMAND_COOLDOWN` | Download and rate limits |

Keys are free: [Google AI Studio](https://aistudio.google.com/apikey), [Groq](https://console.groq.com/keys), [OpenRouter](https://openrouter.ai/keys).

## Group setup

1. Add the bot number to your group and make it an admin.
2. Type `/groupconfig` to see the settings.
3. Turn on only what you want: `/welcome on`, `/antilink on`, `/antispam on`, `/antiflood on`, `/blockword add <word>`.
4. Set `/setrules <text>` and a daily message with `/schedule 09:00 Good morning`.

Settings are stored per group in `data/groups.sqlite` when SQLite works on your host, or `data/groups.json` otherwise. Warnings keep their history.

## Ban-risk notes

* All automatic moderation is **off by default**. Turn on one feature at a time.
* `/tagall` mentions everyone in one message and has a 10 minute cooldown for admins.
* All bot messages and admin actions go through one queue: about one message per 1.2 seconds, and one add/remove/promote per 2.5 seconds.
* Do not add many people quickly with `/add`. Share the invite link instead.
* Do not run the bot in many large groups from a brand new number.
* Never share your `auth/` folder or `.env`. Anyone with `auth/` controls the WhatsApp account.

## Project layout

```text
src/
  commands/     one file per command (auto loaded)
  groups/       group module: storage, permissions, moderation, scheduler, commands
  recover/      deleted message, status and view-once cache
  tts/          speech providers, voices and limits
  downloaders/  YouTube and Pinterest
  ai/           AI providers
  connection/   Baileys connection and pairing
  handlers/     message and command handling
  utils/        image tools, queue, logging, helpers
test/           node --test suites
```

Add a command: create `src/commands/hello.js` that exports `{ name, category, description, usage, run(ctx) }`.

## Tests

```bash
npm test
```

## License

MIT

## Health, usage, QR and updates (v1.3.0)

- `/qr <text or URL>` creates a 1024px PNG QR. Accepts up to 2,000 UTF-8 bytes, including vCard and Wi-Fi text. It uses memory, leaving no QR temp files.
- `/usage` is owner-only in private chats. Only command names, counts, error counts and hour totals are stored, not arguments, message text, phone numbers or chat IDs. Retention is 35 days. Owner favorites appear in private owner menus. Alias hints are suggestions, never automatic command changes.
- Self-chat reports default to 10 AM Asia/Kolkata, with weekly usage on Sundays. `OPS_REPORT_HOUR` changes the hour (0-23). If offline, reports wait for reconnect; WhatsApp cannot deliver an offline alert while disconnected.
- Health checks run once a minute. Sustained disconnects, five errors in five minutes, and repeated 90% RAM pressure produce conservative alerts with one-hour cooldowns. RAM readings describe the shared container, not only Jarvis. Disk alerts require explicit `HOST_DISK_LIMIT_MB`; they measure Jarvis's own files, not the provider's complete shared quota. No arbitrary source edits or process kills are attempted.
- Every ten minutes, expired recover cache entries and abandoned temp jobs are pruned. Existing recover limits remain 80 MiB total, 20 MiB/file, 48-hour message/view-once and 25-hour status expiry. Active jobs and auth/config/settings are preserved. Cleanup reduces waste but cannot guarantee unlimited free space.
- Start via `npm start` (`scripts/runner.js`). A process supervisor must restart Jarvis after exits; this does not restart other bots. Fatal exceptions exit for supervisor recovery. Existing WhatsApp reconnect logic stays in place.
- `/update` runs only from the linked owner's self-chat. It checks `nicholas-pp8/jarvis-whatsapp-bot` main, shows a higher semantic version and changelog, then requires `/update confirm <full commit SHA>` within ten minutes. Periodic reminders check hourly. Same-version commits do not trigger an update.
- Updates pin the displayed commit, check file hashes, reject symlink paths, syntax-check changed JS and stage source before replacing it. Dependencies/runtime changes require a manual tested deployment. `.env`, auth, data, downloads, binaries, dependency lockfile and stable runner are never overwritten. A failed boot or health timeout restores previous changed files once on restart. The supervisor must launch the stable runner, and any embedding host launcher must preserve subsequently installed source rather than replay older code.

## Utilities (v1.4.0)

- `/filetype` identifies uploaded/replied files from content, not filename. Media downloads and image inputs are checked before processing. Executables, unknown binary types, script-like text and nested ZIPs are rejected. Utility files are limited to 10 MiB. ZIP output/extraction stays in memory, leaving no temporary copies.
- `/zip` compresses one replied safe file. `/unzip` accepts at most 20 entries and 20 MiB expanded content; rejects unsafe paths, symlinks, excessive expansion and unsupported contents. Archives are validated before any files are sent.
- `/password [8-64] [all|alnum|letters|digits]` is owner self-chat only. Uses cryptographic random generation. Generated values are sent to WhatsApp but not written to bot logs, usage counts or caches. WhatsApp/chat history still retains the message.
- `/remind add YYYY-MM-DDTHH:mm Asia/Kolkata <text>` shows the exact self-chat message and time for review. Confirm with the displayed code within ten minutes. `/remind list` and `/remind cancel <id>` manage persistent reminders. One-shot reminders only, max 20 jobs, max 90 days ahead, max 1,000 characters. Sends on the next minute tick when online. Offline jobs wait. A transport error or interrupted send is marked uncertain, not retried automatically, to prevent duplicates. Check list and cancel/recreate if needed. Only the linked owner's actual self-chat can create reminders.
- `/system` (`/stats`) is private owner-only, with CPU, RAM, filesystem usage, OS/Node and uptime. No hostnames, network addresses, serials, user names or paths. Filesystem usage is not provider quota usage.
- `/linkpreview <URL>` shows title, description, site and image URL. `/html <URL>` extracts page text/metadata without running scripts. Only public HTTP/HTTPS on standard ports, DNS-pinned addresses, validated redirects, 10-second socket timeout and 1 MiB HTML cap. No cookies, credentials or browser login sent.
- `/ascii <text>` supports up to 60 English ASCII characters with capped output. Only the Small font is needed on lightweight hosts. `/pdf <text>` makes a basic PDF from up to 10,000 bytes of English text. Unicode fonts are not included.
- `/time [IANA timezone]`, `/date [IANA timezone]`, `/timestamp`, `/countdown YYYY-MM-DDTHH:mm [IANA timezone]`. Default Asia/Kolkata. Invalid dates/zones and past countdown targets are rejected.
- All utilities have a three-second per-user cooldown, including owner requests. File/text/response limits apply.
- Set `GROUP_STORAGE=json` on small hosts with broken optional SQLite binaries. This skips native probes and prevents their crash dumps; existing JSON group settings stay intact.

## v1.5 games, sudo and latency

- `/ttt` plays tic-tac-toe against an unbeatable bot. Use `/ttt 1` through `9`, or cancel.
- `/jumble`, `/wordgame` and `/quiz math|words` have isolated per-user/chat sessions. Word-making uses a small curated English dictionary. `/quiz leaderboard` uses pseudonymous player labels.
- `/8ball`, `/coinflip`, `/dice`, `/joke`, `/quote`, `/fact`, `/choose a | b` are offline fun commands. `/poll question | a | b` creates a single-choice group poll and requires group admin or primary owner.
- `/speedtest quick` measures host HTTPS latency to Cloudflare with a HEAD-only request and a 5-second timeout. It includes DNS/TLS time, is not phone speed, and does not measure Mbps. Full bandwidth tests are not installed.
- Primary owner uses `/addsudo @user`, `/delsudo @user`, `/listsudo`. `/checksudo` reports the caller's status. International number (with or without +) or one actual @mention per change. Owner self-chat: `/addsudo +16508702892`, `/delsudo +16508702892`. Duplicate users are rejected. Membership persists in `data/db.json`; the last 100 add/remove audit records retain hashed identities and timestamps.
- This owner's chosen policy grants sudo access to otherwise owner-only commands, except add/remove/list sudo management. A sudo cannot grant another sudo. Group commands retain group-admin and bot-admin checks. Removing sudo affects the next command; already-running actions cannot be recalled.
- Sudo password/update commands require the caller's own private DM. Reminders require review and confirmation, deliver to the caller's private chat, and keep each user's list/cancel scope separate. Legacy reminders remain owner-only. No automatic retry after an ambiguous reminder send.

Permission modules may specify `requiredLevel: user|admin|sudo|owner`. The current owner policy permits full sudo access for `owner` commands except the three membership-management commands. `admin` means actual WhatsApp group admin or primary owner, not sudo alone. A global owner-only gate permits configured sudo users too.

Every startup imports and validates all command definitions, permissions, arguments and alias formats, and runs pure game sanity checks. Log reports passed/failed counts and names failed commands; an invalid registry fails startup rather than going online half-loaded. This is offline validation, not a claim that every command works against WhatsApp/media providers. No group actions, messages, downloads, updates or bandwidth tests run during boot.
