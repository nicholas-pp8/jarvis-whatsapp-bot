<div align="center">

<img src="assets/logo.png" width="220" alt="Jarvis logo" />

<a href="https://github.com/nicholas-pp8/jarvis-whatsapp-bot">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=26&pause=1200&color=3DDCFF&center=true&vCenter=true&width=640&lines=JARVIS+WhatsApp+Bot;Downloads+music+and+video;AI+answers+with+%2Fask;Stickers+and+image+tools;Full+group+management" alt="Typing animation" />
</a>

<p>
  <img src="https://img.shields.io/badge/Node.js-20%2B-3DDCFF?style=for-the-badge&logo=node.js&logoColor=white&labelColor=0b1c2c" alt="Node" />
  <img src="https://img.shields.io/badge/Baileys-7.0-3DDCFF?style=for-the-badge&logo=whatsapp&logoColor=white&labelColor=0b1c2c" alt="Baileys" />
  <img src="https://img.shields.io/badge/commands-108-3DDCFF?style=for-the-badge&labelColor=0b1c2c" alt="Commands" />
  <img src="https://img.shields.io/badge/license-MIT-3DDCFF?style=for-the-badge&labelColor=0b1c2c" alt="License" />
</p>

<p>Use the install and configuration steps below. The old setup site is not currently enabled.</p>


<p><b>A modular WhatsApp bot with downloaders, AI chat, image tools and group management.</b><br/>Pairing-code login, no QR. Resource use varies by host, connected services and active jobs.</p>

<img src="assets/demo.gif" width="460" alt="Example chat (illustrative)" />

</div>

---

