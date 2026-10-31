import {useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import type {AssignmentActivity as Activity} from '../../src/lib/assignment-review-contracts';
import {assignmentActivityLine,assignmentActivityNotice} from '../../src/lib/assignment-review-contracts';
import {styles as s} from './styles';
export function AssignmentActivity({activity}:{activity:Activity}){
 const [open,setOpen]=useState(false);
 return <View style={{gap:10}}><Pressable accessibilityRole="button" accessibilityState={{expanded:open}} style={[s.button,s.secondary]} onPress={()=>setOpen(value=>!value)}><Text style={s.secondaryText}>{open?'Hide':'Show'} usage and recovery details{activity.pending?` · ${activity.pending} awaiting confirmation`:''}</Text></Pressable>{open&&<><Text style={s.help}>{assignmentActivityNotice}</Text>{activity.parts.map(part=><View key={part.key}><Text style={s.copy}>{part.label}</Text><Text style={s.help}>{assignmentActivityLine(part)}</Text></View>)}{activity.pending>0&&<Text style={s.help}>Credit for uncertain or in-flight requests stays held. The original outcome must be reconciled before another attempt; refreshing this screen never repeats work.</Text>}{activity.overrun&&<Text style={s.help}>Reported usage exceeded an admitted limit. Further paid execution is stopped and the customer debit stays capped at the approved maximum.</Text>}</>}</View>;
}
