import {Platform} from 'react-native';
import {ExpoSpeechRecognitionModule as recognition} from 'expo-speech-recognition';
import * as Speech from 'expo-speech';
import type {VoicePorts} from '../../src/lib/voice-conversation';

/** Recognition callbacks belong to one listen cycle, including late permission results. */
export function nativeSpeech():Pick<VoicePorts,'listen'|'speak'>{
 let owner=0;
 return {
  async listen(events,signal){
   const cycle=++owner;
   if(Platform.OS==='web'||!recognition.isRecognitionAvailable()||!recognition.supportsOnDeviceRecognition())throw new Error('On-device speech is unavailable. Use typing or keyboard dictation; a development build and installed speech language are required.');
   const permissions=await recognition.requestPermissionsAsync();
   if(signal.aborted||cycle!==owner)return ()=>{};
   if(!permissions.granted)throw new Error('Microphone and speech permission are needed. You can continue by typing.');
   let closed=false;const subscriptions:{remove:()=>void}[]=[];
   const stop=()=>{if(closed)return;closed=true;signal.removeEventListener('abort',stop);subscriptions.forEach(s=>s.remove());if(owner===cycle){owner++;recognition.abort();}};
   subscriptions.push(recognition.addListener('start',()=>{if(!closed)events.started();}),recognition.addListener('end',()=>{if(!closed)events.ended();}),recognition.addListener('result',event=>{if(!closed&&event.results[0]?.transcript)events.text(event.results[0].transcript,event.isFinal);}),recognition.addListener('error',()=>{if(!closed)events.error('Speech input stopped. Check microphone access and the installed speech language, or continue by typing.');}));
   signal.addEventListener('abort',stop,{once:true});
   try{recognition.start({lang:'en-US',continuous:false,interimResults:true,requiresOnDeviceRecognition:true,recordingOptions:{persist:false}});}catch(error){stop();throw error;}return stop;
  },
  speak(text,done,error){
   let closed=false;Speech.speak(text,{language:'en-US',rate:1,onDone:()=>{if(!closed)done();},onError:()=>{if(!closed)error('Spoken playback could not finish. Read the saved answer; check volume and silent mode.');}});
   return ()=>{if(closed)return;closed=true;void Speech.stop().catch(()=>{});};
  },
 };
}
