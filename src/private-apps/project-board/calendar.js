import 'server-only';
import { googleSession } from '../calendar-companion/google-session';
import { availableCalendars } from '../calendar-companion/google-events';
import { BoardError } from './model';
export async function verifyCalendarLink(owner,value){try{const google=await googleSession(owner);if(!(await availableCalendars(google)).some(c=>c.id===value.calendar_id))throw new Error('Unavailable');const event=await google.get(value.calendar_id,value.event_id);if(event.status==='cancelled')throw new Error('Deleted');}catch{throw new BoardError('Calendar link could not be verified. Reconnect Calendar companion, refresh events and retry.',409);}}
