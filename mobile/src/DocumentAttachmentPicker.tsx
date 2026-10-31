import {Text,View} from 'react-native';
import type {CommunicationDocumentOption,CommunicationDocumentReference} from '../../src/lib/communications-contracts';
import {Button} from './Button';
import {styles as s} from './styles';

export function DocumentAttachmentPicker({options,value,disabled,onChange}:{options:CommunicationDocumentOption[];value:CommunicationDocumentReference[];disabled:boolean;onChange:(value:CommunicationDocumentReference[])=>void}){
 const select=(file:CommunicationDocumentOption)=>onChange([...value.filter(ref=>ref.documentId!==file.documentId),{documentId:file.documentId,revision:file.revision,reference:file.reference}]);
 const remove=(id:string)=>onChange(value.filter(ref=>ref.documentId!==id));
 return <View><Text style={s.label}>Saved text files · up to 3</Text><Text style={s.help}>Choose files from Work → Documents. Review their exact contents and every recipient before simulation.</Text>
  {!options.length&&<Text style={s.help}>No current text files available.</Text>}
  {options.map(file=>{const chosen=value.find(ref=>ref.documentId===file.documentId),stale=chosen&&chosen.reference!==file.reference;return <View key={file.documentId} style={s.result}><Text style={s.copy}>{file.name}</Text><Text style={s.help}>Revision {file.revision} · {Math.max(1,Math.round(file.sizeBytes/1024))} KB · {file.title}</Text><Button secondary label={chosen?'Remove file':'Attach file'} disabled={disabled||!chosen&&value.length>=3} onPress={()=>chosen?remove(file.documentId):select(file)}/>{stale&&<><Text style={s.errorText}>Your selection is an earlier revision.</Text><Button secondary label="Use current revision" disabled={disabled} onPress={()=>select(file)}/></>}</View>;})}
  {value.filter(ref=>!options.some(file=>file.documentId===ref.documentId)).map(ref=><View key={ref.documentId}><Text style={s.help}>Selected source is unavailable or withdrawn.</Text><Button secondary label="Remove unavailable file" disabled={disabled} onPress={()=>remove(ref.documentId)}/></View>)}
 </View>;
}
