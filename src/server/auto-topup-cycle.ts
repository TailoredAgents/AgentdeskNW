import {createHash} from 'node:crypto';
import type {Actor} from '../lib/contracts';
import type {AutoTopUpSettings} from '../lib/auto-topup-contracts';
import {getDb,newId,now} from './db';
/** Called inside wallet transactions. Observe actual balance recovery before a later debit can hide it. */
export function observeAutoTopUpBalance(actor:Actor,available:()=>number):void {
 const db=getDb(),scope=[actor.organizationId,actor.id],row=db.prepare('SELECT data FROM auto_topup_settings WHERE organization_id=? AND user_id=?').get(...scope) as {data:string}|undefined;
 if(!row)return;const current=JSON.parse(row.data) as AutoTopUpSettings;
 if(!current.enabled||current.armed||db.prepare("SELECT 1 FROM auto_topup_purchases WHERE organization_id=? AND user_id=? AND status IN ('pending','unknown')").get(...scope)||available()<=current.triggerCents)return;
 const value={...current,armed:true,version:current.version+1,updatedAt:now()},payload={cycle:value.cycle,version:value.version},hash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
 db.prepare('UPDATE auto_topup_settings SET data=? WHERE organization_id=? AND user_id=?').run(JSON.stringify(value),...scope);
 db.prepare('INSERT INTO auto_topup_events VALUES(?,?,?,?,?,?,?,?)').run(newId('auto_topup_event'),...scope,actor.officeId,`recovered:${value.cycle}:${value.version}`,hash,JSON.stringify({kind:'balance_recovered',settings:value}),now());
}
