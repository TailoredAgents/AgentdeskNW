import type {Property} from '../lib/contracts';
import type {BuyBox} from '../lib/intelligence-contracts';

export const buyerGeographyMethod='buyer-geography-v1';
const known=(value:string)=>/^(unknown|unspecified|not supplied|not confirmed|tbd|n\/?a|\?)$/.test(value)?'':value;
const normalize=(value:string)=>known(value.trim().replace(/\s+/g,' ').toLowerCase());
const countyName=(value:string)=>known(normalize(value).replace(/^county\s*:\s*/,'').replace(/\s+county$/,''));
const cityName=(value:string)=>known(normalize(value).replace(/^(city\s*:\s*|city of\s+)/,''));

/** Compare only recorded location fields. An address substring is not a boundary or geocode. */
export function reviewBuyerGeography(box:BuyBox,property:Property){
 const reasons:string[]=[],conflicts:string[]=[],missing:string[]=[];
 const county=countyName(property.county),city=cityName(property.city);
 const targetCounties=box.counties.map(countyName).filter(Boolean),targetCities=box.cities.map(cityName).filter(Boolean);
 const countyMatch=!!county&&targetCounties.includes(county);
 const cityMatch=!!city&&targetCities.includes(city);
 const unknownTargets=!countyMatch&&!cityMatch&&((targetCounties.length>0&&!county)||(targetCities.length>0&&!city));
 const unresolvedExclusions:string[]=[];
 for(const area of box.excludedAreas){
  const unsupported=/^(state|zip(?:\s*code)?)\s*:/i.test(area);
  const typedCity=!unsupported&&/^(city\s*:|city of\s+)/i.test(area);
  const typedCounty=!unsupported&&!typedCity&&(/^county\s*:/i.test(area)||/\s+county$/i.test(area));
  const match=typedCounty?!!county&&countyName(area)===county:typedCity?!!city&&cityName(area)===city:!unsupported&&!!normalize(area)&&[county,city].includes(normalize(area));
  if(match)conflicts.push(`Property is in an explicitly excluded area: “${area}”.`);
  else if(typedCounty? !county||!countyName(area):typedCity? !city||!cityName(area):true)unresolvedExclusions.push(area);
 }
 if(box.states.length||box.zipCodes.length)missing.push('Property state / ZIP evidence for precise geography review');
 if(unresolvedExclusions.length)missing.push(`Location evidence to check excluded areas: ${unresolvedExclusions.join('; ')}`);
 if(countyMatch||cityMatch){
  reasons.push(`Recorded ${countyMatch&&cityMatch?'county and city':countyMatch?'county':'city'} matches the buy box.`);
 }else if(unknownTargets){
  missing.push('Recorded property county / city needed to compare target geography');
 }else if(box.geographicFlexibility){
  missing.push('Investor confirmation that geographic flexibility includes this property');
 }else if(targetCounties.length||targetCities.length){
  conflicts.push('Outside the recorded target counties and cities.');
 }else if(!box.states.length&&!box.zipCodes.length){
  missing.push('Target geography');
 }
 // Flexibility, unknown precise constraints and unresolved exclusions earn no geographic points.
 const points=(countyMatch||cityMatch)&&!conflicts.length&&!missing.length?20:0;
 const question=unresolvedExclusions.length
  ?`Does this property's recorded location (${property.city||'city unknown'}, ${property.county||'county unknown'}) fall within the excluded area${unresolvedExclusions.length===1?'':'s'} “${unresolvedExclusions.join('; ')}”? Confirm the relevant boundary; an address fragment does not establish it.`
  :box.states.length||box.zipCodes.length
   ?`What are this property's sourced state and ZIP, and do they satisfy ${[box.states.length?'states: '+box.states.join(', '):'',box.zipCodes.length?'ZIPs: '+box.zipCodes.join(', '):''].filter(Boolean).join('; ')}? County or city fit does not settle those restrictions.`
   :unknownTargets?'What are the sourced county and city for this property? Compare them with the recorded targets before describing a geographic match.'
   :box.geographicFlexibility&&!countyMatch&&!cityMatch?`Does the investor's geographic flexibility include ${property.city||'this city'}, ${property.county||'county unknown'} for this strategy? Flexibility is not a confirmed match.`
   :missing.length?'Which counties or cities should apply to this buying strategy?':null;
 return {points,reasons,conflicts,missing,question};
}
