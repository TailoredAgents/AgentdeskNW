import type {ReactNode} from 'react';
import type {Artifact} from '../lib/contracts';
import {partitionConversationArtifacts} from '../lib/conversation-presentation';

export function ConversationResources({artifacts,specialists,renderArtifact}:{artifacts:Artifact[];specialists:string[];renderArtifact:(artifact:Artifact,index:number)=>ReactNode}){
 const {primary,supporting}=partitionConversationArtifacts(artifacts);
 return <>
  {primary.map(renderArtifact)}
  {(supporting.length>0||specialists.length>0)&&<details className="conversation-resources">
   <summary>Supporting details{supporting.length>0&&<span>{supporting.length} {supporting.length===1?'link':'links'}</span>}</summary>
   {supporting.map((artifact,index)=>renderArtifact(artifact,primary.length+index))}
   {specialists.length>0&&<p className="conversation-specialists">With help from {specialists.join(', ')}.</p>}
  </details>}
 </>;
}
