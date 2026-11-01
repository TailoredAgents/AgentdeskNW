import {useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import type {Artifact} from '../../src/lib/contracts';
import {partitionConversationArtifacts} from '../../src/lib/conversation-presentation';
import {styles as s} from './styles';

export function ConversationResources({artifacts,onOpen}:{artifacts:Artifact[];onOpen:(artifact:Artifact)=>void}){
 const [expanded,setExpanded]=useState(false),{primary,supporting}=partitionConversationArtifacts(artifacts);
 const link=(artifact:Artifact,index:number)=><Pressable accessibilityRole="button" key={`${artifact.type}:${artifact.id??'list'}:${index}`} onPress={()=>onOpen(artifact)} style={s.artifact}><Text style={s.artifactText}>{artifact.title} →</Text></Pressable>;
 return <>
  {primary.map(link)}
  {supporting.length>0&&<View>
   <Pressable accessibilityRole="button" accessibilityState={{expanded}} accessibilityLabel={`Supporting details, ${supporting.length} ${supporting.length===1?'link':'links'}`} onPress={()=>setExpanded(value=>!value)} style={s.artifact}><Text style={s.artifactText}>{expanded?'Hide':'Show'} supporting details · {supporting.length} {supporting.length===1?'link':'links'} {expanded?'−':'+'}</Text></Pressable>
   {expanded&&supporting.map((artifact,index)=>link(artifact,primary.length+index))}
  </View>}
 </>;
}
