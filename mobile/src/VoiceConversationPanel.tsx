import {useEffect,useRef,useState} from 'react';
import {AppState,Modal,ScrollView,Text,TextInput,View} from 'react-native';
import type {Artifact,ToolResult} from '../../src/lib/contracts';
import {VoiceConversation,initialVoiceView} from '../../src/lib/voice-conversation';
import {nativeSpeech} from './native-speech';
import {Button} from './Button';
import {styles as s} from './styles';
interface Props {blocked:boolean;onRequest:(text:string)=>Promise<ToolResult>;onArtifact:(artifact:Artifact)=>void;onOpenChange:(open:boolean)=>void}
const labels={idle:'Let’s talk it through.',starting:'Opening your microphone…',listening:'I’m listening.',thinking:'Your Agent is working…',speaking:'Here’s what I found.',paused:'Voice is paused.',review:'Check your spoken decision.',error:'Let’s check the connection.'};
export function VoiceConversationPanel(props:Props){
 const [open,setOpen]=useState(false);const callbacks=useRef(props);useEffect(()=>{callbacks.current=props;},[props]);useEffect(()=>()=>callbacks.current.onOpenChange(false),[]);
 const close=()=>{setOpen(false);props.onOpenChange(false);};
 return <><Button secondary label="Talk to your Agent" disabled={props.blocked} onPress={()=>{setOpen(true);props.onOpenChange(true);}}/>{open&&<VoiceDialog {...props} onClose={close}/>}</>;
}
function VoiceDialog(props:Props&{onClose:()=>void}){
 const [view,setView]=useState(initialVoiceView),controller=useRef<VoiceConversation|null>(null),callbacks=useRef(props);
 useEffect(()=>{callbacks.current=props;},[props]);
 useEffect(()=>{const loop=new VoiceConversation({...nativeSpeech(),request:text=>callbacks.current.onRequest(text),changed:setView});controller.current=loop;const subscription=AppState.addEventListener('change',state=>{if(state!=='active')loop.pause('Voice paused when the app left the foreground. Tap Start when you return.');});return()=>{subscription.remove();loop.dispose();controller.current=null;};},[]);
 const close=()=>{controller.current?.dispose();props.onClose();};const active=['starting','listening','thinking','speaking'].includes(view.phase);
 return <Modal visible transparent animationType="fade" onRequestClose={close}><View style={s.modalShade}><View accessibilityViewIsModal style={s.modal}><ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
  <Text style={s.eyebrow}>YOUR AGENT · SPOKEN CONVERSATION</Text><Text accessibilityRole="header" accessibilityLiveRegion="polite" style={s.title}>{labels[view.phase]}</Text><Text style={s.copy}>Speak a request, hear the answer, then keep going. Your work stays in the same Agent conversation.</Text>
  <View style={s.demo}><Text style={s.demoText}>Starting voice sends completed spoken requests automatically. Uses on-device recognition and device spoken playback; no recording is saved. AI usage follows the same rules as typing.</Text></View>
  {!!view.notice&&<Text accessibilityRole={view.phase==='error'?'alert':undefined} accessibilityLiveRegion="polite" style={s.status}>{view.notice}</Text>}
  {!!view.heard&&<View style={s.card}><Text style={s.label}>YOU SAID</Text><Text selectable style={s.copy}>{view.heard}</Text></View>}
  {view.phase==='review'&&<View style={s.card}><Text style={s.label}>Review the exact words</Text><TextInput accessibilityLabel="Review spoken decision" multiline maxLength={12000} value={view.reviewText} onChangeText={text=>controller.current?.editReview(text)} style={s.input}/><Button label="Send reviewed words" disabled={props.blocked||!view.reviewText.trim()} onPress={()=>controller.current?.confirm(view.reviewText)}/><Button secondary label="Discard" onPress={()=>controller.current?.pause('Decision discarded. Nothing was sent.')}/></View>}
  {view.phase==='speaking'&&<Button label="Interrupt and speak" onPress={()=>controller.current?.interrupt()}/>}
  {active?<Button secondary label="Pause voice" onPress={()=>controller.current?.pause()}/>:view.phase!=='review'&&<Button label={view.pending?'Waiting for saved request…':'Start voice'} disabled={props.blocked||view.pending} onPress={()=>void controller.current?.start()}/>}
  {!!view.answer&&<View style={s.card}><Text style={s.cardTitle}>Saved answer</Text><Text selectable style={s.copy}>{view.answer}</Text>{view.artifacts.map((artifact,index)=><Button secondary key={`${artifact.type}:${artifact.id??index}`} label={`${artifact.title} →`} onPress={()=>{close();props.onArtifact(artifact);}}/>)}</View>}
  <Text style={s.help}>Keep this screen open. Listening pauses during replies; tap Interrupt to speak sooner. On iPhone, turn off silent mode to hear replies. Pausing voice stops audio; saved jobs keep their own controls.</Text><Button secondary label="Close and return to Agent" onPress={close}/>
 </ScrollView></View></View></Modal>;
}
