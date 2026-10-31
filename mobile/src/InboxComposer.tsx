import {useEffect,useRef,useState} from 'react';
import {KeyboardAvoidingView,Modal,Platform,ScrollView,Text,TextInput,View} from 'react-native';
import * as Crypto from 'expo-crypto';
import type {CommunicationAccount,CommunicationDocumentOption,InboxThreadDetail} from '../../src/lib/communications-contracts';
import {CommunicationComposer,composingAccounts} from '../../src/lib/communication-composer';
import {createApi} from './client';
import {Button} from './Button';
import {styles as s} from './styles';

import {DocumentAttachmentPicker} from './DocumentAttachmentPicker';

export function InboxComposer({api,accounts,documentOptions=[],preferred,onClose,onSaved}:{api:ReturnType<typeof createApi>;accounts:CommunicationAccount[];documentOptions?:CommunicationDocumentOption[];preferred?:string;onClose:()=>void;onSaved:(detail:InboxThreadDetail)=>void}){
 const [availableFiles,setAvailableFiles]=useState(documentOptions),[filesLoading,setFilesLoading]=useState(false),[filesError,setFilesError]=useState(''),filesEpoch=useRef({value:0});
 const [,render]=useState(0),[controller]=useState(()=>new CommunicationComposer(accounts,preferred,payload=>api('/inbox/compose',payload),()=>Crypto.randomUUID(),()=>render(n=>n+1),onSaved));
 useEffect(()=>{const lifecycle=filesEpoch.current;controller.activate();return()=>{controller.deactivate();lifecycle.value++;};},[controller]);
 async function refreshFiles(){const epoch=++filesEpoch.current.value;setFilesError('');setFilesLoading(true);try{const files=await api<CommunicationDocumentOption[]>('/inbox/document-options');if(epoch===filesEpoch.current.value)setAvailableFiles(files);}catch(error){if(epoch===filesEpoch.current.value){setAvailableFiles([]);setFilesError(error instanceof Error?error.message:'Could not refresh source files.');}}finally{if(epoch===filesEpoch.current.value)setFilesLoading(false);}}
 const f=controller.fields,sms=controller.account?.channel==='sms',close=()=>{if(controller.close())onClose();};
 return <Modal visible transparent animationType="slide" onRequestClose={close}><KeyboardAvoidingView style={s.modalShade} behavior={Platform.OS==='ios'?'padding':undefined}><View style={s.modal}>
  <View style={s.modalHeader}><Text style={s.cardTitle}>New conversation</Text></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>
   <Text style={s.help}>Save an opening draft, then review the exact message and every recipient before a separate simulated send.</Text>
   {!!(controller.error||filesError)&&<Text accessibilityRole="alert" style={s.errorText}>{controller.error||filesError}</Text>}
   <Text style={s.label}>From</Text>{composingAccounts(accounts).map(a=><Button key={a.id} label={`${a.label} · ${a.address}${!a.capabilities.simulateSend?' · draft only':''}`} secondary={f.accountId!==a.id} disabled={controller.locked} onPress={()=>controller.change({accountId:a.id})}/>)}
   <Text style={s.help}>{controller.account?.capabilityNotice}</Text><Text style={s.label}>Recipient name · optional</Text><TextInput accessibilityLabel="New recipient name" style={s.input} value={f.name} maxLength={150} editable={!controller.locked} onChangeText={name=>controller.change({name})}/>
   <Text style={s.label}>{sms?'To · international phone number':'To · email address'}</Text><TextInput accessibilityLabel="New recipient address" style={s.input} value={f.address} autoCapitalize="none" keyboardType={sms?'phone-pad':'email-address'} maxLength={254} editable={!controller.locked} onChangeText={address=>controller.change({address})}/>
   {(!sms||!!f.cc||!!f.subject)&&<><Text style={s.label}>CC · optional</Text><TextInput accessibilityLabel="New message CC" style={s.input} value={f.cc} maxLength={2800} autoCapitalize="none" editable={!controller.locked} onChangeText={cc=>controller.change({cc})}/><Text style={s.label}>Subject</Text><TextInput accessibilityLabel="New message subject" style={s.input} value={f.subject} maxLength={240} editable={!controller.locked} onChangeText={subject=>controller.change({subject})}/>{sms&&<Text style={s.help}>Clear the email subject and CC to save a text.</Text>}</>}
   <Text style={s.label}>Message</Text><TextInput accessibilityLabel="New message body" style={[s.input,{minHeight:160}]} multiline textAlignVertical="top" value={f.body} maxLength={sms?1600:12000} editable={!controller.locked} onChangeText={body=>controller.change({body})}/>
   {(!sms||f.documents.length>0)&&<DocumentAttachmentPicker options={sms?[]:availableFiles} value={f.documents} disabled={controller.locked} onChange={documents=>controller.change({documents})}/>}
   {!sms&&<Button secondary label={filesLoading?'Refreshing files…':'Refresh saved files'} disabled={controller.locked||filesLoading} onPress={()=>void refreshFiles()}/>}
   <Text style={s.help}>Fictional accounts · no delivery or charge. Local files stay private in this simulation. Recipient identity is not independently verified.</Text>
  </ScrollView><View style={s.modalFooter}>{controller.discardReview?<><Text style={s.copy}>Discard this unsaved opening draft?</Text><Button label="Keep editing" onPress={()=>controller.stay()}/><Button label="Discard unsaved draft" secondary onPress={close}/></>:<><Button label={controller.busy?'Saving…':controller.pending?'Retry exact save':'Save opening draft'} disabled={controller.busy||!controller.account} onPress={()=>void controller.save()}/><Button label="Cancel" secondary disabled={controller.locked} onPress={close}/></>}</View>
 </View></KeyboardAvoidingView></Modal>;
}
