import type {ProactiveDeliveryStatus} from '../lib/proactive-contracts';
import {getDb} from './db';
export function proactiveDeliveryState(updateId:string,fallback:ProactiveDeliveryStatus):ProactiveDeliveryStatus {
 const row=getDb().prepare('SELECT d.status,o.status AS outbound_status FROM proactive_deliveries d LEFT JOIN messaging_outbox o ON o.id=d.outbound_id WHERE d.update_id=?').get(updateId) as {status:ProactiveDeliveryStatus;outbound_status:ProactiveDeliveryStatus|null}|undefined;
 return row?.outbound_status??row?.status??fallback;
}
