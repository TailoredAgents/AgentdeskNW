import type {Actor} from '../lib/contracts';
import type {ProactivePreferences} from '../lib/proactive-contracts';
import {getDb} from './db';
export function validTimeZone(zone:string){try{new Intl.DateTimeFormat('en-US',{timeZone:zone}).format();return true;}catch{return false;}}
export function employeeTimeZone(actor:Actor):string {const row=getDb().prepare('SELECT data FROM proactive_preferences WHERE organization_id=? AND office_id=? AND user_id=?').get(actor.organizationId,actor.officeId,actor.id) as {data:string}|undefined;return row?(JSON.parse(row.data) as ProactivePreferences).timeZone:'America/New_York';}
export function localClock(timeZone:string,instant=new Date()){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',weekday:'short'}).formatToParts(instant),get=(type:string)=>parts.find(p=>p.type===type)!.value;
 return {date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`,weekday:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(get('weekday'))};
}
/** Latest due wall-clock slot only. Date+time identity deduplicates fall-back; spring gaps catch up once. */
export function dueBriefingSlot(preferences:ProactivePreferences,instant=new Date()):string|null {
 const local=localClock(preferences.timeZone,instant);if(!preferences.weekdays.includes(local.weekday))return null;const time=[...preferences.times].sort().filter(time=>time<=local.time).at(-1);return time?`${local.date}T${time}`:null;
}
