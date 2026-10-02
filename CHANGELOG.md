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
