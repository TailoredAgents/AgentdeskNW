import { z } from 'zod';
import type { NoteSummary } from '../lib/contracts';

export const transcriptSchema=z.string().trim().min(20,'Please enter at least 20 characters of authorized conversation notes.').max(50000,'Limit transcripts to 50,000 characters.');
export const noteExtractionVersion='transcript-review-v2';
export interface TranscriptStatement {speaker:string|null;excerpt:string;text:string;meaning:'question'|'conditional'|'uncertain'|'negated'|'suggestion'|'statement';commitment:boolean}
/** Conservative cues, not semantic verification. Keep the original wording, including rejected candidates. */
export function transcriptStatements(text:string):TranscriptStatement[] {
 return text.split(/\n+/).flatMap(line=>{
  let speaker=line.trim().match(/^([A-Za-z][A-Za-z .'-]{0,55}):\s/)?.[1]??null;
  return line.trim().split(/(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean).map(excerpt=>{
   speaker=excerpt.match(/^([A-Za-z][A-Za-z .'-]{0,55}):\s/)?.[1]??speaker;
   const content=excerpt.replace(/^([A-Za-z][A-Za-z .'-]{0,55}):\s/,'');
   const meaning:TranscriptStatement['meaning']=content.endsWith('?')?'question':/\b(if|unless|subject to|provided that|only after|only once|contingent|depends? on|depending on|pending)\b/i.test(content)?'conditional':/(?:\b(might|maybe|could|possibly|unsure|undecided|unknown|not sure|not decided|haven['’]t decided)\b|\bmay\b(?!\s+\d{1,2}\b))/i.test(content)?'uncertain':/\b\w+n['’]t\b|\b(no|not|never|without|cannot|declined|rejected|refuses?)\b/i.test(content)?'negated':/\b(suggest|suggested|recommend|recommended|should|consider)\b/i.test(content)?'suggestion':'statement';
   const commitment=meaning==='statement'&&/\b(I will|I['’]ll|we will|we['’]ll|promise|promised|agreed|will send|will call)\b/i.test(content);
   return {speaker,excerpt:excerpt.trim(),text:content,meaning,commitment};
  });
 });
}
export function extractNotes(text:string):NoteSummary {
 const transcript=transcriptSchema.parse(text);
 const rawLines=transcript.split(/\n+/).map(line=>line.trim()).filter(Boolean);
 const parties=[...new Set(rawLines.map(line=>line.match(/^([A-Z][A-Za-z .'-]{1,55}):\s/)?.[1]).filter((name):name is string=>!!name))];
 const interpreted=transcriptStatements(transcript),sentences=interpreted.map(item=>item.excerpt);
 const statements=sentences.filter(line=>!line.endsWith('?'));
 const criteria:Record<string,string>={},unresolvedCriteria=new Set<string>();
 const match=(key:string,pattern:RegExp)=>{const lines=statements.filter(line=>pattern.test(line));if(lines.length){criteria[key]=lines.slice(0,3).join(' ').slice(0,1000);if(!interpreted.some(item=>item.meaning==='statement'&&pattern.test(item.excerpt)))unresolvedCriteria.add(key);}};
 match('budget',/\$[\d,.]+|\b(budget|price range|spend up to)\b/i);
 match('locations',/\b(county|counties|Cobb|Cherokee|Fulton|DeKalb|Marietta|Woodstock|Atlanta)\b/i);
 match('strategy',/\b(flip|flipper|rental|rentals|buy.and.hold|hold|BRRRR)\b/i);
 match('financing',/\b(cash|financing|finance|loan|lender|funding)\b/i);
 match('rehab',/\b(rehab|renovation|repair|cosmetic|structural)\b/i);
 match('timeframe',/\b(timeframe|timeline|within|ready to buy|days|weeks|months)\b/i);
 const commitments=interpreted.filter(item=>item.commitment).slice(0,8).map(item=>(item.speaker&&!item.excerpt.startsWith(item.speaker+':')?`${item.speaker}: ${item.excerpt}`:item.excerpt).slice(0,800));
 const objections=statements.filter(line=>/\b(concern|concerns|concerned|worried|can't|cannot|too expensive|not comfortable|hesitant|not interested)\b/i.test(line)).slice(0,6).map(line=>line.slice(0,800));
 const questions=sentences.filter(line=>line.endsWith('?')).slice(0,8).map(line=>line.slice(0,800));
 const missingInformation=['budget','locations','strategy','financing','rehab','timeframe'].filter(key=>!criteria[key]||unresolvedCriteria.has(key)||/\b(not decided|undecided|unknown|unsure|don't know|not sure|tbd|haven't decided|cannot use cash)\b/i.test(criteria[key]));
 const facts=interpreted.filter(item=>item.meaning==='statement').slice(0,10).map(item=>item.excerpt.slice(0,1000));
 const usefulStatements=statements.filter(line=>/\b(budget|county|counties|cash|financing|flip|rental|rehab|within|will|concern|repair|buy)\b/i.test(line));
 const summary=(usefulStatements.length?usefulStatements:statements).slice(0,4).join(' ').slice(0,1600) || 'The provided transcript contains questions; no affirmative statements were extracted.';
 const suggestedTasks=commitments.map(line=>`Review and confirm commitment: ${line}`).slice(0,8);
 if(missingInformation.length)suggestedTasks.push(`Confirm missing qualification details: ${missingInformation.join(', ')}.`);
 const sourceExcerpts=sentences.slice(0,12).map(line=>line.slice(0,1500));
 return {methodVersion:noteExtractionVersion,statements:interpreted.slice(0,32).map(({speaker,excerpt,meaning,commitment})=>({speaker,excerpt:excerpt.slice(0,500),meaning,commitment})),ambiguities:interpreted.filter(item=>!['statement','question'].includes(item.meaning)).slice(0,12).map(item=>`${item.meaning}: ${item.excerpt}`.slice(0,600)),summary,parties,facts,criteria,commitments,questions,objections,missingInformation,suggestedTasks,
  proposedNote:`Employee-supplied transcript; unverified source statements. Excerpts only.\n\n${summary}\n\nQualification excerpts:\n${Object.entries(criteria).map(([key,value])=>`${key}: ${value}`).join('\n')||'No qualification details identified.'}\n\nCommitments to review:\n${commitments.join('\n')||'None explicitly identified.'}\n\nMissing information: ${missingInformation.join(', ')||'All standard demo fields mentioned; confirm accuracy.'}`.slice(0,15000),
  mode:'local_extraction',source:'employee_transcript',sourceExcerpts};
}
