---
name: japan-command-center
description: Continue Japan or Japow trip planning in the private Japan command center, reconcile flight evidence with the canonical Sheet, or maintain this app's itinerary, bookings, budget and checklist.
---

# Japan trip command center

The app is `/admin/apps/japan-trip`. Read its [README](../../../src/private-apps/japan-trip/README.md) and [model](../../../src/private-apps/japan-trip/model.js) before changing data or behavior. For app implementation, use [admin-apps](../admin-apps/SKILL.md); for repository delivery, use [pr](../pr/SKILL.md).

## Establish the current trip

Read the signed-in owner's saved plan through the protected app API/UI. It is stored in Supabase `app_data`, slug `japan-trip`, key `plan-v1`. Never use another admin's plan or commit personal trip records, confirmation codes, or private attachments as application defaults.

The saved `sourceUrl` points to the canonical planning Sheet; it is not an automatic integration. When using it, discover its exact tab names and read a bounded summary plus the relevant inputs, flights, itinerary, budget, bookings and sources. Use available connected Drive/Sheets tools; if unavailable, report the missing source and continue only work independent of its contents.

Treat the Sheet as the authority for its model, but explicit user corrections and original booking evidence supersede stale assumptions. If the user says flight information was already sent, retrieve the relevant conversation/attachment or booking message before asking them to resend it. Verify the original evidence when available. Do not repeat an older Sheet date as a confirmed booking merely because another agent did so.

Resolve departure date, destination arrival date, return date, local times and ticket status from evidence. “On request” stays pending until a ticket confirmation establishes otherwise. Confirmation codes alone do not establish issued tickets. Keep all times local to the displayed airport/location.

Changing international dates requires reconsidering domestic flights, lodging nights, airport transfers, riding days, restaurant timing, lift passes and budget. Do not silently shift old reservations or present old quotes as current. Preserve known bookings; mark unverified dependencies and unknown costs explicitly. The app supports null estimated/actual prices; unknown is different from zero.

## Update and verify

Read current data immediately before editing. Make the smallest coherent change and preserve unrelated decisions. For a JSON import, validate against `model.js`, review the replacement, then explicitly save it. Read back after reload. Exports are transfer files, never the database. Record provenance, last source read, stale quotes, and unresolved discrepancies in notes.

App edits do not write back to Google Sheets. Edit the Sheet only when that is within the user's requested scope, using native connected tools and preserving formulas/validation/formatting; reread changes and dependent calculations. If a model still needs replanning, report that instead of inventing a revised itinerary or total.

Research changing fares, schedules, resort operations and transfer requirements with current sources when the task calls for it. Distinguish a quote from a held fare, a plan from a reservation, and a booking request from an issued ticket. Purchases, reservations, messages and new automations require user authorization for those actions; this skill does not grant it.
