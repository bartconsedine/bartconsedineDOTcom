# TLDR news wire

The Morning signal app and paired `/tv` display show the public latest issues of TLDR Tech, AI, Dev, InfoSec and DevOps. The ticker is independent of the 24 manually curated routine/briefing cards. TV mode can open with zero cards; Hide morning briefing leaves only the ticker. The optional personal morning briefing remains available.

Each issue includes every extracted editorial article, including Quick Links. Explicit sponsor/advertisement items are excluded wherever they occur. We expose only headlines, public URLs, edition labels, issue dates and source freshness metadata. URL duplicates retain all edition/date labels. No Gmail integration, mail export, subscriber capability, raw newsletter body, new secret or schema migration is involved.

## Sources and history

`https://tldr.tech/<edition>/archives` is authoritative for the available public issue dates; the archive currently links `/ai/YYYY-MM-DD` as well. Older issues advances one archive issue per edition, with independent dates displayed. No article-count cap is applied, and the ticker cycles through the whole selected group of issues. History is limited to dates listed by the public archives (up to page 999); public archives can lag email. Source details explicitly label older issues, stale cache and unavailable editions.

`server.js` uses Next's existing Data Cache for disposable **public source results**, revalidated every 30 minutes. A thrown fetch/parser/link failure preserves the last successful entry; each edition has an independent key, with checkedAt included. It contains no owner or session data and is not authoritative app storage. Public archives remain the source of truth. There is no durable imported user dataset or integration job state. The browser polls every minute and keeps loaded headlines after failures, including the unavailable edition's last-loaded entries after a partial cold-cache failure. A first visit with no successful source cache honestly shows unavailable/empty sources and retries. Cache eviction plus source outage cannot reconstruct an issue that has never loaded on that browser.

Ticker on/off, briefing visibility, issue page, current headline and pause are disposable presentation controls for the current session, just like existing TV mode/fullscreen; they do not promise a saved preference or write viewer data. Existing saved routine data stays in owner-scoped Supabase.

## Safe links

Only explicit article heading links are parsed. Named/numeric entities are decoded, marketing parameters removed, and functional parameters (YouTube v, document IDs, public publisher share parameters) retained. Credentials, IP literals, non-web schemes, custom ports, local/internal domains, subscriber/unsubscribe/referral destinations and ad hosts are rejected. Public archive `link(s).tldr.tech` redirects are resolved with a four-redirect bound. Every network target is DNS-checked against non-public/reserved IPv4 ranges and the validated address is pinned into the TLS request, preventing DNS rebinding; IPv6-only targets fail closed. Responses have byte and time bounds. Link validation failure throws for the entire edition rather than caching a silently truncated issue. QR codes are generated locally by the pinned qrcode library and contain only the sanitized public article URL; no external QR service sees data.

The existing TV API verifies its read-only pairing before returning the ticker. Pending/expired/revoked screens cannot fetch it. The existing admin app dispatcher still verifies live identity and owner/grant scope before its GET handler. No changes to consent, credentials, cookie lifetimes, pairing RPC, owner records, sharing or Robot Party activation are made. Responses remain private/no-store; only the public upstream cache is shared.

## Controls and verification

OK/Enter or Pause opens a large QR and freezes that headline across background refresh. Back/Escape/Backspace resumes; Left/Right changes headlines, Up/Down selects ticker controls, Tab cycles inside the QR dialog. The separate ticker toggle and Hide/Show morning briefing controls are available in TV mode. Reduced-motion preference disables automatic advancement and horizontal motion. The selected issue retains all articles independently of routine cards.

Tests cover extraction above 24 articles, sponsor placement, deduplication, safe URL parameters, private/reserved/mixed DNS, redirect bounds/address pinning, history, stale metadata, source/parser errors, pairing denial, pause/refresh/Back, revocation, empty sources and reduced motion. Real browser QA uses a temporary local fixture route removed before release; it is not an authentication bypass in production. Physical Google TV remote compatibility, OmarchyTV installation and TV wake are separate and require the user's actual device. Content scheduling, opening `/tv`, and physically powering on a TV are distinct operations.
