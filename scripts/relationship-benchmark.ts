import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {relationshipCases} from '../evaluations/relationship/cases';
import type {RelationshipReportInput,RelationshipRecord} from '../src/lib/relationship-record-contracts';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {getInvestorJourney,recordJourneyObservation,recommendInvestorNextStep} from '../src/server/journey';
import {getRelationshipRecord,recordRelationshipReport} from '../src/server/relationship-record';
import {getInvestorIntelligence,recordCallOutcome} from '../src/server/intelligence';
import {completeTask,createTask} from '../src/server/services';

const baseline=process.argv.includes('--baseline');
const split=process.argv.includes('--reserved')?'reserved':process.argv.includes('--all')?'all':'development';
const outputArg=process.argv.find(arg=>arg.startsWith('--output='));
const output=outputArg?.slice('--output='.length)??'artifacts/relationship/benchmark-'+split+'.json';
const originalDb=process.env.AGENTDESK_DB_PATH;
process.env.AGENTDESK_DB_PATH=':memory:';
process.env.OPENAI_API_KEY='';
process.env.AGENTDESK_DEMO='true';
process.env.AGENTDESK_ALLOW_PRODUCTION_DEMO='true';
globalThis.fetch=async()=>{throw new Error('Network use is forbidden in the relationship benchmark.');};
const results=[];
for(const item of relationshipCases.filter(item=>split==='all'||item.split===split)){
 closeDb();
 const actor=demoActor(),investorId=item.investorId;
 const intelligence=getInvestorIntelligence(actor,investorId),box=intelligence.buyBoxes.find(box=>box.active)!;
 let sequence=0;
 const checks:Array<{criterion:string;passed:boolean}>=[];
 const check=(criterion:string,value:unknown)=>checks.push({criterion,passed:!!value});
 const date=(days:number)=>new Date(Date.now()-days*86400000).toISOString();
 const reports:Array<Partial<RelationshipReportInput>>=[];
 const add=(changes:Partial<RelationshipReportInput>)=>{
  const input:RelationshipReportInput={investorId,buyBoxId:box.id,topic:'budget',value:{min:100000,max:210000+item.variant*10000},statement:'Fictional employee report: investor now wants a lower purchase budget.',statedAt:date(1),supersedesId:null,expectedVersion:0,expectedContext:'0'.repeat(64),eventKey:'benchmark-'+(++sequence),...changes};
  reports.push(input);
  if(baseline){recordJourneyObservation(actor,{investorId,kind:'preference',text:input.statement+' Reported value: '+JSON.stringify(input.value)+'. Statement date: '+(input.statedAt??'unknown'),eventKey:input.eventKey});return null;}
  const current=getRelationshipRecord(actor,investorId);input.expectedVersion=current.version;input.expectedContext=current.contextVersion;
  return recordRelationshipReport(actor,input);
 };
 let record:RelationshipRecord|null=null;
 let outcome:unknown;
 try{
  if(item.family==='budget_difference'){
   record=add({});check('Different budget is explicitly marked for clarification',record?.conflicts.some(f=>f.topic==='budget'));
   check('Canonical budget is preserved',getInvestorIntelligence(actor,investorId).buyBoxes[0].priceMax===box.priceMax);
  }else if(item.family==='timing_difference'){
   add({buyBoxId:null,topic:'timing',value:['Next month'],statement:'Investor reported a next-month purchase window.'});
   record=add({buyBoxId:null,topic:'timing',value:['Next year'],statement:'Investor also reported a next-year window; clarify the discrepancy.'});
   check('Conflicting reports remain together',record?.conflicts.find(f=>f.topic==='timing')?.reports.length===2);
  }else if(item.family==='separate_buy_boxes'){
   const second={...box,id:'benchmark-second-box',label:'Separate long-term strategy',priceMin:450000,priceMax:600000};
   getDb().prepare('INSERT INTO buy_boxes VALUES(?,?,?,?,?)').run(second.id,actor.organizationId,actor.officeId,investorId,JSON.stringify(second));
   record=add({});
   check('Only the reported buy box needs clarification',record?.conflicts.filter(f=>f.topic==='budget').length===1&&record.conflicts[0].buyBoxId===box.id);
   check('Second strategy retains its own budget',getInvestorIntelligence(actor,investorId).buyBoxes.find(b=>b.id===second.id)?.priceMax===600000);
  }else if(item.family==='explicit_correction'){
   const first=add({buyBoxId:null,topic:'contact',value:['Morning calls'],statement:'Employee initially reports a preference for morning calls.'});
   record=add({buyBoxId:null,topic:'contact',value:['Email only'],statement:'Correction: the employee confirms the earlier morning-call report was mistaken.',supersedesId:first?.reports[0].id??null});
   check('Original report retained as superseded',record?.reports[0].status==='superseded'&&record.reports[0].statement.includes('morning'));
   check('Only replacement is active',record?.reports.filter(r=>r.status==='active').length===1);
  }else if(item.family==='older_statement'){
   add({buyBoxId:null,topic:'timing',value:['This quarter'],statement:'Investor reported this-quarter timing yesterday.',statedAt:date(1)});
   record=add({buyBoxId:null,topic:'timing',value:['Next year'],statement:'Historical recap from last year reported next-year timing.',statedAt:date(365)});
   check('Earlier statement remains distinguishable despite later entry',record?.conflicts.find(f=>f.topic==='timing')?.reports.some(s=>s.freshness==='review_due'));
   check('Neither report silently supersedes the other',record?.reports.every(r=>r.status==='active'));
  }else if(item.family==='unknown_statement_date'){
   record=add({buyBoxId:null,topic:'contact',value:['Email'],statement:'Employee remembers an email preference but not when it was stated.',statedAt:null});
   check('Unknown statement time stays unknown',record?.facts.find(f=>f.topic==='contact')?.reports[0].statedAt===null);
   check('Capture time does not establish freshness',record?.facts.find(f=>f.topic==='contact')?.reports[0].freshness==='undated');
  }else if(item.family==='reconfirmation'){
   record=add({topic:'financing',value:['Cash'],statement:'Old employee report of cash funding; reconfirm current arrangements.',statedAt:date(120)});
   check('Old financing report remains visible and due for review',record?.reviewDue.some(f=>f.topic==='financing'&&f.reports.some(s=>s.freshness==='review_due')));
  }else if(item.family==='source_trace'){
   const statement='Fictional source statement '+item.id+': investor prefers email before scheduling a call.';
   record=add({buyBoxId:null,topic:'contact',value:['Email before a call'],statement});
   check('Exact source and report status survive',record?.reports.some(r=>r.statement===statement&&r.verification==='employee_reported'));
  }else if(item.family==='pause'){
   recordCallOutcome(actor,investorId,{outcome:'paused',notes:'Employee reports a requested pause.'});
   outcome=recommendInvestorNextStep(actor,investorId);
   check('Recorded pause is respected',(outcome as {action:{kind:string}}).action.kind==='confirm_timing');
  }else if(item.family==='objection'){
   recordJourneyObservation(actor,{investorId,kind:'objection',text:'Repair scope needs clarification before another opportunity.',eventKey:'concern'});
   const recommendation=recommendInvestorNextStep(actor,investorId);outcome=recommendation;
   check('Repair concern drives the next step',recommendation.action.kind==='resolve_objection');
   check('No repair number or available contractor is invented',recommendation.unknowns.some(u=>u.includes('does not establish'))&&!/\$\d/.test(recommendation.draft??''));
  }else if(item.family==='commitment'){
   recordJourneyObservation(actor,{investorId,kind:'objection',text:'Funding arrangements remain unclear.',eventKey:'concern'});
   const task=createTask(actor,{investorId,title:'Check the reported funding question'});completeTask(actor,task.id);
   const journey=getInvestorJourney(actor,investorId);outcome=journey.summary;
   check('Task completion preserves unresolved concern',journey.openIssues.length===1&&journey.completedTasks.some(t=>t.id===task.id));
  }else{
   try{getInvestorJourney(demoActor('acquisitions'),investorId);check('Unauthorized investor read blocked',false);}
   catch(error){check('Unauthorized investor read blocked',error instanceof Error&&/not found/.test(error.message));}
  }
  outcome??=record??getInvestorJourney(actor,investorId);
 }catch(error){checks.push({criterion:error instanceof Error?error.message:'Unexpected evaluation failure',passed:false});}
 results.push({...item,reports,checks,passed:checks.every(check=>check.passed),output:outcome});
}
closeDb();
if(originalDb===undefined)delete process.env.AGENTDESK_DB_PATH;else process.env.AGENTDESK_DB_PATH=originalDb;
mkdirSync(output.slice(0,output.lastIndexOf('/'))||'.',{recursive:true});
const passed=results.filter(r=>r.passed).length;
const implementationFingerprint=createHash('sha256').update(['scripts/relationship-benchmark.ts','evaluations/relationship/cases.ts','src/server/relationship-record.ts','src/server/journey.ts'].map(path=>path+'\n'+readFileSync(path,'utf8')).join('\n')).digest('hex');
const report={implementationFingerprint,uncommittedImplementation:!process.env.RELATIONSHIP_BASELINE_REVISION&&!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),version:'relationship-benchmark-v1',sourceRevision:process.env.RELATIONSHIP_BASELINE_REVISION??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),mode:baseline?'pre-upgrade observation interface':'structured relationship record',split,generatedAt:new Date().toISOString(),cases:results.length,passed,failed:results.length-passed,checksPassed:results.flatMap(r=>r.checks).filter(c=>c.passed).length,checks:results.flatMap(r=>r.checks).length,limits:'Authored application scenarios. Not an independent blinded trial, generic-AI comparison or sales-effectiveness measurement.',results};
writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.info(JSON.stringify({mode:report.mode,split,cases:results.length,passed,failed:report.failed,checksPassed:report.checksPassed,checks:report.checks,report:output}));
if(!baseline&&passed!==results.length)process.exitCode=1;
