// User-requested starting itinerary; only delivered through the guarded server API.
// Editing this template never replaces a saved Supabase plan.
const starter = {
  "version": 1,
  "title": "Japan / Japow",
  "start": "2027-01-27",
  "end": "2027-02-05",
  "travelers": 1,
  "budget": 5000,
  "notes": "Flight evidence: screenshot attached in “Japan booking confirmation”, read October 11, 2026. International travel is January 27–February 5, 2027. The airline page shows On request, so ticket issuance remains to be verified. All flight times are local.\n\nThe canonical Sheet still contains the superseded January 22–29 scenario. Its selected domestic flights and lodging dates are not current. Do not reuse its $5,099 forecast or quotes as a revised total. Replan Tokyo/Hokkaido dates, riding days and hotel nights around the international flight. $5,000 target is the prior Sheet assumption and is editable; current costs are unknown.\n\nThe Bellwood is on the wishlist from the “Check Japow trip updates” conversation. Its date recommendation used the obsolete scenario; choose a date only after the new Tokyo nights are planned.",
  "sourceUrl": "https://docs.google.com/spreadsheets/d/1d5e2shC-RcdcFani3X3QRmnV9E_5gX4bpAHbw3AvSME/edit",
  "sourceReadAt": "2026-10-11",
  "days": [
    {
      "id": "depart",
      "date": "2027-01-27",
      "location": "NYC / in flight",
      "morning": "Get to JFK with time to check snowboard baggage.",
      "afternoon": "JFK departure 12:30 p.m. · Japan Airlines-operated flight.",
      "evening": "In flight",
      "sleep": "Aircraft",
      "risk": "Verify ticket issuance and current flight times.",
      "riding": false
    },
    {
      "id": "arrive",
      "date": "2027-01-28",
      "location": "Tokyo",
      "morning": "In flight",
      "afternoon": "Haneda arrival 4:55 p.m. local · next day.",
      "evening": "Allow immigration and baggage time; choose arrival hotel.",
      "sleep": "Tokyo hotel to arrange",
      "risk": "Arrival time from prior flight context; reconfirm with the airline. Hotel not booked.",
      "riding": false
    },
    {
      "id": "return",
      "date": "2027-02-05",
      "location": "Tokyo / NYC",
      "morning": "Haneda departure 11:05 a.m. local.",
      "afternoon": "JFK arrival 10:00 a.m. local, same date.",
      "evening": "Home",
      "sleep": "Home",
      "risk": "Protect the Haneda departure; plan Hokkaido return and final Tokyo night with winter buffer.",
      "riding": false
    }
  ],
  "bookings": [
    {
      "id": "international",
      "item": "International flights",
      "provider": "American / Japan Airlines · JFK / HND",
      "status": "On request",
      "notes": "Outbound Jan 27, 2027, JFK 12:30 p.m.; arrival Haneda Jan 28 4:55 p.m. Return Feb 5, Haneda 11:05 a.m.; JFK 10:00 a.m. All local times. Airline checkout screenshot says On request; confirm issued ticket. Paid amount was not shown.",
      "confirmation": "",
      "url": "https://www.aa.com/",
      "due": "",
      "estimate": null,
      "actual": null
    },
    {
      "id": "domestic",
      "item": "Tokyo / Hokkaido flights",
      "provider": "HND / CTS · dates to decide",
      "status": "Researching",
      "notes": "Replan against Jan 27–Feb 5 international travel. The old Jan 24–28 ANA scenario is superseded.",
      "confirmation": "",
      "url": "",
      "due": "",
      "estimate": null,
      "actual": null
    },
    {
      "id": "tokyo-hotel",
      "item": "Tokyo lodging",
      "provider": "Neighborhood and nights to decide",
      "status": "Not started",
      "notes": "Arrival Jan 28. Determine Tokyo time and final night before the Feb 5 morning flight.",
      "confirmation": "",
      "url": "",
      "due": "",
      "estimate": null,
      "actual": null
    },
    {
      "id": "niseko-hotel",
      "item": "Niseko lodging",
      "provider": "Hirafu · nights to decide",
      "status": "Researching",
      "notes": "Prior preference is walkable lift and dinner access. New Hokkaido dates and lodging quotes needed.",
      "confirmation": "",
      "url": "",
      "due": "",
      "estimate": null,
      "actual": null
    },
    {
      "id": "transfers",
      "item": "CTS / Niseko transfers",
      "provider": "Scheduled or private · to decide",
      "status": "Waiting",
      "notes": "Check the current winter timetable against the eventual domestic flight. Do not reuse the old 15:30 bus connection.",
      "confirmation": "",
      "url": "",
      "due": "",
      "estimate": null,
      "actual": null
    },
    {
      "id": "baggage",
      "item": "Snowboard baggage",
      "provider": "Selected airlines",
      "status": "Researching",
      "notes": "Bringing own board, boots and bindings per prior Sheet. Verify allowance for the actual ticket and domestic carrier.",
      "confirmation": "",
      "url": "",
      "due": "",
      "estimate": null,
      "actual": null
    },
    {
      "id": "insurance",
      "item": "Travel insurance",
      "provider": "Provider to choose",
      "status": "Not started",
      "notes": "Review winter sports and delay coverage for new dates.",
      "confirmation": "",
      "url": "",
      "due": "",
      "estimate": null,
      "actual": null
    },
    {
      "id": "lift-pass",
      "item": "Niseko lift pass",
      "provider": "Niseko United",
      "status": "Not started",
      "notes": "Riding-day count needs replanning; do not reuse the old three-day pass assumption as purchased.",
      "confirmation": "",
      "url": "",
      "due": "",
      "estimate": null,
      "actual": null
    },
    {
      "id": "bellwood",
      "item": "The Bellwood / Bell Sushi",
      "provider": "Tokyo",
      "status": "Researching",
      "notes": "Wishlist item. Choose cocktail bar or sushi and a date matching the revised Tokyo nights. No reservation made.",
      "confirmation": "",
      "url": "https://www.tablecheck.com/shops/thebellwood/reserve",
      "due": "",
      "estimate": null,
      "actual": null
    }
  ],
  "tasks": [
    {
      "id": "ticket-status",
      "title": "Verify airline ticket confirmation; checkout showed On request.",
      "due": "",
      "done": false
    },
    {
      "id": "date-replan",
      "title": "Set Tokyo and Hokkaido nights around January 27–February 5.",
      "due": "",
      "done": false
    },
    {
      "id": "domestic-align",
      "title": "Choose domestic flights and check winter transfer connections.",
      "due": "",
      "done": false
    },
    {
      "id": "budget-refresh",
      "title": "Enter actual international fare and refresh lodging, transfers and pass estimates.",
      "due": "",
      "done": false
    },
    {
      "id": "bellwood-plan",
      "title": "Fit The Bellwood into the revised Tokyo stay.",
      "due": "",
      "done": false
    },
    {
      "id": "gear-pack",
      "title": "Confirm snowboard baggage allowance and prepare gear packing list.",
      "due": "",
      "done": false
    }
  ]
};

export function startingPlan(owner) {
  return owner?.email?.toLowerCase() === 'bartconsedine@gmail.com' ? structuredClone(starter) : null;
}
