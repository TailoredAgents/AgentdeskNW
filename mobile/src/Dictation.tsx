import {useEffect,useRef,useState} from 'react';
import {AppState,Platform,Pressable,Text,View} from 'react-native';
import {ExpoSpeechRecognitionModule,useSpeechRecognitionEvent} from 'expo-speech-recognition';
import {styles as s} from './styles';
export function Dictation({disabled,onTranscript}:{disabled:boolean;onTranscript:(text:string)=>void}){
 const [listening,setListening]=useState(false),[notice,setNotice]=useState('');const timer=useRef<ReturnType<typeof setTimeout>|null>(null),alive=useRef(true);
 const stop=()=>{ExpoSpeechRecognitionModule.abort();if(timer.current)clearTimeout(timer.current);timer.current=null;setListening(false);};
 useSpeechRecognitionEvent('start',()=>setListening(true));
 useSpeechRecognitionEvent('end',()=>{setListening(false);if(timer.current)clearTimeout(timer.current);});
 useSpeechRecognitionEvent('result',event=>{if(event.isFinal&&event.results[0]?.transcript){onTranscript(event.results[0].transcript);setNotice('Review the words below, then tap Send.');}});
 useSpeechRecognitionEvent('error',()=>{setListening(false);setNotice('Dictation could not finish. Try again, type, or use your keyboard microphone.');});
 useEffect(()=>{const subscription=AppState.addEventListener('change',state=>{if(state!=='active')stop();});return()=>{alive.current=false;subscription.remove();stop();};},[]);
 const start=async()=>{
  if(listening){ExpoSpeechRecognitionModule.stop();return;}
  try{
   if(Platform.OS==='web'||!ExpoSpeechRecognitionModule.isRecognitionAvailable()||!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()){setNotice('On-device dictation is not available here. You can type or use your keyboard’s microphone.');return;}
   const permission=await ExpoSpeechRecognitionModule.requestPermissionsAsync();if(!alive.current)return;if(!permission.granted){setNotice('Microphone and speech permission are needed for dictation. Typing remains available.');return;}
   setNotice('Listening. Your words will appear for review; nothing is sent automatically.');
   ExpoSpeechRecognitionModule.start({lang:'en-US',interimResults:false,continuous:false,requiresOnDeviceRecognition:true});timer.current=setTimeout(stop,60_000);
  }catch{setNotice('Use a development build with speech input enabled, or use your keyboard’s microphone.');}
 };
 return <View><Pressable accessibilityRole="button" accessibilityLabel={listening?'Finish dictation':'Dictate a request'} disabled={disabled} onPress={()=>void start()} style={[s.voiceButton,disabled&&s.disabled]}><Text style={s.voiceLabel}>{listening?'■ Finish dictation':'◉ Dictate a request'}</Text></Pressable>{notice?<Text accessibilityLiveRegion="polite" style={s.help}>{notice}</Text>:<Text style={s.help}>Speak or type. Dictated words stay editable until you send.</Text>}</View>;
}
