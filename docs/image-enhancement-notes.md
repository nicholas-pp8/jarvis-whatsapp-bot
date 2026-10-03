# Image enhancement build, October3

v1.6.3 command code deployed; local Sharp baseline works. Host Clipdrop execution is enabled with the owner's99-attempt cap; local Sharp remains the default and external disclosure requires an explicit per-photo yes. No separate deployment for this documentation.

- /remini and /enhance alias default to Sharp upscaling. /upscale, /sharpen, /denoise work locally; local output is not AI face restoration. /restore requires configured PixelBin or Replicate.
- Explicit provider syntax: /remini clipdrop 2 yes, /restore pixelbin 1 yes. External trials owner-only. No silent cross-provider fallback or paid topup. Per-photo disclosure confirmation required.
- Input static JPEG/PNG/WebP10MiB/16MP; output20MiB/max4096side. Bounded WhatsApp stream, Sharp validate/rotate/strip metadata, multipart axios+form-data, fixed HTTPS endpoints, no redirects, approved output hosts, limited polling and120second overall timer. Shared download queue;3per minute; isolated temp job cleaned after send/failure.
- Clipdrop synchronous upscale only,100development/debug credits,1credit/call; outputsJPEG/WebP. Retention not verified. Free-credit claim requires name/phone/SMS/reCAPTCHA, not just email. The original email-created account showed0credits; the owner supplied a separate key. That key returned99remainingcredits after one synthetic trial. Its email binding is not independently verified.
- PixelBin direct multipart sr/upscale prediction supportsface enhancement and quality; input and output URLs exist remotely, outputs~30days. No promise of private retention/deletion. Disabled until owner clears those disclosures/credits.
- Replicate RealESRGAN/GFPGAN explicit pinned schema version; trial dataURL input limited256KiB. Paid approval required, budget0default. Replicate prepaid balance/payment method required. CodeFormer was not selected; its noncommercial license does not describe all Replicate models.
- Budgets count attempted calls conservatively and persist atomically in data/image-credit-budget.json before provider POST. Unreadable/failed budget persistence blocks requests. Single-process queue serializes reservations; not a multiple-server wallet. External operations should stay disabled unless owner approves scoped credit test. Provider may charge timeout/failure; no automatic POST retries.
- Mock tests do not prove current provider credentials/API outcome. One real bounded synthetic Clipdrop trial returnedHTTP200,image/jpeg,512x384,14572bytes,header99remainingcredits. Original synthetic input256x192; both images visually checked. One attempted call persisted before POST; no retry/fallback. This is an upscaling smoke test, not face restoration or a personal-photo quality benchmark. No personal photos uploaded during development.

Sources:
https://clipdrop.co/apis/docs/image-upscaling
https://clipdrop.co/apis/account
https://replicate.com/docs/reference/http
https://replicate.com/docs/topics/billing/prepaid-credit
https://replicate.com/nightmareai/real-esrgan/api/schema
https://www.pixelbin.io/pricing
https://github.com/pixelbin-io/pixelbin-js-admin
https://api.pixelbin.io/service/public/transformation/v1.0/predictions/schema/sr_upscale
