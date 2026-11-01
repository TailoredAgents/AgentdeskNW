import type {ExpoConfig} from 'expo/config';
const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
const development = process.env.AGENTDESK_MOBILE_NATIVE_DEVELOPMENT === 'true';
const config:ExpoConfig = {
 name:'AgentDesk NW', slug:'agentdesk-nw', version:'0.1.0', scheme:'agentdesknw', orientation:'portrait',
 userInterfaceStyle:'light', icon:'./assets/icon.png',
 ios:{supportsTablet:true,bundleIdentifier:'com.tailoredagents.agentdesknw',infoPlist:{...(development?{NSAppTransportSecurity:{NSAllowsLocalNetworking:true}}:{})}},
 android:{package:'com.tailoredagents.agentdesknw',...(development?{usesCleartextTraffic:true}:{}),adaptiveIcon:{foregroundImage:'./assets/icon.png',backgroundColor:'#163c2e'}},
 web:{bundler:'metro',output:'single',favicon:'./assets/icon.png'},
 plugins:['expo-secure-store','expo-notifications','expo-system-ui',['expo-speech-recognition',{microphonePermission:'Allow AgentDesk NW to capture dictation and spoken requests when you start voice.',speechRecognitionPermission:'Allow AgentDesk NW to turn your speech into editable text.'}]],
 extra:{...(projectId?{eas:{projectId}}:{}),developmentOriginAllowed:development},
};
export default config;
