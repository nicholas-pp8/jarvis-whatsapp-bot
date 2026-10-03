# Downloads build notes (local, not deployed)

## Commands
- /instagram, /ig, /insta: public Instagram video/reel/post URL
- /facebook, /fb: public Facebook video/reel or fb.watch URL
- /twitter, /x, /tweet: public Twitter/X status video URL
- /apk <name or exact package ID>: direct current recommended F-Droid APK when an exact unique name or ID matches; ambiguous names return choices
- /apksearch <query>: name search
- /apkinfo <package ID>: official metadata
- /apkdownload <official F-Droid APK URL>: current recommended version only

Social commands use the existing queue and yt-dlp argument-array launcher with cookies disabled. HTTPS/domain/post validation, no playlists/live/private-content route,30minute duration limit, existing file-size/time limits, media magic-byte check and temporary cleanup. Extractor/site access can fail. No successful live social-video download has been verified yet.

APK download safety: exact official HTTPS host/path, no credentials/ports/query/redirects, bounded response sizes/timeouts,3requests/minute/user, shared queue, isolated temporary job,50MiB cap, ZIP magic/entry/path checks, bounded binary Android manifest decompression, expected package identity, computed SHA256 report. APK metadata is from official HTTPS pages/API, not a cryptographically verified repository index. No malware scan or APK signing-certificate validation is claimed. Does not install APKs. Does not support split APK bundles. Automatic temp cleanup applies after sending or failure.

APKMirror and APKPure empirical automated searches returned Cloudflare challenges. No challenge bypass, cookies import, proxy rotation or manual-link fallback. User requires direct files; proprietary-app path therefore remains unsupported. Owner chose F-Droid-only delivery for this first batch and asked for continued free-source research. No source switch to an unofficial paid API without separate permission.

Live local F-Droid smoke: package org.fdroid.fdroid, recommended version1.23.2/code1023052,12426276bytes, SHA256985f5181d48bb6bafd54083a048b391271e0ab28385881cc41294fb01a222762. Binary manifest identity matched; temporary APK deleted. This proves structure/download only, not safety.

Sources:
- https://f-droid.org/docs/All_our_APIs/
- https://f-droid.org/en/packages/org.fdroid.fdroid/
- https://www.apkmirror.com/faq/
- https://apkpure.net/terms.html
- https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md
