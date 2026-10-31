'use client';
import type {AssignmentActivity as Activity} from '@/lib/assignment-review-contracts';
import {assignmentActivityLine,assignmentActivityNotice} from '@/lib/assignment-review-contracts';
export function AssignmentActivity({activity}:{activity:Activity}){
 return <details className="assignment-activity"><summary>Usage and recovery details{activity.pending?` · ${activity.pending} awaiting confirmation`:''}</summary><p className="muted">{assignmentActivityNotice}</p><ul>{activity.parts.map(part=><li key={part.key}><strong>{part.label}</strong><p className="muted">{assignmentActivityLine(part)}</p></li>)}</ul>{activity.pending>0&&<p role="status">Credit for uncertain or in-flight requests stays held. The original outcome must be reconciled before another attempt; refreshing this screen never repeats work.</p>}{activity.overrun&&<p role="status">Reported usage exceeded an admitted limit. Further paid execution is stopped and the customer debit remains capped at the approved maximum.</p>}</details>;
}
