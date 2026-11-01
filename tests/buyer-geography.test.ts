import {describe,expect,it} from 'vitest';
import type {Property} from '../src/lib/contracts';
import type {BuyBox} from '../src/lib/intelligence-contracts';
import {reviewBuyerGeography} from '../src/server/buyer-geography';

const property:Property={id:'fixture',address:'123 Cobb Street',city:'Marietta',county:'Cobb',price:235000,beds:3,baths:2,sqft:1500,strategy:'Fix & flip',rehab:'Medium',status:'Available',synthetic:true};
const base:Pick<BuyBox,'states'|'counties'|'cities'|'zipCodes'|'excludedAreas'|'geographicFlexibility'>={states:[],counties:['Cobb'],cities:[],zipCodes:[],excludedAreas:[],geographicFlexibility:false};
// Only location criteria are read by this pure review; other buy-box criteria are independent.
const review=(changes:Partial<typeof base>={},location:Partial<Property>={})=>reviewBuyerGeography({...base,...changes} as BuyBox,{...property,...location});

describe('recorded buyer geography without invented boundaries',()=>{
 it('recognizes an exact county with ordinary case, spacing and County suffix',()=>{
  expect(review({counties:['  COBB   County  ']})).toMatchObject({points:20,conflicts:[],missing:[],question:null});
 });
 it('does not confuse a city with a target county of the same name',()=>{
  const result=review({counties:['Marietta']});
  expect(result.points).toBe(0);expect(result.conflicts).toContain('Outside the recorded target counties and cities.');
 });
 it('asks which property qualifies when flexibility is the only geographic link',()=>{
  const result=review({counties:['Fulton'],geographicFlexibility:true});
  expect(result.points).toBe(0);expect(result.conflicts).toEqual([]);expect(result.question).toContain('flexibility include Marietta');
  expect(result.reasons.join(' ')).not.toContain('matches');
 });
 it('honors a known exclusion even when the target and flexibility match',()=>{
  const result=review({excludedAreas:['County: Cobb'],geographicFlexibility:true});
  expect(result.points).toBe(0);expect(result.conflicts.join(' ')).toContain('excluded area');
 });
 it('does not classify a street-name fragment as an excluded county',()=>{
  const result=review({counties:['Fulton'],excludedAreas:['Cobb County']},{county:'Fulton',city:'Atlanta'});
  expect(result).toMatchObject({points:20,conflicts:[],missing:[]});
 });
 it('keeps a neighborhood or untyped area unresolved instead of declaring it included or excluded',()=>{
  const result=review({excludedAreas:['South Cobb']});
  expect(result.points).toBe(0);expect(result.conflicts).toEqual([]);
  expect(result.missing.join(' ')).toContain('South Cobb');expect(result.question).toContain('Confirm the relevant boundary');
 });
 it('keeps typed city and county exclusions separate',()=>{
  expect(review({excludedAreas:['City: Cobb']}).conflicts).toEqual([]);
  expect(review({excludedAreas:['City: Marietta']}).conflicts.join(' ')).toContain('excluded area');
 });
 it('does not infer a state or ZIP from the street address even if it contains those strings',()=>{
  const result=review({states:['GA'],zipCodes:['30060']},{address:'123 Demo Street, GA 30060'});
  expect(result.points).toBe(0);expect(result.missing.join(' ')).toContain('state / ZIP evidence');
  expect(result.question).toContain('states: GA; ZIPs: 30060');
 });
 it.each(['ZIP: 30060','State: GA','County:','City:'])('does not silently clear an unsupported or incomplete exclusion: %s',area=>{
  const result=review({excludedAreas:[area]});expect(result.points).toBe(0);expect(result.question).toContain(area);
 });
 it('retains unknown county as a question rather than inventing an out-of-market conflict',()=>{
  const result=review({}, {county:''});expect(result.points).toBe(0);expect(result.conflicts).toEqual([]);expect(result.question).toContain('sourced county and city');
 });
 it('does not require county evidence for an exact independently recorded city target',()=>{
  expect(review({counties:[],cities:['City of Marietta']},{county:''})).toMatchObject({points:20,conflicts:[],missing:[]});
 });
 it('does not ask about an unknown alternative county when an independent city target already fits',()=>{
  expect(review({counties:['Cobb'],cities:['Marietta']},{county:''})).toMatchObject({points:20,conflicts:[],missing:[],question:null});
 });
 it.each(['Unknown','TBD','N/A','County:'])('retains unavailable county evidence as a question: %s',county=>{
  const result=review({}, {county});expect(result.points).toBe(0);expect(result.conflicts).toEqual([]);expect(result.question).toContain('sourced county and city');
 });
 it.each(['Unknown','TBD','County:'])('cannot earn a match from the same unavailable target and property value: %s',county=>{
  const result=review({counties:[county]}, {county});expect(result.points).toBe(0);expect(result.conflicts).toEqual([]);expect(result.missing).toContain('Target geography');
 });
 it('does not clear a typed exclusion against placeholder location evidence',()=>{
  const result=review({excludedAreas:['County: Cobb']},{county:'Unknown'});expect(result.points).toBe(0);expect(result.conflicts).toEqual([]);expect(result.question).toContain('County: Cobb');
 });
 it('uses an explicit area type before a County suffix',()=>{
  const unsupported=review({excludedAreas:['State: Cobb County']});expect(unsupported.points).toBe(0);expect(unsupported.question).toContain('State: Cobb County');
  const city=review({excludedAreas:['City: Cobb County']},{city:'Cobb County'});expect(city.conflicts.join(' ')).toContain('excluded area');
 });
});
