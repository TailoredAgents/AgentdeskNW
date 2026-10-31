import type {Artifact} from './contracts';
export interface RolePreparation {
 id:string;kind:'opportunity'|'handoff';title:string;body:string;
 state:'pending'|'applied'|'dismissed';current:boolean;reference:string;
 createdAt:string;outcomeId:string|null;notice:string;
}

export function isRolePreparationArtifact(artifact:Artifact):boolean {return ['opportunity','handoff'].includes(artifact.type)&&!!artifact.data&&typeof artifact.data==='object'&&'preparationId' in artifact.data&&typeof artifact.data.preparationId==='string';}
