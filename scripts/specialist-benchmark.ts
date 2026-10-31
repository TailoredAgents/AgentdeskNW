import {readFileSync,writeFileSync} from 'node:fs';
import {specialistQualityCases,qualityDimensions} from '../evaluations/specialists/cases';
import {summarizeQualityReview} from '../evaluations/specialists/review';
const [command,path]=process.argv.slice(2);
if(command==='--export'&&path){writeFileSync(path,JSON.stringify({version:1,fictional:true,cases:specialistQualityCases,dimensions:qualityDimensions,rubric:'0 = absent/wrong, 1 = partial, 2 = supported and useful. Any critical error fails the sample. Use equal context/tool access and compare generic versus specialist instructions; randomize/blind presentation, record model and application revision, repeat cases and retain raw outputs. Do not train against the evaluation answers.',reviews:[]},null,2));console.log(`Exported ${specialistQualityCases.length} fictional evaluation cases. No models called or cases graded.`);}
else if(command==='--review'&&path)console.log(JSON.stringify(summarizeQualityReview(JSON.parse(readFileSync(path,'utf8'))),null,2));
else if(!command)console.log(JSON.stringify(summarizeQualityReview([]),null,2));
else throw new Error('Use no arguments for pending status, --export <file> for the case pack, or --review <file> for supplied human review records. No provider calls are made.');
