import {Platform} from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
if(Platform.OS!=='web')Notifications.setNotificationHandler({handleNotification:async()=>({shouldPlaySound:false,shouldSetBadge:false,shouldShowBanner:true,shouldShowList:true})});
export async function requestPushToken():Promise<{expoPushToken:string;platform:'ios'|'android'}>{
 if(Platform.OS!=='ios'&&Platform.OS!=='android')throw new Error('Notification delivery is available in the installed iPhone or Android app.');
 const projectId=Constants.expoConfig?.extra?.eas?.projectId as string|undefined;
 if(!projectId)throw new Error('This build does not yet have a push-notification project. Continue using saved work; notifications need a configured development or release build.');
 if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('work',{name:'Work updates',importance:Notifications.AndroidImportance.DEFAULT,lockscreenVisibility:Notifications.AndroidNotificationVisibility.PRIVATE});
 let permission=await Notifications.getPermissionsAsync();if(!permission.granted)permission=await Notifications.requestPermissionsAsync();
 if(!permission.granted)throw new Error('Notifications are not enabled. You can keep using the app and turn them on later in phone settings.');
 const token=await Notifications.getExpoPushTokenAsync({projectId});return {expoPushToken:token.data,platform:Platform.OS};
}
export {Notifications};
