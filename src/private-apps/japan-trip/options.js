// Authored, read-only scenarios. No reservations, quotes, or saved selections.
export const places = {
  T: { name: 'Tokyo', lat: 35.68, lon: 139.76, color: '#edb19a' },
  N: { name: 'Niseko / Hirafu', lat: 42.86, lon: 140.70, color: '#a6e4d6' },
  R: { name: 'Rusutsu', lat: 42.74, lon: 140.91, color: '#e0ca83' },
  M: { name: 'Tomamu', lat: 43.06, lon: 142.63, color: '#bfb3ed' },
  S: { name: 'Sapporo', lat: 43.06, lon: 141.35, color: '#91bce6' },
  O: { name: 'Otaru', lat: 43.19, lon: 140.99, color: '#e9bada' },
};
export const sources = [
  ['Niseko airport transfers · 2026–27 timetable', 'https://nisekogroundservice.jp/scheduled-transfers/'],
  ['Rusutsu & Kiroro day trips · operator', 'https://nisekogroundservice.jp/rusutsu-kiroro-day-trips/'],
  ['Tomamu · official winter access', 'https://www.snowtomamu.jp/winter/en/access/'],
];
const templates = [
  ['balanced', 'The balanced classic', 'Best starting point', 'TTNNNNTT', 'A proper Tokyo visit and three uninterrupted mountain days.', ['Three full riding days from one Hirafu base.', 'Tokyo time at both ends; February 3 return adds recovery time.'], ['Fewer riding days than the powder-first route.', 'Four Hirafu nights still need fresh lodging quotes.'], 'Medium'],
  ['powder', 'Powder first', 'Most riding', 'TNNNNNNT', 'Get north early and keep five full days for snow.', ['Five full riding days without moving mountain hotels.', 'More chances to ride around poor visibility or lift closures.'], ['Only the arrival evening and final evening in Tokyo.', 'February 4 return leaves a single overnight buffer.'], 'Medium'],
  ['city', 'Tokyo with a snow escape', 'More city time', 'TTTNNNTT', 'Three Tokyo nights first, then a compact mountain stay.', ['Two full Tokyo days before flying north.', 'Room for Shibuya, Asakusa and a Bellwood wishlist evening.'], ['Only two full riding days.', 'Domestic flights and long transfers for a short snow stay.'], 'Medium'],
  ['finish', 'Tokyo grand finale', 'City after snow', 'TNNNNTTT', 'Ride first, then relax into Tokyo for the final three nights.', ['Three riding days followed by two full Tokyo days.', 'Return from Hokkaido February 2 gives extra disruption recovery time.'], ['Fly north the morning after the long-haul arrival.', 'Jet lag may affect the first mountain day.'], 'Medium'],
  ['buffer', 'The unhurried route', 'Extra return buffer', 'TTNNNTTT', 'A Tokyo day on arrival, two riding days, and a slower finish.', ['No immediate domestic flight after the arrival night.', 'February 2 return leaves two full Tokyo days before departure.'], ['Only two full days on snow.', 'Less mountain time for the same international journey.'], 'Lower'],
  ['sapporo', 'Snow & Sapporo', 'Food and city', 'TNNNNSTT', 'Three riding days, one Sapporo night, then Tokyo.', ['Adds a Hokkaido city evening without changing international flights.', 'Three full riding days plus a February 3 flight south.'], ['An additional hotel change with snowboard luggage.', 'Mountain-to-city transfer consumes most of February 2.'], 'Higher'],
  ['otaru', 'Canal town detour', 'Scenic stop', 'TTNNNOTT', 'Two days riding, then an Otaru evening before Tokyo.', ['Adds a canal walk and a different Hokkaido overnight.', 'A full Tokyo day before and after Hokkaido.'], ['Only two riding days and another hotel change.', 'Otaru-to-airport connection needs a fresh timetable check.'], 'Higher'],
  ['rusutsu', 'Rusutsu base camp', 'Alternative mountain', 'TTRRRRTT', 'Swap Hirafu for a single Rusutsu mountain base.', ['Three full riding days without a resort-to-resort move.', 'Keeps the balanced route’s Tokyo time and February 3 return.'], ['Accommodation and dining access need property-level checks.', 'Airport transfers, lift passes and lodging need separate quotes.'], 'Medium'],
  ['split', 'Two-mountain sampler', 'Most variety', 'TNNNRRRT', 'Two Niseko days, a transfer day, then two Rusutsu days.', ['Four full riding days across two mountain bases.', 'Lets you compare both areas on the same trip.'], ['February 1 is reserved for the resort change, not a full riding day.', 'Most luggage handling; February 4 flight leaves one overnight buffer.'], 'Higher'],
  ['tomamu', 'Tomamu snow retreat', 'Resort and rail', 'TTMMMMTT', 'A single Tomamu base with Tokyo time at both ends.', ['Three full riding days and one mountain hotel.', 'Official access includes rail via Minami-Chitose as well as buses.'], ['Reserved rail seats and resort shuttle need coordination.', 'Different resort experience; check terrain, lodging and passes first.'], 'Medium'],
];
const addDate = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const labelDate = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const mountain = key => ['N', 'R', 'M'].includes(key);
export function buildOptions(plan) {
  // These proposals were researched for the current flight evidence. Never silently shift bookings.
  if (plan.start !== '2027-01-27' || plan.end !== '2027-02-05') return [];
  return templates.map(([id, title, tag, nights, summary, pros, cons, complexity]) => {
    const days = [...nights].map((place, index) => {
      const previous = nights[index - 1];
      const transfer = Boolean(previous && previous !== place);
      const riding = index > 0 && !transfer && mountain(place);
      let blocks;
      if (index === 0) blocks = [['16:55–20:30', 'Haneda arrival, immigration, bags and hotel transfer. Flight evidence remains On request.'], ['20:30–22:00', 'Easy dinner near the hotel; recover from the long flight.']];
      else if (transfer && previous === 'T') blocks = [['08:00–12:00', 'Proposed Haneda → New Chitose flight window; flight not selected.'], ['12:00–18:00', `Collect board bag and transfer to ${places[place].name}; confirm bus or rail connection before booking.`], ['18:00–21:00', 'Check in, dinner and prepare gear.']];
      else if (transfer && place === 'T') blocks = [['08:00–13:00', 'Leave Hokkaido lodging and reach New Chitose with winter and baggage buffer.'], ['13:00–18:00', 'Proposed CTS → HND flight and hotel-transfer window; no exact flight selected.'], ['18:00–21:00', 'Tokyo dinner if arrival allows; final night should have easy Haneda access.']];
      else if (transfer) blocks = [['09:00–16:00', `Pack, check out and transfer from ${places[previous].name} to ${places[place].name}. Allow a full move day; transport unbooked.`], ['16:00–21:00', `Check in and explore ${places[place].name}; no riding time counted.`]];
      else if (riding) blocks = [['08:00–09:00', 'Breakfast, gear and lift access.'], ['09:00–16:00', `Full riding day at ${places[place].name}; hours are planning targets, lifts and weather decide actual access.`], ['17:00–21:00', 'Rest, onsen if available, and dinner.']];
      else blocks = [['09:00–13:00', 'Tokyo neighborhood time: choose Asakusa / Ueno or a relaxed breakfast and walk.'], ['13:00–17:00', 'Choose Shibuya / Harajuku, shopping or a museum.'], ['18:00–22:00', index === 7 ? 'Dinner, pack and stay near an easy Haneda connection.' : 'Dinner; The Bellwood is a wishlist option, subject to availability.']];
      return { date: addDate('2027-01-28', index), place, riding, transfer, blocks };
    });
    return { id, title, tag, summary, pros, cons, complexity, nights, days, riding: days.filter(d => d.riding).length, moves: days.filter(d => d.transfer).length, tokyo: [...nights].filter(p => p === 'T').length };
  });
}
export function routeFor(option) {
  const route = [];
  for (const day of option.days) if (route.at(-1) !== day.place) route.push(day.place);
  return route;
}
export function project(lon, lat) { return [(lon - 128) * 70, (46 - lat) * 88]; }
