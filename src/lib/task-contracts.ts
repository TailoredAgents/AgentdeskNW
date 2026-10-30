import type {Task} from './contracts';
export interface PersonalTaskDetail {
 task:Task;
 investor:{id:string;name:string}|null;
 source:{type:'inbox';threadId:string;title:string}|null;
 sourceNotice:string;
 canEdit:boolean;
}