> [!WARNING]
> Baileys is an unofficial WhatsApp client. WhatsApp can restrict or ban numbers that use it, and group tools (mass tagging, adding or removing people, auto moderation) raise that risk. Use a number you can afford to lose. Read [Ban-risk notes](#ban-risk-notes) before turning anything on.

## Features

* **Downloaders**: YouTube audio/video, Pinterest, public Instagram/Facebook/X videos, and F-Droid APK search/info/direct files. See limits and delivery evidence below.
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

v1.6.3 registers 108 primary commands. Aliases are not counted separately. This list is generated from the current registry; boot imports/schema checks are not end-to-end delivery tests. The default prefix is `/`; change it in `.env`.

### AI (3)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/ask` | Ask an AI anything | `/ai` |
| `/tts` | Turn text into a voice message | `/speak`, `/say` |
| `/ttsvoices` | List voice languages and voices | `/voices` |

### Diagnostics (1)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/errors` | Private error IDs and recurrence counts; no message contents | - |

### Downloaders (10)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/apk` | Find free apps and validated official APKs | - |
| `/apkdownload` | Find free apps and validated official APKs | - |
| `/apkinfo` | Find free apps and validated official APKs | - |
| `/apksearch` | Find free apps and validated official APKs | - |
| `/facebook` | Download a public facebook video | `/fb` |
| `/instagram` | Download a public instagram video | `/ig`, `/insta` |
| `/pinterest` | Find a Pinterest pin by name, or download one from a link | `/pin` |
| `/play` | Download the audio of a YouTube video (M4A) | `/ytaudio`, `/ytmp3`, `/song` |
| `/twitter` | Download a public twitter video | `/x`, `/tweet` |
| `/video` | Download a YouTube video (MP4) | `/ytvideo`, `/ytmp4`, `/yt` |

### Economy (9)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/achievements` | Virtual economy achievements | - |
| `/balance` | Virtual economy balance | - |
| `/daily` | Virtual economy daily | - |
| `/earn` | Virtual economy earn | - |
| `/economy` | Virtual economy economy | - |
| `/economyrules` | Configure virtual earning limits | - |
| `/leaderboard` | Virtual economy leaderboard | - |
| `/pay` | Review and confirm a virtual-coin transfer | - |
| `/profile` | Virtual economy profile | - |

### Games (12)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/8ball` | Playful random answer, not advice | - |
| `/choose` | Pick from 2-10 options | - |
| `/coinflip` | Flip a coin | - |
| `/dice` | Roll one six-sided die | - |
| `/fact` | A simple fact | - |
| `/joke` | A short joke | - |
| `/jumble` | Unscramble a word | - |
| `/poll` | Create a simple group poll | - |
| `/quiz` | Trivia with private sessions and scores | - |
| `/quote` | A short encouraging thought | - |
| `/ttt` | Play tic-tac-toe vs Jarvis | - |
| `/wordgame` | Make words from six letters | - |

### General (4)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/help` | Explain how to use the bot or one command | `/h` |
| `/menu` | Show all commands | `/start`, `/commands` |
| `/ping` | Check that the bot is alive and how fast it replies | - |
| `/setprefix` | Change the command prefix (any symbol, number, letter or emoji) | `/prefix` |

### Group (26)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/add` | Add a person by number (admins) | - |
| `/announce` | Post an announcement (admins) | - |
| `/antiflood` | Turn label_antiflood on or off (admins) | - |
| `/antilink` | Turn label_antilink on or off (admins) | - |
| `/antispam` | Turn label_antispam on or off (admins) | - |
| `/blockword` | Manage blocked words (admins) | `/badword` |
| `/botadmin` | Manage bot admins (owner only) | - |
| `/demote` | Remove admin rights (admins) | - |
| `/goodbye` | Turn label_goodbye on or off (admins) | - |
| `/groupconfig` | View or change group settings (admins) | `/gconfig`, `/gsettings` |
| `/groupinfo` | Show info about this group | `/ginfo` |
| `/grouplink` | Get the invite link (admins) | `/link` |
| `/groupstats` | Message counts and top members | `/gstats` |
| `/mute` | Only admins can send (admins) | - |
| `/promote` | Make someone an admin (admins) | - |
| `/remove` | Remove a person (admins) | `/kick` |
| `/resetwarn` | Clear warnings of a member (admins) | `/clearwarn` |
| `/revoke` | Reset the invite link (admins) | `/resetlink` |
| `/rules` | Show the group rules | - |
| `/schedule` | Daily scheduled message (admins) | - |
| `/setrules` | Set the group rules (admins) | - |
| `/tagall` | Mention everyone once (admins, 10 min cooldown) | `/everyone` |
| `/unmute` | Everyone can send (admins) | - |
| `/warn` | Warn a member (admins) | - |
| `/warnings` | Show warnings of a member | `/warns` |
| `/welcome` | Turn label_welcome on or off (admins) | - |

### Image (11)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/compress` | Make an image smaller in file size | `/shrink` |
| `/convert` | Convert an image to png, jpg or webp | `/toformat` |
| `/denoise` | Reduce noise locally with Sharp | - |
| `/qr` | Generate a PNG QR code | - |
| `/remini` | Enhance/upscale a photo; local baseline or configured provider | `/enhance` |
| `/resize` | Resize an image to a width in pixels | - |
| `/restore` | Restore faces using an approved external provider | - |
| `/sharpen` | Sharpen a photo locally with Sharp | - |
| `/sticker` | Make a sticker from an image or short video | `/s`, `/stiker` |
| `/toimg` | Turn a sticker into an image | `/toimage`, `/unsticker` |
| `/upscale` | Upscale a photo | - |

### Language (4)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/language` | Select your interface language | - |
| `/languages` | Search all registered language codes; show translation coverage | - |
| `/resetlanguage` | Reset your or group language to English | - |
| `/setlanguage` | Set the group interface language (group admins) | - |

### Permissions (4)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/addsudo` | Grant a mentioned user sudo command access | - |
| `/checksudo` | Check your own permission status | - |
| `/delsudo` | Remove a mentioned sudo user | - |
| `/listsudo` | List limited sudo users privately | - |

### Recover (6)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/antidelete` | Recover deleted messages and statuses (sent to your own chat) | `/antidel` |
| `/deleted` | Show recently deleted items I caught | `/recover` |
| `/getpp` | Get the profile picture of a user | `/pp`, `/dp` |
| `/statusdl` | List and download saved WhatsApp statuses | `/sdl`, `/savestatus` |
| `/vv` | Recover a view-once photo or video | `/viewonce` |
| `/vvn` | Recover a view-once voice note | `/vvvoice` |

### System (1)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/speedtest` | Host HTTPS latency (quick, not bandwidth) | - |

### Utilities (14)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/ascii` | English text to ASCII art | - |
| `/countdown` | Time until a calendar date | - |
| `/date` | Current calendar date | - |
| `/filetype` | Identify a safe file by content | - |
| `/html` | Extract text from a public HTML page | - |
| `/linkpreview` | Get safe public URL metadata | - |
| `/password` | Create a private password without storing it | - |
| `/pdf` | English text to a PDF | - |
| `/remind` | Reviewed owner self-chat reminders | - |
| `/system` | Non-sensitive server statistics | `/stats` |
| `/time` | Current timezone time | - |
| `/timestamp` | Current Unix time in seconds | - |
| `/unzip` | Extract a small safe ZIP | - |
| `/zip` | Compress one safe file | - |

### WhatsApp (3)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/status` | Show bot status: uptime, memory, usage and more | - |
| `/update` | Review and confirm a GitHub update | - |
| `/usage` | Private usage insights | - |

Use `/help <command>` for current arguments and permission checks. Group-admin actions also need the bot to have the required group rights. Recovery and sudo rules are described below.

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
  downloaders/  YouTube, Pinterest and public social videos
  services/     bounded image-enhancement adapters
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

Image host repair installs only the two locked Linux-x64 Sharp/libvips prebuilt packages and runs a PNG-to-WebP runtime check, without SQLite or build scripts. Document/audio quote cache stores metadata for up to 150 recent media messages, not original file bytes. Utility quote fallback checks the same chat.

## Virtual economy, recovery and language interface (deployed in v1.6.x)

Virtual coins have no monetary value, gambling or cash-out. `/balance`, `/daily`, `/earn`, `/profile`, `/leaderboard`, `/achievements`, `/economy` read or earn coins. Defaults: 100 daily per rolling 24 hours; 10 per minute; maximum balance 1,000,000. `/pay +international_number amount` prepares a review. Only the same user in the same chat can `/pay confirm code` within two minutes; amounts are whole coins 1-10000. Confirmation is consumed once, and persisted message IDs prevent repeated mutation after restart. Transfers have a persisted two-second cooldown and a maximum of 100 per UTC day. Reward and transfer commands refuse stale deliveries older than five minutes. Recipient numbers are explicit; quoted users or unrelated mentions never replace them. Phone-number identities only; unverified LIDs are refused rather than treated as phone numbers. Leaderboards use hashed pseudonyms, not phone numbers.

Atomic JSON transactions replace unreliable native SQLite on this host. Economy schema/rules/balances are validated; corrupt stores fail closed without resetting wealth. `/economyrules` requires owner/sudo permission and changes `daily`, `earn`, `earnCooldown` (milliseconds) or `maxBalance` within validated bounds. Data lives in private `data/economy.json`; back it up along with `data/db.json` and `data/groups.json`. Group storage no longer launches SQLite probes. The optional SQLite dependency is not required and is omitted on this host.

Central command failures get sanitized classes and reference IDs. `/errors` is owner/sudo-only, private-chat-only, and reports recent IDs plus per-plugin recurrence. Private diagnostics keep command name, time, safe error code and class, never message arguments, URLs, stack traces, phone numbers or keys. Safe retry is explicitly limited to pre-send idempotent HTTP reads, at most two attempts in the downloader and safe public HTML GET. Whole commands, sends, uncertain transfers, writes and group changes are never retried automatically. Some legacy plugins have their own error handlers; full migration remains open.

Language registry and honest key-level coverage: [src/i18n/README.md](src/i18n/README.md). Every registered code is selectable; missing translations use English. Key-complete major-language locales and partial locale files are counted separately in coverage.json. The core schema has 164 keys across 77 complete locale files; the separate runtime schema has 228 keys across 70 complete locale files (English plus 69 non-English). Neither count proves native fluency or full translation of every plugin. The 100+ translated-schema target is still open. Language selections require a successful settings write; unreadable settings files are preserved, not silently reset.

## Downloads and image enhancement (v1.6.3)

- `/ig <public link>`, `/fb <public link>` and `/x <public link>` alias `/instagram`, `/facebook`, `/twitter`. No login/private-content or live-stream route. Limits include 30 minutes, 480px video height, bounded size/time, structural checks and temp cleanup. Public IG/FB/X sample downloads passed real network/file probes during development. Actual user-facing WhatsApp file delivery for those social samples has not yet been verified. Site access and individual posts can still fail.
- `/apk <name or package ID>` sends the recommended F-Droid APK for a unique exact match. Ambiguous names show numbered choices; reply with a number within two minutes in the same chat as the same sender. `/apksearch` searches, `/apkinfo` reads metadata, `/apkdownload` accepts a package ID or validated official F-Droid APK URL. No proprietary-app delivery, split APKs, installation, malware scan or signing-certificate verification. APK structure/package identity and computed SHA256 are checked. Local F-Droid download passed; owner search worked, but WhatsApp APK file delivery is not yet verified.
- `/remini` (alias `/enhance`) and `/upscale` default to local Sharp resizing. `/sharpen` and `/denoise` are local. This is not AI face restoration. `/restore` requires a configured restoration provider.
- Explicit external syntax: `/remini clipdrop 2 yes` on a static photo. External trials are owner-permission only and require per-photo disclosure confirmation. No silent provider fallback, credit topup or POST retry. Clipdrop upscales, not face-restores. Input: JPEG/PNG/WebP,10MiB,16MP; output:20MiB,4096px per side.
- The code is live, but host Clipdrop execution is enabled with an owner-approved cap of99 attempted calls. Local Sharp remains the default; choose Clipdrop explicitly and confirm disclosure per photo. One separate bounded synthetic Clipdrop test succeeded (HTTP200,512x384JPEG,14572bytes); the response reported99credits left. That is a historical API report, not a live balance guarantee or proof of personal-photo quality. No personal photo was used.
- Store the Clipdrop key privately in `.env`, never in source. `REMINI_CLIPDROP_ENABLED` and `REMINI_CLIPDROP_BUDGET` require explicit owner approval. `data/image-credit-budget.json` records attempted calls atomically before POST; failures/timeouts may consume credits. Preserve this file across restarts. The budget is local accounting, not the provider's live wallet.
- PixelBin remains disabled pending retention/disclosure and credit approval; provider-hosted output can remain about30days. Replicate remains disabled pending separate paid approval. Clipdrop retention is unverified. Default `.env.example` disables all external adapters.

See [download notes](docs/downloads-build-notes.md) and [image notes](docs/image-enhancement-notes.md) for checks and sources.
