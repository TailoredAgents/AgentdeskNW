import {Platform} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type {MobileConnection} from './client';
const key='agentdesk.mobile.connection.v1';
let previewConnection:MobileConnection|null=null;
export async function readConnection():Promise<MobileConnection|null>{
 if(Platform.OS==='web')return previewConnection;
 const raw=await SecureStore.getItemAsync(key);if(!raw)return null;
 try{const value=JSON.parse(raw) as MobileConnection;if(!value.token||!value.origin||!value.sessionId||!value.conversationId||!value.actor?.id||!Number.isFinite(Date.parse(value.expiresAt)))throw new Error();return value;}catch{await SecureStore.deleteItemAsync(key);return null;}
}
export async function saveConnection(value:MobileConnection){
 if(Platform.OS==='web'){previewConnection=value;return;}
 await SecureStore.setItemAsync(key,JSON.stringify(value),{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
}
export async function clearConnection(){previewConnection=null;if(Platform.OS!=='web')await SecureStore.deleteItemAsync(key);}
