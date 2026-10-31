import {transcriptStatements} from './notes';
export const correspondenceMethodVersion='correspondence-review-v2';
type Topic='repair'|'operating'|'timing';
const topics:Record<Topic,RegExp>={repair:/\b(repairs?|rehab|renovation|contractor|scope of work)\b/i,operating:/\b(operating|taxes|insurance|expenses|rental|rent)\b/i,timing:/\b(timing|timeline|pause|later|months?|days?|weeks?)\b/i};
/** Cues for review, never an investor-state mutation or a semantic certainty claim. */
export function reviewCorrespondenceIntent(text:string){
 const active=new Set<Topic>(),resolved=new Set<Topic>(),excerpts:{topic:Topic;kind:'mentioned'|'reported_resolved';excerpt:string}[]=[];
 const statements=transcriptStatements(text);
 for(const statement of statements)for(const clause of statement.text.split(/\b(?:but|however)\b/i)){
  for(const [topic,pattern] of Object.entries(topics) as [Topic,RegExp][]){
   if(!pattern.test(clause))continue;
   const resolvedCue=!['question','conditional','uncertain','suggestion'].includes(statement.meaning)&&/\b(no longer (?:a |an |my |the )?(?:concern|issue|problem)|no longer (?:worried|concerned) about|not (?:a |an |my |the )?(?:concern|issue|problem)|not concerned about|(?:isn['’]t|aren['’]t) (?:a |an )?(?:concern|issue|problem)|(?:is|are|has been|have been) (?:now )?resolved)\b/i.test(clause);
   (resolvedCue?resolved:active).add(topic);excerpts.push({topic,kind:resolvedCue?'reported_resolved':'mentioned',excerpt:clause.trim()});
  }
 }
 // Conflicting statements in the same message need clarification, not an automatic resolution.
 const conflicts=[...resolved].filter(topic=>active.has(topic));
 const declined=statements.some(statement=>statement.meaning!=='conditional'&&!/\b(?:do not|don['’]t) stop (?:contacting|texting|messaging|emailing)\b/i.test(statement.text)&&/\b(stop (?:contacting|texting|messaging|emailing)|do not (?:contact|text|email|message)|don['’]t (?:contact|text|email|message)|unsubscribe)\b/i.test(statement.text));
 return {methodVersion:correspondenceMethodVersion,activeTopics:[...active],reportedResolvedTopics:[...resolved],conflicts,contactDeclined:declined,conditional:statements.some(statement=>['conditional','uncertain'].includes(statement.meaning)),excerpts};
}
