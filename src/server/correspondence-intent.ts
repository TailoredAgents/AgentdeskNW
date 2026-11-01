import {transcriptStatements} from './notes';
export const correspondenceMethodVersion='correspondence-review-v3';
type Topic='repair'|'operating'|'timing';
const topics:Record<Topic,RegExp>={repair:/\b(repairs?|rehab|renovation|contractor|scope of work)\b/i,operating:/\b(operating|taxes|insurance|expenses|rental|rent)\b/i,timing:/\b(timing|timeline|paus(?:e|ed|ing)|later|months?|days?|weeks?)\b/i};
/** Narrow current-sender cues. Quoted/forwarded text cannot establish a new pause. */
function buyingPauseReport(text:string){
 const lines:string[]=[];let fenced=false,quotedUntil:string|null=null;
 const quotePairs:Record<string,string>={'"':'"',"'":"'",'“':'”','‘':'’','`':'`'};
 const closesQuote=(line:string,quote:string)=>line.endsWith(quote)||['.','!','?',',',';'].some(mark=>line.endsWith(quote+mark));
 for(const line of text.split(/\r?\n/)){
  const trimmed=line.trim();
  if(quotedUntil){if(closesQuote(trimmed,quotedUntil))quotedUntil=null;continue;}
  if(/^\s*```/.test(line)){fenced=!fenced;continue;}
  if(fenced)continue;
  if(/^\s*(?:On\b.+\bwrote:|[-\s]*Original Message[-\s]*$|[-\s]*Forwarded message[-\s]*$|Begin forwarded message:|From:\s)/i.test(line))break;
  const closing=quotePairs[trimmed[0]];
  if(closing){if(!closesQuote(trimmed.slice(1),closing))quotedUntil=closing;continue;}
  if(/^\s*>/.test(line))continue;
  lines.push(line);
 }
 const prefix='(?:(?:right now|for now),?\\s+)?',person="(?:I(?: am|['’]m| have|['’]ve)?|we(?: are|['’]re| have|['’]ve)?)",buying='(?:new |property )?(?:purchases|buying|purchasing|investments)',pause=new RegExp(`^${prefix}(?:${person} (?:currently |temporarily )?(?:paus(?:ing|ed) ${buying}|(?:put|putting) (?:my |our )?${buying} on hold|(?:taking|take) a break from ${buying})|(?:my|our) (?:buying plans|purchases) are (?:paused|on hold))\\b`,'i');
 const contrary=new RegExp(`^${prefix}(?:${person} (?:not |no longer )paus(?:ing|ed) ${buying}|${person} (?:ready to (?:buy|purchase)|buying again|purchasing again)|(?:my|our) (?:buying plans|purchases) are (?:not |no longer )(?:paused|on hold))\\b`,'i');
 const checkIn=/^(?:(?:please\s+)|(?:(?:can|could|would) you\s+))?(?:check(?: in| back)?(?: with (?:me|us))?|(?:contact|call|text|email|message) (?:me|us)|reach out(?: to (?:me|us))?)\s+next month\b/i;
 // A prefix cannot establish the scope of a pause. Equipment, geographic,
 // retrospective or other unsupported qualifiers remain clarification cues.
 const currentEnding=/^(?:\s+(?:for now|right now|now|at the moment|for the time being))?\s*[,.!?;]*$/i;
 const currentPause=(value:string)=>{const match=pause.exec(value);return !!match&&currentEnding.test(value.slice(match[0].length));};
 const currentText=lines.join('\n'),retrospective=/\b(?:that was (?:what (?:I|we) said|last\b)|that (?:is|was) what (?:I|we) (?:said|wrote)|(?:I|we) (?:said|wrote) (?:that|this) (?:last|before|previously)|back then)\b/i.test(currentText);
 const reports:string[]=[],contradictions:string[]=[],requests:string[]=[];
 for(const statement of transcriptStatements(currentText)){
  if(statement.speaker!==null||['conditional','uncertain','suggestion'].includes(statement.meaning))continue;
  if(checkIn.test(statement.text)&&!['negated'].includes(statement.meaning))requests.push(statement.excerpt);
  if(statement.meaning==='question')continue;
  const clauses=statement.text.split(/\b(?:but|however)\b/i).map(clause=>{const value=clause.trim().replace(/^[,;]\s*/,''),meaning=transcriptStatements(value)[0]?.meaning;return {value,pause:meaning==='statement'&&currentPause(value),contrary:['statement','negated'].includes(meaning??'')&&contrary.test(value)};});
  const unsupportedContrast=clauses.length>1&&clauses.some(clause=>!clause.pause&&!clause.contrary&&!checkIn.test(clause.value));
  for(const clause of clauses){if(clause.pause&&!unsupportedContrast&&!retrospective)reports.push(clause.value);if(clause.contrary)contradictions.push(clause.value);}
 }
 const conflicting=reports.length>0&&contradictions.length>0,reported=reports.length>0&&!conflicting;
 return {reported,conflicting,requestedCheckIn:reported&&requests.length?'next_month' as const:null,sourceExcerpts:[...reports,...contradictions,...requests].slice(0,6).map(value=>value.slice(0,500))};
}
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
 const buyingPause=buyingPauseReport(text);if(buyingPause.reported||buyingPause.conflicting)active.add('timing');
 return {methodVersion:correspondenceMethodVersion,activeTopics:[...active],reportedResolvedTopics:[...resolved],conflicts,contactDeclined:declined,conditional:statements.some(statement=>['conditional','uncertain'].includes(statement.meaning)),buyingPause,excerpts};
}
