# Laptop sales

The private workspace at `/admin/apps/laptop-sales` prepares used Omarchy laptops, copies buyer-facing listings and tracks manual fulfillment. Each owner has separate inventory; existing app sharing permits viewers to read and editors to save. Empty inventory contains no sample laptops.

## Prepare a unit

1. Add its actual model, specifications, battery condition, accessories and USD price. Start in **Preparing**.
2. Erase previous-owner data and verify the actual hardware, sleep, networking, audio and buyer first-boot experience. Install and test the listed software before checking it off; consider file compatibility and distribution obligations for the image you ship.
3. Create a dedicated live Stripe Payment Link for the unit. In Stripe, verify a single payment/quantity, shipping collection, price, taxes, supported destinations and return terms. This app records your checklist; it does not verify or configure Stripe.
4. Save a monitored support email with the listing, complete every check and save as **Ready to sell**. Open **Share listing** to copy the saved description and checkout link. Verify payment in Stripe before marking **Paid**, and carrier acceptance before marking **Shipped**.
5. Deactivate the payment link in Stripe when withdrawing or replacing a listing. Previously copied links remain usable while active.

No payment, fulfillment, installation, wipe, email or account action occurs when a checklist is saved. Customer/payment records stay outside this inventory. Do not add private customer data to listing descriptions because copied listings are intended for buyers.

## Persistence and chat editing

Supabase `public.app_data` is the source of truth under `(owner_id, laptop-sales, inventory)`. The value is an array of up to 50 stable-UUID listings, each with model, specs, condition, price, checkout, supportEmail, stage and boolean preparation checks. The validator rejects unknown fields, duplicate IDs/payment links, test or non-Stripe checkout URLs, invalid prices and incomplete sell-ready stages. The request limit is 150,000 bytes. No migration or new secret is required.

The shared protected API applies live workspace authorization, exact-origin POST checks and private/no-store responses. GET loads saved inventory; POST `{listings, expectedAt}` compares the exact database revision atomically. A conflict or failed save preserves the current form and displays an error. Reload reconciles with the saved version; unsaved form input is temporary. A successful response supplies the confirmed revision. Switching workspace owners clears the prior snapshot and ignores late saves from the old context.

The reviewed validator/key/size contract is registered in `src/lib/app-data-contracts.js`. Follow [chat maintenance](../../../docs/CHAT_APP_DATA.md) and use:

```sh
node scripts/app-data-sql.mjs read laptop-sales bartconsedine@gmail.com
node scripts/app-data-sql.mjs write laptop-sales bartconsedine@gmail.com /absolute/private/change.json
```

The protected 0600 transfer contains exactly `{value, expectedAt}`. Read immediately before editing, retain stable IDs and unrelated listings, require a confirmed guarded save and reread. The generator emits arguments for the verified website connector; it does not connect by itself. Do not edit templates to change saved inventory.

## Pending email integration

PR #43 originally proposed automatic inbound email guides and relay through Resend. That legacy public webhook is not registered by this inventory release: it kept delivery/retry state only in Resend and does not meet the current requirement for durable integration state in Supabase. Support here is a saved address for manual replies, with explicit setup language. There is no automatic guide, acknowledgment or relay.

Completing email automation requires a reviewed durable delivery/idempotency contract, independently authorized server access and provider configuration, and live inbound/duplicate/retry/delivery verification. No mailbox, domain, credential, hosted migration, provider subscription or external message was created or changed. The unmerged original PR remains available as implementation evidence, not deployed functionality.

## Verification

Targeted local tests cover validation, owner isolation, denied/foreign-origin requests, stale saves, database errors, editor conflict retention, saved reload and viewer controls. Real Postgres fixtures exercise the chat generator's roundtrip, stale revisions, injection text and cross-owner separation. These use synthetic data and do not establish hosted persistence or a real Stripe checkout.

Authenticated hosted save/reload, fresh-session access, cross-user denial and desktop/mobile screenshots remain required acceptance checks when the existing browser connection is available. Provider checkout and real support-mail delivery are unverified. See the release report for actual full-suite/build and deployment results.
