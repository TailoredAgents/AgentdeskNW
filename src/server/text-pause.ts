import type {Actor} from '../lib/contracts';
import type {TextExecution} from './text-execution';
import {getDb,now} from './db';

export function textPauseState(reviewId:string):'requested'|'paused'|'resumed'|undefined {
 return (getDb().prepare('SELECT state FROM assignment_text_controls WHERE review_id=?').get(reviewId) as {state:'requested'|'paused'|'resumed'}|undefined)?.state;
}
export class TextPauseBoundary extends Error {}
/** Called only outside transport, before dispatch or processing a saved response. */
export function checkTextPause(actor:Actor,execution:TextExecution){
 const reviewId=execution.data.metering?.reviewId;if(!reviewId)return;
 const state=textPauseState(reviewId);if(state!=='requested'&&state!=='paused')return;
 const owned=getDb().prepare('SELECT 1 FROM assignment_reviews WHERE id=? AND organization_id=? AND office_id=? AND user_id=?').get(reviewId,actor.organizationId,actor.officeId,actor.id);
 if(!owned)throw new Error('Original pause ownership is unavailable');
 getDb().prepare("UPDATE assignment_text_controls SET state='paused',updated_at=? WHERE review_id=? AND state='requested'").run(now(),reviewId);
 throw new TextPauseBoundary('Assignment paused. Completed work and usage remain saved. Any returned response is retained without executing its tools. Continue or change instructions from the current spending review.');
}
