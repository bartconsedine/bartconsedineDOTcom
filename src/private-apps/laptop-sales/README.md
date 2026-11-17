# Laptop sales

Open `/admin/apps/laptop-sales` to prepare used Omarchy laptops, copy ready-to-share listings, and track fulfillment. Sales use private inventory and shareable checkout links. Each admin starts with separate inventory and the existing workspace access controls apply. No storefront, order sync, or customer accounts are required.

## Prepare and sell a laptop

1. Add the model, specs, battery condition, included accessories, and price in USD. Start in **Preparing**.
2. Remove the previous owner's data and verify the machine's actual hardware before committing to a sale. Use Omarchy's [prepare for another owner flow](https://omarchy.org/manual/getting-started/). Install and test LibreOffice, GIMP, Inkscape, Scribus, Kdenlive, Audacity, and Okular. Verify licensing and redistribution obligations for the actual image you ship. Tell buyers about known hardware and file-format limitations.
3. In [Stripe Payment Links](https://dashboard.stripe.com/payment-links), make a dedicated one-time USD link for this particular unit. Set quantity to one, disable quantity adjustment, [limit the link to one payment](https://docs.stripe.com/payment-links/customize#limit-the-number-of-times-a-payment-link-can-be-paid), and collect shipping addresses. Set the appropriate shipping options, taxes, supported locations, and return terms in the actual checkout and listing. Match the Stripe price to the admin price. The checklist records the operator's verification.
4. Complete the checks and save as **Ready to sell**. Select the laptop and open **Share listing** to copy the buyer-facing details and checkout link once support is configured. Share this text in your sales channel of choice. If you withdraw a listing, deactivate its link in Stripe before editing or replacing it. A previously copied link can still be used while active.
5. Verify the payment succeeded and obtain the shipping details in Stripe, then mark the laptop **Paid**. Mark **Shipped** once the carrier accepts it. These stages are manual. Stripe handles checkout and customer receipts.

Inventory is saved to the existing Supabase `app_data` row under `(owner_id, laptop-sales, inventory)` with a limit of 50 units. The guarded per-app endpoint applies shared workspace authorization and origin checks, then validates the complete inventory. Each save compares the previously loaded revision. A conflict preserves the form in the browser while the operator copies their edits and reloads to reconcile. No database migration is required. Customer contact and payment details stay in the providers.

## Email-only support

Use a dedicated inbound address on a Resend receiving subdomain. Configure these server-side deployment variables:

| Variable | Value |
| --- | --- |
| `LAPTOP_SUPPORT_EMAIL` | Exact customer-facing inbound address |
| `LAPTOP_SUPPORT_FROM` | Address on a Resend verified sending domain |
| `LAPTOP_SUPPORT_FORWARD` | Separate monitored mailbox. It must never auto-forward back to the inbound address. |
| `LAPTOP_RESEND_API_KEY` | Resend API key with permission to read inbound mail and send replies. Keep it server-side. |
| `LAPTOP_RESEND_WEBHOOK_SECRET` | Resend signing secret for the endpoint |

Add an `email.received` webhook pointing at `/api/laptop-support` on the configured deployment. The webhook authenticates Resend using its [signed raw payload](https://resend.com/docs/webhooks/verify-webhooks-requests) and accepts messages addressed to the configured mailbox. Verify DNS, sending and receiving permissions, and end-to-end delivery before sharing a listing. Configuring variables alone does not check connectivity.

The handler relays the sender and plain-text message to the monitored mailbox. **Setup**, **Office**, and **Creative** each trigger a matching guide for a new email with that exact subject. Other new emails receive an acknowledgment and request for context. Both automatic responses require a DMARC pass, a new thread, and no attachments. Order-specific questions, return requests, follow-up replies, and messages from unverifiable senders go to the monitored mailbox. The automation never discloses order data or issues refunds. It ignores automated and bulk mail. HTML and attachments stay in the original message in Resend. Reply manually from the monitored support mailbox using the relay, and check original messages in Resend when authentication or content needs review.

Resend retains the inbound message, queues webhook delivery, and owns retry and sent-email state. The handler keeps no local customer queue or conversation copy. It uses distinct provider idempotency keys for the relay and automated response, and limits processing to 23 hours after receipt to stay inside Resend's 24-hour key window. Use the Resend event and email views to investigate failed webhooks or delivery and respond to older messages manually. If configuration changes during an in-flight retry, inspect both sends before replaying.

## Verification

Tests exercise the validation and revision contract, shared authorization and origin handling, and a signed webhook with mocked Resend HTTP requests. Browser screenshots use fixture inventory and a simulated support mailbox. Actual checkout, inbound mail, and a hosted Supabase save and reload require authenticated provider setup and testing.
