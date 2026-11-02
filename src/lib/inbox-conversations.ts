import type {InboxThread} from './communications-contracts';

/** A display grouping only. It never joins recipients, grants access or changes a thread. */
export function inboxConversationKey(thread:InboxThread):string {
 if(thread.association.status==='linked'&&thread.association.investor)return `investor:${thread.association.investor.id}`;
 // Unavailable and ambiguous identities stay separate. Unlinked senders can share
 // their exact channel address, but cannot join a linked CRM relationship.
 const address=thread.correspondent.address.trim().toLowerCase();
 if(thread.association.status==='unmatched'&&address)return `address:${thread.channel}:${address}`;
 return `thread:${thread.id}`;
}

export function groupInboxThreads(threads:InboxThread[]){
 const groups=new Map<string,{key:string;name:string;threads:InboxThread[]}>();
 for(const thread of threads){
  const key=inboxConversationKey(thread);
  const group=groups.get(key)??{key,name:thread.association.investor?.name??thread.correspondent.name,threads:[]};
  group.threads.push(thread);groups.set(key,group);
 }
 return [...groups.values()];
}
