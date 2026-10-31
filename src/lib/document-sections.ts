/** Stable, lossless sections of the current working text; these are not inferred PDF pages. */
export function documentSections(content:string):{number:number;text:string}[]{
 const sections:{number:number;text:string}[]=[];let start=0;
 while(start<content.length){let end=Math.min(start+1200,content.length);
  if(end<content.length){const newline=content.lastIndexOf('\n',end-1);if(newline>=start+600)end=newline+1;const last=content.charCodeAt(end-1);if(last>=0xd800&&last<=0xdbff)end--;}
  sections.push({number:sections.length+1,text:content.slice(start,end)});start=end;
 }
 return sections;
}
