'use client';
import type {CommunicationDocumentOption,CommunicationDocumentReference} from '@/lib/communications-contracts';

export function DocumentAttachmentPicker({options,value,disabled,onChange}:{options:CommunicationDocumentOption[];value:CommunicationDocumentReference[];disabled:boolean;onChange:(value:CommunicationDocumentReference[])=>void}){
 const select=(file:CommunicationDocumentOption)=>onChange([...value.filter(ref=>ref.documentId!==file.documentId),{documentId:file.documentId,revision:file.revision,reference:file.reference}]);
 const remove=(id:string)=>onChange(value.filter(ref=>ref.documentId!==id));
 return <fieldset className="document-attachment-picker" disabled={disabled}><legend>Saved text files · up to 3</legend><p>Choose files from Documents. Review their exact contents and every recipient before simulation.</p>
  {!options.length&&<p className="muted">No current text files available. Save a source in Documents first.</p>}
  <div className="document-attachment-options">{options.map(file=>{const chosen=value.find(ref=>ref.documentId===file.documentId),stale=chosen&&chosen.reference!==file.reference;return <div key={file.documentId}><label><input type="checkbox" checked={!!chosen} disabled={disabled||!chosen&&value.length>=3} onChange={()=>chosen?remove(file.documentId):select(file)}/><span><strong>{file.name}</strong><small>Revision {file.revision} · {Math.max(1,Math.round(file.sizeBytes/1024))} KB · {file.title}</small></span></label>{stale&&<p role="status">Your selection is an earlier revision. <button type="button" className="text-link" disabled={disabled} onClick={()=>select(file)}>Use current revision</button></p>}</div>;})}</div>
  {value.filter(ref=>!options.some(file=>file.documentId===ref.documentId)).map(ref=><p key={ref.documentId}>Selected source is unavailable or withdrawn. <button type="button" className="text-link" disabled={disabled} onClick={()=>remove(ref.documentId)}>Remove unavailable file</button></p>)}
 </fieldset>;
}
