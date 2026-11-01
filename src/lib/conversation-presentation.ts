import type {Artifact} from './contracts';
import {isRolePreparationArtifact} from './role-preparation-contracts';

// Only known read/reference links can be tucked away. Work, drafts, decisions
// and unknown future types stay visible; this is presentation, not authority.
const referenceTypes=new Set<Artifact['type']>(['document','knowledge','analysis','investors','release','calling_queue','briefing','handoff','opportunity']);
export function partitionConversationArtifacts(artifacts:Artifact[]){
 const primary:Artifact[]=[],supporting:Artifact[]=[],seen=new Set<string>();
 for(const artifact of artifacts){
  if(artifact.type==='guidance')continue; // Metadata for source validity, not a destination.
  const identity=JSON.stringify(artifact);if(seen.has(identity))continue;seen.add(identity);
  (referenceTypes.has(artifact.type)&&!isRolePreparationArtifact(artifact)?supporting:primary).push(artifact);
 }
 // A single useful result should always remain one tap away.
 if(primary.length===0&&supporting.length===1)primary.push(supporting.pop()!);
 return {primary,supporting};
}
