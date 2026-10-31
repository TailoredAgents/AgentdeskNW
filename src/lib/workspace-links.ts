import type {Artifact} from './contracts';
import {isRolePreparationArtifact} from './role-preparation-contracts';
/** A navigation hint only. Every destination must load through its scoped service. */
export const destinationKinds=['work','updates','inbox','task','investor','property','document','transaction','transaction_team','analysis','opportunity','handoff','knowledge'] as const;
export type DestinationKind=typeof destinationKinds[number];
export interface WorkspaceDestination {kind:DestinationKind;id:string}
export type RecordTarget={kind:'investor'|'property';id:string};
const safeId=/^[a-zA-Z0-9_-]{1,150}$/;
function valid(kind:string,id:string):kind is DestinationKind {
 return (destinationKinds as readonly string[]).includes(kind)&&safeId.test(id)&&(kind!=='work'||/^work_[a-zA-Z0-9_-]+$/.test(id))&&(kind!=='updates'||/^update_[a-zA-Z0-9_-]+$/.test(id));
}
export function destinationFromArtifact(artifact:Artifact):WorkspaceDestination|null {
 if(isRolePreparationArtifact(artifact))return null; // Employee preparations belong to the decision board, not the underlying saved record.
 const kind=artifact.type==='work_run'?'work':artifact.type==='briefing'?'investor':artifact.type==='investors'?'investor':artifact.type;
 const data=artifact.data as {investorId?:unknown}|undefined;
 const id=artifact.id??(artifact.type==='investors'&&data&&typeof data.investorId==='string'?data.investorId:undefined);
 return id&&valid(kind,id)?{kind,id}:null;
}
export function workspacePath(target:WorkspaceDestination):string {
 if(!valid(target.kind,target.id))throw new Error('Unsupported workspace destination.');
 return target.kind==='work'?`/?work=${encodeURIComponent(target.id)}`:target.kind==='updates'?`/?updates=${encodeURIComponent(target.id)}`:`/?target=${target.kind}&id=${encodeURIComponent(target.id)}`;
}
export function nativeLink(target:WorkspaceDestination):string {
 if(!valid(target.kind,target.id))throw new Error('Unsupported workspace destination.');
 return `agentdesknw://${target.kind}/${encodeURIComponent(target.id)}`;
}
/** Only our app scheme or an exact same-workspace HTTPS link can select a screen. */
export function parseWorkspaceLink(raw:string,origin?:string):WorkspaceDestination|null {
 try{
  const url=new URL(raw);if(url.username||url.password||url.hash)return null;
  if(url.protocol==='agentdesknw:'){
   if(url.port||url.search)return null;const kind=url.hostname,id=decodeURIComponent(url.pathname.slice(1));return valid(kind,id)?{kind,id}:null;
  }
  if(!origin||url.origin!==new URL(origin).origin||url.protocol!=='https:'||url.pathname!=='/')return null;
  const keys=[...url.searchParams.keys()];
  if(new Set(keys).size!==keys.length)return null;
  const kind=keys.length===1&&keys[0]==='work'?'work':keys.length===1&&keys[0]==='updates'?'updates':keys.length===2&&keys.includes('target')&&keys.includes('id')?url.searchParams.get('target'):null;
  const id=kind==='work'&&keys.length===1?url.searchParams.get('work'):kind==='updates'&&keys.length===1?url.searchParams.get('updates'):url.searchParams.get('id');
  return kind&&id&&valid(kind,id)?{kind,id}:null;
 }catch{return null;}
}

/** Browser entry points parse only the current page's query, never an external origin. */
export function destinationFromSearch(search:string):WorkspaceDestination|null{return parseWorkspaceLink(`https://workspace.invalid/${search.startsWith('?')?search:''}`,'https://workspace.invalid');}
