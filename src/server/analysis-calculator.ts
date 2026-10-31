import {analysisGroups,visibleAnalysisFields,type AnalysisInput,type AnalysisSubject,type AnalysisResult,type AnalysisMetric,type AnalysisCase} from '../lib/analysis-contracts';

export const analysisMethod='AgentDesk scenario mathematics and provisional diligence · v2 · 2026-10-31.2';
const money=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
const metric=(label:string,value:number|null,unit:AnalysisMetric['unit'],formula:string):AnalysisMetric=>({label,value:value===null?null:money(value),unit,formula});
const ratio=(numerator:number,denominator:number)=>denominator>0?numerator/denominator:null;
/** Fixed monthly accrual, cent-rounded payments, no escrow or mortgage insurance. */
export function loanSchedule(principal:number,annualPercent:number,kind:AnalysisInput['financing'],years:number|null,months:number){
 if(kind==='cash')return {monthlyPayment:0,totalPayments:0,interestPaid:0,principalPaid:0,balance:0};
 const rate=annualPercent/1200,term=(years??1)*12,principalCents=Math.round(principal*100);
 const rawPayment=kind==='interest_only'?principal*rate:rate===0?principal/term:principal*rate/(-Math.expm1(-term*Math.log1p(rate)));
 const payment=Math.round(rawPayment*100);let balance=principalCents,interestPaid=0,totalPayments=0;
 for(let month=1;month<=months;month++){
  const interest=Math.round(balance*rate);let paid=kind==='interest_only'?interest:Math.min(payment,balance+interest);
  if(kind==='amortizing'&&month>=term)paid=balance+interest;
  balance-=paid-interest;interestPaid+=interest;totalPayments+=paid;
 }
 return {monthlyPayment:payment/100,totalPayments:totalPayments/100,interestPaid:interestPaid/100,principalPaid:(principalCents-balance)/100,balance:balance/100};
}
type Values=Record<keyof AnalysisInput['values'],number>;
function financing(input:AnalysisInput,v:Values,months:number){const cash=input.financing==='cash';return {...loanSchedule(cash?0:v.loanAmount,cash?0:v.annualInterestPercent,input.financing,cash?null:v.amortizationYears,months),principal:cash?0:v.loanAmount,points:cash?0:money(v.loanAmount*v.loanPointsPercent/100)};}
function flipCase(input:AnalysisInput,v:Values,sale:number,repairs:number,months:number,label:string):AnalysisCase {
 const loan=financing(input,v,months),rehab=money(repairs*(1+v.contingencyPercent/100)),selling=money(sale*v.sellingCostPercent/100),holding=money(months*v.monthlyHoldingCosts);
 const acquisition=money(v.purchasePrice+v.purchaseCosts+rehab+loan.points),initial=money(acquisition-loan.principal),cashOutlay=money(initial+holding+loan.totalPayments),saleCash=money(sale-selling-loan.balance),profit=money(saleCash-cashOutlay),beforeSaleCosts=money(acquisition+holding+loan.interestPaid);
 return {label,assumptions:`Resale $${sale.toLocaleString('en-US')}; base repairs $${repairs.toLocaleString('en-US')}; ${months} months. Repair contingency ${v.contingencyPercent}%.`,metrics:[
  metric('Pre-tax project profit',profit,'USD','Net sale proceeds after loan payoff − modeled cash contributed, including debt payments'),
  metric('Profit / resale price',ratio(profit,sale)===null?null:profit/sale*100,'%','Pre-tax project profit / assumed resale price'),
  metric('Initial cash requirement',initial,'USD','Purchase + purchase costs + repairs with contingency + points − initial loan proceeds'),
  metric('Total modeled cash contributed',cashOutlay,'USD','Initial cash requirement + non-debt holding costs + principal/interest payments'),
  metric('Net cash at sale',saleCash,'USD','Resale − selling costs − remaining principal payoff'),
  metric('Interest over holding period',loan.interestPaid,'USD','Sum of monthly interest; principal repayment is not an expense'),
  metric('Break-even resale price',v.sellingCostPercent<100?beforeSaleCosts/(1-v.sellingCostPercent/100):null,'USD','(Purchase + purchase costs + repairs + points + holding + interest) / (1 − selling-cost rate)'),
 ]};
}
function rentalCase(input:AnalysisInput,v:Values,repairs:number,label:string):AnalysisCase {
 const loan=financing(input,v,12),gross=money(v.monthlyRent*12),effective=money(gross*(1-v.vacancyPercent/100)),operations=money(v.monthlyOperatingCosts*12),noi=money(effective-operations),reserve=money(v.monthlyCapitalReserve*12),cashFlow=money(noi-loan.totalPayments-reserve),basis=money(v.purchasePrice+v.purchaseCosts+repairs*(1+v.contingencyPercent/100)),equity=money(basis+loan.points-loan.principal);
 return {label,assumptions:`Scheduled rent $${v.monthlyRent.toLocaleString('en-US')}/month; vacancy/loss ${v.vacancyPercent}%; operations $${v.monthlyOperatingCosts.toLocaleString('en-US')}/month; base repairs $${repairs.toLocaleString('en-US')}.`,metrics:[
  metric('Annual scheduled rent',gross,'USD','Monthly scheduled rent × 12'),
  metric('Annual effective rent',effective,'USD','Scheduled rent × (1 − vacancy/credit loss)'),
  metric('Annual net operating income',noi,'USD','Effective rent − operating expenses; excludes debt, capital reserves, depreciation and income tax'),
  metric('Annual debt payments',loan.totalPayments,'USD','First 12 principal/interest payments under the stated fixed loan'),
  metric('Annual pre-tax cash flow',cashFlow,'USD','NOI − debt payments − capital reserves'),
  metric('Monthly pre-tax cash flow',cashFlow/12,'USD','Annual pre-tax cash flow / 12'),
  metric('NOI / debt service',ratio(noi,loan.totalPayments),'ratio','Illustrative NOI / first-year principal and interest; not a lender qualification result'),
  metric('NOI / purchase price',ratio(noi,v.purchasePrice)===null?null:noi/v.purchasePrice*100,'%','Annual NOI / assumed purchase price; not a market valuation'),
  metric('NOI / acquisition and repair cost',ratio(noi,basis)===null?null:noi/basis*100,'%','Annual NOI / purchase, acquisition costs and repairs with contingency'),
  metric('Initial cash requirement',equity,'USD','Purchase + acquisition costs + repairs/contingency + points − initial principal'),
  metric('Annual cash-on-cash',ratio(cashFlow,equity)===null?null:cashFlow/equity*100,'%','Annual pre-tax cash flow / positive initial cash requirement'),
 ]};
}
export function calculateAnalysis(input:AnalysisInput,subject:AnalysisSubject,asOf:string):AnalysisResult {
 const missing:string[]=[],warnings:string[]=[],questions:string[]=[],metrics:AnalysisMetric[]=[],cases:AnalysisCase[]=[];
 const fields=visibleAnalysisFields(input),absent=fields.filter(field=>input.values[field.key]===null);
 for(const field of absent)missing.push(`${field.label} is unknown.`);
 if(input.financing==='unspecified')missing.push('Financing method is unknown.');
 const groups=analysisGroups(input);
 for(const group of groups){const source=input.sources[group];if(!source.reference||!source.asOf){missing.push(`${group} assumptions need a source reference and date.`);questions.push(`What supports the ${group} assumptions, and when were they supplied?`);}else if(source.asOf<new Date(Date.parse(asOf)-90*86400000).toISOString().slice(0,10))warnings.push(`${group} assumptions are over 90 days old; confirm current terms. This is a provisional review window.`);}
 if(subject.askingPrice!==null&&input.values.purchasePrice!==null&&subject.askingPrice!==input.values.purchasePrice)warnings.push(`Scenario purchase price differs from the current supplied asking price ($${subject.askingPrice.toLocaleString('en-US')}). No negotiated price is inferred.`);
 if(subject.status==='withdrawn'||subject.status==='not_pursuing')warnings.push('The linked source is withdrawn or not being pursued. Calculations do not reactivate it.');
 const seenSales=new Set<string>();
 const normalize=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]/g,'');
 const comparables=input.comparables.map(comp=>{
  const reasons:string[]=[];let included=comp.include;
  const exclude=(reason:string)=>{included=false;reasons.push(reason);};
  if(!comp.include)reasons.push(`Excluded by employee: ${comp.exclusionReason||'reason not supplied'}`);
  const saleKey=normalize(comp.address);
  if(comp.include&&seenSales.has(saleKey))exclude('Repeated comparable address; count the underlying sale only once.');
  if(normalize(subject.address)===saleKey)exclude('The subject itself is not an independent comparable sale.');
  if(comp.status!=='sold')exclude('An asking or pending price is not a completed sale.');
  if(!comp.sourceReference||!comp.soldOn||!comp.price||!comp.sqft)exclude('Missing source, sale date, positive sold price or area.');
  if(comp.soldOn&&(!Number.isFinite(Date.parse(comp.soldOn))||comp.soldOn>asOf))exclude('Sale date is invalid or later than this analysis date; no completed sale is established.');
  if(comp.soldOn&&comp.soldOn<new Date(Date.parse(asOf)-180*86400000).toISOString().slice(0,10))exclude('Sale is over 180 days old under this provisional comparable screen. Retained for context.');
  if(!comp.propertyType||!subject.propertyType)exclude('Subject or comparable property type is unknown.');
  else if(comp.propertyType.trim().toLowerCase()!==subject.propertyType.trim().toLowerCase())exclude('Property types differ; equivalent use has not been established.');
  if(comp.distanceMiles===null)exclude('Distance from the subject is unknown.');
  else if(comp.distanceMiles>5)reasons.push('More than five supplied miles away; confirm the same competitive market.');
  if(comp.adjustment!==0&&!comp.adjustmentReason)exclude('A price adjustment needs an explicit rationale.');
  const adjustedPrice=comp.price===null?null:money(comp.price+comp.adjustment);
  if(adjustedPrice!==null&&adjustedPrice<=0)exclude('The adjusted price is not positive.');
  if(comp.price&&Math.abs(comp.adjustment)/comp.price>.2)reasons.push('Adjustment exceeds 20% of the supplied price; supporting evidence needs review.');
  if(included)seenSales.add(saleKey);
  if(subject.sqft&&comp.sqft&&(comp.sqft/subject.sqft<.75||comp.sqft/subject.sqft>1.25))reasons.push('Supplied area differs from the subject by over 25%; confirm relevance and any supported adjustments.');
  return {input:comp,included,reasons,adjustedPrice,pricePerSqft:comp.price&&comp.sqft?money(comp.price/comp.sqft):null};
 });
 const included=comparables.filter(comp=>comp.included),prices=included.map(comp=>comp.adjustedPrice!);
 const comparableRange=prices.length?{low:Math.min(...prices),high:Math.max(...prices),count:prices.length}:null;
 if(included.length<3){warnings.push('Fewer than three candidate sales pass the provisional data screen. No supported value range is established.');questions.push('Which recent, relevant completed sales and original records support the resale or rent expectations?');}
 if(comparableRange&&input.strategy==='flip'&&(input.values.salePriceLow!==null&&input.values.salePriceLow<comparableRange.low||input.values.salePriceHigh!==null&&input.values.salePriceHigh>comparableRange.high))warnings.push('The employee resale range extends outside the candidate adjusted sale prices. Explain the subject differences; do not treat those prices as a valuation.');
 for(const comp of comparables)if(comp.reasons.length)warnings.push(`${comp.input.address}: ${comp.reasons.join(' ')}`);
 if(!absent.length&&input.financing!=='unspecified'){
  const v=input.values as Values;
  if(input.strategy==='flip'){
   const low=flipCase(input,v,v.salePriceLow,v.repairHigh,v.holdingMonths,'Lower resale / higher repairs'),high=flipCase(input,v,v.salePriceHigh,v.repairLow,v.holdingMonths,'Higher resale / lower repairs');
   cases.push(low,flipCase(input,v,v.salePriceLow,v.repairLow,v.holdingMonths,'Lower resale / lower repairs'),flipCase(input,v,v.salePriceHigh,v.repairHigh,v.holdingMonths,'Higher resale / higher repairs'),high,flipCase(input,v,v.salePriceLow,v.repairHigh,v.holdingMonths+3,'Illustrative delay: three extra months'));
   metrics.push(metric('Lower-end modeled profit',low.metrics[0].value,'USD',low.metrics[0].formula),metric('Higher-end modeled profit',high.metrics[0].value,'USD',high.metrics[0].formula),metric('Monthly loan payment',financing(input,v,v.holdingMonths).monthlyPayment,'USD','Fixed monthly principal/interest, or interest only; excludes escrow/insurance'));
   if((low.metrics[0].value??0)<0)warnings.push('The lower resale / higher repair scenario produces a modeled loss.');
   if(v.sellingCostPercent===100)warnings.push('Selling costs consume all resale proceeds; a finite break-even price is unavailable.');
  }else{
   const low=rentalCase(input,v,v.repairLow,'Lower repairs'),high=rentalCase(input,v,v.repairHigh,'Higher repairs');
   cases.push(low,high,rentalCase(input,{...v,monthlyRent:money(v.monthlyRent*.9)},v.repairHigh,'Illustrative stress: rent 10% lower'),rentalCase(input,{...v,vacancyPercent:Math.min(100,v.vacancyPercent+5)},v.repairHigh,'Illustrative stress: vacancy five points higher'),rentalCase(input,{...v,monthlyOperatingCosts:money(v.monthlyOperatingCosts*1.1)},v.repairHigh,'Illustrative stress: operations 10% higher'));
   metrics.push(...high.metrics.filter(item=>['Annual net operating income','Monthly pre-tax cash flow','NOI / debt service','Annual cash-on-cash'].includes(item.label)));
   if((high.metrics.find(item=>item.label==='Annual pre-tax cash flow')?.value??0)<0)warnings.push('The stated stabilized rental assumptions produce negative modeled cash flow.');
   warnings.push('Rental figures model a stabilized first operating year. Renovation vacancy, initial carrying costs, rent growth, refinance and sale are not included.');
  }
  if(cases.some(item=>item.metrics.some(m=>m.label==='Initial cash requirement'&&(m.value??1)<=0)))warnings.push('Initial loan proceeds cover or exceed the modeled initial costs. Verify the financing structure; cash-on-cash is unavailable when initial cash is not positive.');
 }else questions.push('Supply the missing numeric inputs and choose financing to calculate complete scenarios. Known inputs remain saved.');
 warnings.push('All values, comparable references and adjustments are supplied assumptions, not independently verified facts.');
 if(input.financing!=='cash')warnings.push('Loan model assumes full principal advanced at purchase, a fixed rate and no draw schedule, extension, prepayment charge, mortgage insurance or additional financing fee beyond entered points. Include other acquisition fees explicitly.');
 const numerical=metrics.length>0;
 const summary=input.lens==='diligence'?`${included.length} candidate sales pass the provisional data screen; ${missing.length} missing inputs or source details. ${numerical?'Scenario math is available; verify source relevance and assumptions before handoff.':'Complete the assumptions before interpreting economics.'}`:numerical?`Calculated ${cases.length} explicit scenarios from supplied assumptions. ${missing.length?'Some source details remain missing.':'Source references are recorded but unverified.'} Compare the cases before preparing the next question.`:`The investment scenario is incomplete: ${absent.length} numeric inputs${input.financing==='unspecified'?' and financing':''} remain unknown.`;
 return {method:analysisMethod,asOf,summary,missing,warnings:[...new Set(warnings)],questions:[...new Set(questions)],metrics,cases,comparables,comparableRange,notice:'Fictional decision preparation, not an appraisal, lender approval, investment recommendation or offer. Candidate sale prices are not a subject valuation. Figures exclude income taxes, depreciation and unentered costs. Stress cases are illustrative changes, not forecasts or confidence intervals. Nothing is published, sent or charged.'};
}
