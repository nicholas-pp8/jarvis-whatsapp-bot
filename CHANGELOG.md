## Provider and phone-info update

- Explicit CodeFormer/SnapEdit adapters with bounded images, strict output hosts, daily provider quota/no paid fallback, and durable usage.
- Owner-only private `/truecaller` with Veriphone/IPQS/DataCrawler basic fields and coarse reported regions, per-number confirmation, free hard caps.
-170local tests,109registered commands. Synthetic real adapter tests pass; no human-face quality guarantee.

## 1.6.4

- Resolve WhatsApp LID senders through Baileys phone-number mapping before owner-only command checks. Unmapped LIDs fail closed; group checks use the participant identity.
- Five added identity tests; 145 tests pass. Live owner photo delivery still needs verification.

## 1.6.3

- /remini local Sharp processing and gated Clipdrop/PixelBin/Replicate adapters, bounded images and durable attempt budgets. External providers disabled until configured and cleared.
- Name-based APK numbered choices,2minute chat/sender selection and package-ID /apkdownload support.
- Social formats with missing height metadata now supported, actual output duration/resolution verified and oversized videos downscaled.

## 1.6.2

- Public Instagram, Facebook and Twitter/X video commands with strict post URLs, cookies disabled, queue and limits.
- F-Droid app-name search, metadata and direct recommended APK delivery with bounded HTTPS requests, package structure checks, SHA-256 report and temporary cleanup.
- APK hashes are computed, not cryptographically trusted index comparisons; no malware-free claim. Proprietary sources remain unsupported.

## 1.6.1

- Separate228-key runtime text schema,69 translated non-English files plus English;7 core languages retain runtime English fallback.
- Local typed input guidance, group/game/reminder/ops text migration; custom content preserved.
- Strict locale JSON updater validation and locale-aware standalone rollback.
- No change to English joke/fact/trivia/word corpora.

# v1.6.0

- Virtual economy with reviewed transfers, durable anti-abuse checks and private pseudonymous history.
- Sanitized error IDs, recurrence diagnostics and bounded safe-read retry.
- 76 non-English 164-key dictionaries plus English; 7847-code versioned registry and explicit fallback. Legacy replies remain partly English.
- Fix owner self-chat checks for typed WhatsApp PN/LID identities.
- Preserve corrupt settings files and refuse unpersisted language/sudo/prefix success.

# v1.5.3

- Restore image backend with integrity-checked locked Sharp prebuilt packages only and runtime smoke verification.
- Cache bounded document/audio metadata and resolve wrapped or omitted PDF/file quotes in same chat.

# v1.5.2

- Fix HEAD latency endpoint and return useful network failure text.
- Allow sudo private commands in actual inbound PN/LID DMs without confusing destination and sender.
- Report central cooldown rather than silently dropping commands.
- Clarify HTML command expects a public URL, not inline markup.

# v1.5.1

- Fix sudo add/remove in owner self-chat: accept explicit international numbers with or without +, retain real single-mention support.
- No reply-target inference; reject malformed/multiple inputs.

# v1.5.0

- Add 12 offline fun/game commands with bounded sessions and pseudonymous leaderboard.
- Add persistent sudo membership, owner-only membership management, audit log, and permission middleware.
- Isolate sudo private reminders; allow password/update from operator private DMs.
- Add quick host HTTPS latency only; no Ookla or full bandwidth test.
- Preserve group admin checks and byte-exact launcher regression validation.

# Changelog

## 1.4.0

- Fourteen validated utility commands: safe files/archives, private passwords, reviewed persistent self-reminders, system, web metadata/text, ASCII/PDF, timezone/date tools.
- Three-second utility cooldown, content type checks and bounded memory operations.
- Optional JSON-only group storage skips native SQLite probes on constrained hosts.

## 1.3.0

- Owner self-chat health alerts and daily checks, with conservative cooldowns.
- Private aggregate usage counts, owner favorites and weekly insights.
- Owner-only `/update` with fixed-repo commit review, confirmation, source staging and rollback.
- `/qr <text or URL>` creates a 1024px PNG in memory.
- Periodic expired recover-cache and abandoned temp-job cleanup. Active jobs, auth, settings and Neha are never cleaned.

## 1.2.0

- TTS and voice list with 23 languages.
- Profile-picture validation fixes.
- Recover switches default ON, with explicit later OFF settings preserved.
