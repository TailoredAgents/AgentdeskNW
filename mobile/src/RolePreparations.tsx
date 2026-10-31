import {useEffect,useRef,useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import * as Crypto from 'expo-crypto';
import type {RolePreparation} from '../../src/lib/role-preparation-contracts';
import {ApiError} from './client';
import {styles as s} from './styles';
type Api=<T>(path:string,body?:unknown)=>Promise<T>;
export function RolePreparations({api,onAuthError}:{api:Api;onAuthError?:(error:unknown)=>void}){
 const [items,setItems]=useState<RolePreparation[]>([]),[selected,setSelected]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [pending,setPending]=useState<{id:string;reference:string;decision:'apply'|'dismiss';eventKey:string}|null>(null);
 const alive=useRef(true),reading=useRef(0),mutating=useRef(false);
 async function load(){if(mutating.current)return;const epoch=++reading.current;try{const next=await api<RolePreparation[]>('/role-preparations');if(alive.current&&epoch===reading.current)setItems(next);}catch(error){if(alive.current&&epoch===reading.current){setItems([]);setError(error instanceof Error?error.message:'Prepared work is unavailable.');onAuthError?.(error);}}}
 useEffect(()=>{alive.current=true;void load();const timer=setInterval(()=>void load(),8000);return()=>{alive.current=false;reading.current++;clearInterval(timer);};},[api]);
 async function decide(item:Pick<RolePreparation,'id'|'reference'>,decision:'apply'|'dismiss'){
  if(mutating.current)return;mutating.current=true;reading.current++;setBusy(true);setError('');
  const request=pending??{id:item.id,reference:item.reference,decision,eventKey:Crypto.randomUUID()};setPending(request);
  try{await api(`/role-preparations/${encodeURIComponent(request.id)}/decision`,{reference:request.reference,decision:request.decision,eventKey:request.eventKey});setPending(null);}
  catch(error){if(error instanceof ApiError&&[400,401,402,403,404,409,422].includes(error.status))setPending(null);if(alive.current){setError(error instanceof Error?error.message:'The result is uncertain. Retry the same decision.');onAuthError?.(error);}}
  finally{mutating.current=false;if(alive.current){setBusy(false);void load();}}
 }
 const locked=busy||!!pending;
 const button=(label:string,disabled:boolean,onPress:()=>void)=><Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} style={[s.button,s.secondary,disabled&&s.disabled]} onPress={onPress}><Text style={[s.buttonText,s.secondaryText]}>{label}</Text></Pressable>;
 if(!items.length&&!error)return null;
 return <View style={s.card}><Text style={s.cardTitle}>Prepared for your review</Text><Text style={s.help}>Review the exact details before changing fictional business records.</Text>{!!error&&<Text accessibilityRole="alert" style={s.errorText}>{error}</Text>}{items.map(item=><View key={item.id} style={s.result}>{button(`${item.title} · ${item.state==='pending'?(item.current?'Needs review':'Needs fresh information'):item.state}`,locked,()=>setSelected(selected===item.id?'':item.id))}{selected===item.id&&<><Text style={s.copy}>{item.body}</Text><Text style={s.help}>{item.notice}</Text>{item.state==='pending'&&<>{button('Apply reviewed action',locked||!item.current,()=>void decide(item,'apply'))}{button('Dismiss',locked,()=>void decide(item,'dismiss'))}</>}</>}</View>)}{pending&&!busy&&button('Retry same decision',false,()=>{if(pending)void decide(pending,pending.decision);})}</View>;
}
