import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {specialistQualityCases,qualityDimensions} from '../evaluations/specialists/cases';
import {summarizeQualityReview} from '../evaluations/specialists/review';
import {comparisonRecordingInstructions,prepareFirstPassQualityPackets} from '../evaluations/specialists/packets';
const [command,path,...extra]=process.argv.slice(2);
const sample=extra.length===0?1:extra.length===2&&extra[0]==='--sample'?Number(extra[1]):NaN;
if(extra.length&&(command!=='--prepare'||!Number.isSafeInteger(sample)||sample<1))throw new Error('Only --prepare accepts --sample <positive-integer>.');
if(command==='--export'&&path){writeFileSync(path,JSON.stringify({version:2,fictional:true,cases:specialistQualityCases,dimensions:qualityDimensions,rubric:'0 = absent/wrong, 1 = partial, 2 = supported and useful. Any critical error fails the sample. This file is the reviewer case pack, not a model payload.',comparisonRecordingInstructions,reviews:[]},null,2));console.log(`Exported ${specialistQualityCases.length} fictional evaluation cases. No models called or cases graded.`);}
else if(command==='--prepare'&&path){
 const packets=prepareFirstPassQualityPackets({sample});
 // A new directory prevents a second preparation from overwriting collected evidence.
 mkdirSync(path);
 for(const [name,value] of [['model-packets.json',packets.modelPackets],['blinded-review.json',packets.blindReview],['arm-key.json',packets.armKey]] as const)writeFileSync(join(path,name),JSON.stringify(value,null,2),{flag:'wx'});
 console.log(`Prepared six two-turn advisory model packets and separate blinded-review/arm-key files for three fictional role cases (sample ${sample}). No model calls, spending, outputs or grades; all ${specialistQualityCases.length} cases remain unrun.`);
}
else if(command==='--review'&&path)console.log(JSON.stringify(summarizeQualityReview(JSON.parse(readFileSync(path,'utf8'))),null,2));
else if(!command)console.log(JSON.stringify(summarizeQualityReview([]),null,2));
else throw new Error('Use no arguments for pending status, --export <file> for the reviewer case pack, --prepare <new-directory> [--sample <positive-integer>] for three-role advisory inputs, or --review <file> for supplied review records/pack. No provider calls are made.');
