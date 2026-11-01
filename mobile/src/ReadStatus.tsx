import {ActivityIndicator,Text,View} from 'react-native';
import {Button} from './Button';
import {colors,styles as s} from './styles';

/** Read retries never repeat a save or another outstanding action. */
export function ReadStatus({loading,error,subject,hasContent,onRetry,disabled=false}:{loading:boolean;error:string;subject:string;hasContent:boolean;onRetry:()=>void;disabled?:boolean}){
 if(error)return <View style={s.card}>
  <Text accessibilityRole="alert" style={s.cardTitle}>Couldn’t {hasContent?'refresh':'load'} {subject}</Text>
  <Text style={s.errorText}>{error}</Text>
  {hasContent&&<Text style={s.help}>Showing the last information received. Refresh to check for changes.</Text>}
  <Button secondary label={loading?'Checking…':'Try loading again'} disabled={disabled||loading} onPress={onRetry}/>
  <Text style={s.help}>This only checks saved information. It does not repeat an action.</Text>
 </View>;
 if(loading)return <View style={s.row}><ActivityIndicator color={colors.green}/><Text accessibilityLiveRegion="polite" style={s.help}>{hasContent?'Refreshing':'Loading'} {subject}…</Text></View>;
 return null;
}
