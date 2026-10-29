import { z } from 'zod';
import type { NoteSummary } from '../lib/contracts';

export const transcriptSchema=z.string().trim().min(20,'Please enter at least 20 characters of authorized conversation notes.').max(50000,'Limit transcripts to 50,000 characters.');
export function extractNotes(text:string):NoteSummary {
 const transcript=transcriptSchema.parse(text);
 const rawLines=transcript.split(/\n+/).map(line=>line.trim()).filter(Boolean);
 const parties=[...new Set(rawLines.map(line=>line.match(/^([A-Z][A-Za-z .'-]{1,55}):\s/)?.[1]).filter((name):name is string=>!!name))];
 const sentences=rawLines.flatMap(line=>line.split(/(?<=[.!?])\s+(?=[A-Z])/)).map(line=>line.trim()).filter(Boolean);
 const statements=sentences.filter(line=>!line.endsWith('?'));
 const criteria:Record<string,string>={};
 const match=(key:string,pattern:RegExp)=>{const lines=statements.filter(line=>pattern.test(line));if(lines.length)criteria[key]=lines.slice(0,3).join(' ').slice(0,1000);};
 match('budget',/\$[\d,.]+|\b(budget|price range|spend up to)\b/i);
 match('locations',/\b(county|counties|Cobb|Cherokee|Fulton|DeKalb|Marietta|Woodstock|Atlanta)\b/i);
 match('strategy',/\b(flip|flipper|rental|rentals|buy.and.hold|hold|BRRRR)\b/i);
 match('financing',/\b(cash|financing|finance|loan|lender|funding)\b/i);
 match('rehab',/\b(rehab|renovation|repair|cosmetic|structural)\b/i);
 match('timeframe',/\b(timeframe|timeline|within|ready to buy|days|weeks|months)\b/i);
 const commitments=statements.filter(line=>/\b(I will|I'll|we will|we'll|promise|promised|agreed|send you|call you|follow.up|follow up|will send|will call)\b/i.test(line)).slice(0,8).map(line=>line.slice(0,800));
 const objections=statements.filter(line=>/\b(concern|concerns|concerned|worried|can't|cannot|too expensive|not comfortable|hesitant|not interested)\b/i.test(line)).slice(0,6).map(line=>line.slice(0,800));
 const questions=sentences.filter(line=>line.endsWith('?')).slice(0,8).map(line=>line.slice(0,800));
 const missingInformation=['budget','locations','strategy','financing','rehab','timeframe'].filter(key=>!criteria[key]||/\b(not decided|undecided|unknown|unsure|don't know|not sure|tbd|haven't decided|cannot use cash)\b/i.test(criteria[key]));
 const facts=statements.slice(0,10).map(line=>line.slice(0,1000));
 const usefulStatements=statements.filter(line=>/\b(budget|county|counties|cash|financing|flip|rental|rehab|within|will|concern|repair|buy)\b/i.test(line));
 const summary=(usefulStatements.length?usefulStatements:statements).slice(0,4).join(' ').slice(0,1600) || 'The provided transcript contains questions; no affirmative statements were extracted.';
 const suggestedTasks=commitments.map(line=>`Review and confirm commitment: ${line}`).slice(0,8);
 if(missingInformation.length)suggestedTasks.push(`Confirm missing qualification details: ${missingInformation.join(', ')}.`);
 const sourceExcerpts=sentences.slice(0,12).map(line=>line.slice(0,1500));
 return {summary,parties,facts,criteria,commitments,questions,objections,missingInformation,suggestedTasks,
  proposedNote:`Employee-supplied transcript; unverified source statements. Excerpts only.\n\n${summary}\n\nQualification excerpts:\n${Object.entries(criteria).map(([key,value])=>`${key}: ${value}`).join('\n')||'No qualification details identified.'}\n\nCommitments to review:\n${commitments.join('\n')||'None explicitly identified.'}\n\nMissing information: ${missingInformation.join(', ')||'All standard demo fields mentioned; confirm accuracy.'}`.slice(0,15000),
  mode:'local_extraction',source:'employee_transcript',sourceExcerpts};
}
