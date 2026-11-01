/**
 * A deliberately small, display-only Markdown subset for native Agent answers.
 * Supports paragraphs, ATX headings, flat/nested list lines, fenced code, pipe
 * tables and inline emphasis/code. Links, images, HTML and other syntax remain
 * literal text: parsing never creates navigation, media, or action authority.
 * Unsupported/malformed blocks retain their text. Large answers use plain text
 * rather than losing content or creating an unbounded number of native views.
 */
export type AnswerBlock =
 | {kind:'paragraph';text:string}
 | {kind:'heading';text:string;level:number}
 | {kind:'list';items:{marker:string;text:string;depth:number}[]}
 | {kind:'code';text:string;language:string}
 | {kind:'table';headers:string[];rows:string[][]};

export interface AnswerRun {text:string;strong?:boolean;emphasis?:boolean;code?:boolean}
const heading=/^ {0,3}(#{1,6})\s+(.+?)\s*$/;
const list=/^( {0,12})([-+*]|\d{1,9}[.)])\s+(.+)$/;
const fence=/^ {0,3}(`{3,}|~{3,})([^`~]*)$/;
const maxFormattedLength=60_000;

function tableCells(line:string):string[]|null {
 if(!line.includes('|'))return null;
 const cells:string[]=[];
 let cell='',codeMarker='';
 for(let index=0;index<line.length;index++){
  const char=line[index];
  if(char==='\\'&&index+1<line.length){cell+=char+line[++index];continue;}
  if(char==='`'){
   let marker='`';while(line[index+1]==='`'){marker+='`';index++;}
   if(!codeMarker)codeMarker=marker;else if(codeMarker===marker)codeMarker='';
   cell+=marker;continue;
  }
  if(char==='|'&&!codeMarker){cells.push(cell.trim());cell='';}else cell+=char;
 }
 cells.push(cell.trim());
 if(line.trimStart().startsWith('|'))cells.shift();
 if(line.trimEnd().endsWith('|')&&cells[cells.length-1]==='')cells.pop();
 return cells.length?cells:null;
}

function tableAt(lines:string[],index:number):Extract<AnswerBlock,{kind:'table'}>|null {
 const headers=tableCells(lines[index]??''),separator=tableCells(lines[index+1]??'');
 if(!headers||!separator||headers.length!==separator.length||!separator.every(cell=>/^:?-{3,}:?$/.test(cell)))return null;
 const rows:string[][]=[];
 for(let next=index+2;next<lines.length;next++){
  const row=tableCells(lines[next]);
  if(!row||row.length!==headers.length)break;
  rows.push(row);
 }
 return rows.length?{kind:'table',headers,rows}:null;
}

export function parseAgentAnswer(text:string):AnswerBlock[]{
 const lines=text.replace(/\r\n?/g,'\n').split('\n');
 if(text.length>maxFormattedLength||lines.length>1000)return[{kind:'paragraph',text}];
 const blocks:AnswerBlock[]=[];
 for(let index=0;index<lines.length;){
  const line=lines[index];
  if(!line.trim()){index++;continue;}
  const opening=fence.exec(line);
  if(opening){
   const marker=opening[1];
   const closing=new RegExp(`^ {0,3}${marker[0]}{${marker.length},}\\s*$`);
   let end=index+1;while(end<lines.length&&!closing.test(lines[end]))end++;
   // A partial streamed or malformed fence must not hide its remaining text.
   if(end===lines.length){blocks.push({kind:'paragraph',text:lines.slice(index).join('\n')});break;}
   blocks.push({kind:'code',text:lines.slice(index+1,end).join('\n'),language:opening[2].trim()});index=end+1;continue;
  }
  const title=heading.exec(line);
  if(title){blocks.push({kind:'heading',level:title[1].length,text:title[2].replace(/\s+#+\s*$/,'')});index++;continue;}
  const table=tableAt(lines,index);
  if(table){blocks.push(table);index+=table.rows.length+2;continue;}
  if(list.test(line)){
   const items:Extract<AnswerBlock,{kind:'list'}>['items']=[];
   while(index<lines.length){
    const item=list.exec(lines[index]);if(!item)break;
    items.push({marker:/\d/.test(item[2])?item[2]:'•',text:item[3],depth:Math.floor(item[1].length/2)});index++;
   }
   blocks.push({kind:'list',items});continue;
  }
  const paragraph=[line];index++;
  while(index<lines.length&&lines[index].trim()&&!heading.test(lines[index])&&!list.test(lines[index])&&!fence.test(lines[index])&&!tableAt(lines,index))paragraph.push(lines[index++]);
  blocks.push({kind:'paragraph',text:paragraph.join('\n')});
 }
 return blocks;
}

/** Inline formatting is bounded and never interprets destinations or raw HTML. */
export function answerRuns(text:string,depth=0):AnswerRun[]{
 if(depth>=4||text.length>maxFormattedLength)return[{text}];
 const runs:AnswerRun[]=[];
 let literal='';
 const flush=()=>{if(literal){runs.push({text:literal});literal='';}};
 for(let index=0;index<text.length;){
  const char=text[index];
  if(char==='\\'&&/[\\`*_{}\[\]()#+.!|>~-]/.test(text[index+1]??'')){literal+=text[index+1];index+=2;continue;}
  const marker=char==='`'?text.slice(index).match(/^`+/)![0]:text.startsWith('**',index)?'**':text.startsWith('__',index)?'__':char==='*'||char==='_'?char:null;
  if(marker&&(!marker.includes('_')||!/[\p{L}\p{N}]/u.test(text[index-1]??''))){
   const end=text.indexOf(marker,index+marker.length),value=end<0?'':text.slice(index+marker.length,end);
   const valid=value.length>0&&(char==='`'||(!/^\s|\s$/.test(value)&&(!marker.includes('_')||!/[\p{L}\p{N}]/u.test(text[end+marker.length]??''))));
   if(valid){
    flush();
    if(char==='`')runs.push({text:value,code:true});
    else for(const run of answerRuns(value,depth+1))runs.push({...run,...(marker.length===2?{strong:true}:{emphasis:true})});
    index=end+marker.length;continue;
   }
  }
  literal+=char;index++;
 }
 flush();return runs;
}
