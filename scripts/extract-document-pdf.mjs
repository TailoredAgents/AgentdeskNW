// Runs in a bounded child process with no inherited application credentials.
import {getDocumentProxy} from 'unpdf';
const chunks=[];let bytes=0;
for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>2_000_000)process.exit(2);chunks.push(chunk);}
let pdf;
try{
 pdf=await getDocumentProxy(new Uint8Array(Buffer.concat(chunks)),{verbosity:0,isEvalSupported:false,useSystemFonts:false,disableFontFace:true,useWorkerFetch:false,isOffscreenCanvasSupported:false,maxImageSize:0,stopAtErrors:true});
 if(pdf.numPages>40)throw new Error('page_limit');
 const pages=[];let length=0;
 for(let number=1;number<=pdf.numPages;number++){
  const page=await pdf.getPage(number),items=await page.getTextContent({disableNormalization:true});
  const text=items.items.map(item=>'str'in item?item.str+(item.hasEOL?'\n':' '):'').join('').trim();
  length+=text.length;if(length>30000||Buffer.byteLength(text)>64000)throw new Error('text_limit');
  pages.push({number,text});page.cleanup();
 }
 process.stdout.write(JSON.stringify({pages}));
}catch(error){process.stdout.write(JSON.stringify({error:error?.name==='PasswordException'?'password':error?.message==='page_limit'?'page_limit':error?.message==='text_limit'?'text_limit':'unreadable'}));process.exitCode=1;}
finally{await pdf?.destroy();}
