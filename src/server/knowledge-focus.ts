import type {KnowledgeInput} from '../lib/knowledge-contracts';

export const knowledgeReviewMethod='guidance-focus-v1';
const stopWords=new Set('the and for with that this what does how can could should would please help tell about guide guidance procedure process need know me our your their from are was were have has which'.split(' '));
export const guidanceTerms=(value:string)=>[...new Set((value.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)??[]).filter(word=>!stopWords.has(word)).map(word=>word.length>4&&word.endsWith('s')?word.slice(0,-1):word))];
interface FocusLine {number:number;text:string;matchedTerms:string[]}
interface KnowledgeFocus {method:string;steps:FocusLine[];criteria:FocusLine[];hasMatches:boolean;notice:string}

/** Quoted source navigation, not semantic assessment or evidence of completed work. */
export function focusKnowledge(input:KnowledgeInput,question:string):KnowledgeFocus {
 const terms=guidanceTerms(question);
 const rank=(lines:string[])=>lines.map((text,index)=>{const words=new Set(guidanceTerms(text));return {number:index+1,text,matchedTerms:terms.filter(term=>words.has(term))};}).filter(line=>line.matchedTerms.length).sort((a,b)=>b.matchedTerms.length-a.matchedTerms.length||a.number-b.number).slice(0,3);
 const steps=rank(input.steps),criteria=rank(input.practiceCriteria);
 return {method:knowledgeReviewMethod,steps,criteria,hasMatches:steps.length+criteria.length>0,notice:'Highlighted by shared words, not a judgment of meaning or completion. The full guide remains available. Check current evidence before repeating or skipping work; no action is authorized.'};
}
export function formatKnowledgeFocus(focus:KnowledgeFocus):string {
 return [focus.hasMatches?'Source sections related to your question:':'No specific step or review criterion shares these terms. Read the full guide before applying it.',...focus.steps.map(line=>`Step ${line.number}: ${line.text}`),...focus.criteria.map(line=>`Review criterion ${line.number}: ${line.text}`),focus.notice].join('\n');
}
