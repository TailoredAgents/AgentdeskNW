import {useEffect,useRef,useState} from 'react';
import {Text,View} from 'react-native';
import type {SalesforceSourceView} from '../../src/lib/salesforce-source-contracts';
import type {createApi} from './client';
import {Button} from './Button';
import {styles as s} from './styles';
export function SalesforceSourcePanel({api,onAuthError}:{api:ReturnType<typeof createApi>;onAuthError:(error:unknown)=>void}){
 const [state,setState]=useState<SalesforceSourceView|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);const alive=useRef(true),lock=useRef(false);
 useEffect(()=>{alive.current=true;void api<SalesforceSourceView>('/salesforce-source').then(value=>{if(alive.current)setState(value);}).catch(e=>{if(alive.current){setError('Source preview unavailable.');onAuthError(e);}});return()=>{alive.current=false;};},[api]);
 async function act(action:'prepare'|'refresh'|'disconnect'|'reload'){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{const value=await api<SalesforceSourceView>(action==='reload'?'/salesforce-source':`/salesforce-source/${action}`,action==='reload'?undefined:action==='prepare'?{}:action==='disconnect'?{snapshot:state?.snapshot}:{snapshot:state?.snapshot,step:state?.stage==='empty'?'initial':'changes'});if(alive.current)setState(value);}
  catch(e){if(alive.current){setState(null);setError(`${e instanceof Error?e.message:'Refresh could not be confirmed.'} Reload to inspect saved state.`);onAuthError(e);}}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <View style={s.card}><Text style={s.cardTitle}>Salesforce source preview</Text><Text style={s.help}>Fictional contacts only. Company data and delivery are not connected.</Text>{!!error&&<Text accessibilityRole="alert" style={s.status}>{error}</Text>}{!state&&<Button secondary label="Reload source" disabled={busy} onPress={()=>void act('reload')}/>} {!!state&&<><Text style={s.copy}>{state.notice}</Text>{state.state==='not_prepared'&&<Button label="Prepare sample source" disabled={busy} onPress={()=>void act('prepare')}/>} {state.state==='ready'&&<>{state.stage!=='changes'&&<Button label={state.stage==='empty'?'Load sample contacts':'Simulate source changes'} disabled={busy} onPress={()=>void act('refresh')}/>}<Button secondary label="Reload source" disabled={busy} onPress={()=>void act('reload')}/><Text style={s.help}>{state.records.length} current contacts · {state.withdrawn} withdrawn</Text>{state.records.map(record=><View key={record.externalId} style={s.card}><Text style={s.cardTitle}>{record.name}</Text><Text style={s.copy}>{record.company??'Company not supplied'}</Text><Text style={s.copy}>{record.email??'Email not supplied'}</Text><Text style={s.help}>Revision {record.revision} · {record.match==='unmatched'?'No match among your permitted CRM records':'Possible CRM match; review required'}</Text></View>)}<Button secondary label="Disconnect sample source" disabled={busy} onPress={()=>void act('disconnect')}/></>}</>}</View>;
}
