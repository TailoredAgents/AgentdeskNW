import type {Actor} from '../lib/contracts';
import type {WorkspaceReadiness} from '../lib/connection-contracts';
import {assertActor} from './db';
import {listConnectionPreparations} from './connection-preparation';
import {workerHealth} from './worker-health';
export function workspaceReadiness(actor:Actor):WorkspaceReadiness {
 assertActor(actor);return {mode:'fictional-demonstration',companyDataReady:false,connections:listConnectionPreparations(actor),workers:workerHealth(),gates:[
  {id:'capabilities',title:'Shared connection boundaries',status:'prepared',detail:'One employee-scoped source, with separate read, draft, write and delivery permissions. Live adapters remain unavailable.'},
  {id:'sync',title:'Synchronization staging',status:'prepared',detail:'Fictional batches have exact cursors, source revisions, duplicate checks and withdrawal. They do not overwrite reviewed CRM facts.'},
  {id:'identity',title:'Company sign-in',status:'prepared',detail:'Company account sign-in and revocable access are built. Approved provider setup and company sign-in testing are still required.'},
  {id:'salesforce',title:'Salesforce and company email',status:'required',detail:'Administrator-approved fields, sharing, mailbox coverage and delivery route. Reading activity does not authorize sending email.'},
  {id:'storage',title:'Company production storage',status:'required',detail:'This demonstration uses one SQLite host. PostgreSQL migration and multi-instance acceptance are required before company rollout.'},
  {id:'recovery',title:'Backup and restore',status:'prepared',detail:'Offline operator tools create and verify snapshots and restore to a new path. Hosted backup scheduling and recovery drills remain deployment acceptance.'},
 ]};
}
