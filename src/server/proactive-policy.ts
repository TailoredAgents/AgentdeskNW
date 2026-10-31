import type {Actor} from '../lib/contracts';
import type {ProactivePreferences,ProactiveTopic} from '../lib/proactive-contracts';
import {getDb} from './db';

/** Small policy read: notification workers must not recursively retrieve work/history. */
export function proactivePreference(actor:Actor):ProactivePreferences|null {
 const row=getDb().prepare('SELECT data FROM proactive_preferences WHERE organization_id=? AND office_id=? AND user_id=?').get(actor.organizationId,actor.officeId,actor.id) as {data:string}|undefined;
 return row?JSON.parse(row.data):null;
}
export function proactiveOwnsTopic(actor:Actor,topic:ProactiveTopic){const value=proactivePreference(actor);return !!value?.enabled&&value.topics.includes(topic);}
