import {useMemo} from 'react';
import {Platform,StyleSheet,Text,View} from 'react-native';
import {answerRuns,parseAgentAnswer} from './agent-answer-format';
import {colors,styles as s} from './styles';

function Inline({text}:{text:string}){
 return answerRuns(text).map((run,index)=><Text key={index} style={[run.strong&&a.strong,run.emphasis&&a.emphasis,run.code&&a.inlineCode]}>{run.text}</Text>);
}

/** Read-only answer display; all actionable source links remain in resource cards. */
export function AgentAnswer({text}:{text:string}){
 const blocks=useMemo(()=>parseAgentAnswer(text),[text]);
 return <View style={a.answer}>{blocks.map((block,index)=>{
  if(block.kind==='heading')return <Text key={index} selectable accessibilityRole="header" style={[s.messageText,a.heading,block.level<=2&&a.majorHeading]}><Inline text={block.text}/></Text>;
  if(block.kind==='code')return <View key={index} style={a.codeBlock}>{!!block.language&&<Text selectable style={s.help}>{block.language}</Text>}<Text selectable style={[s.messageText,a.code]}>{block.text}</Text></View>;
  if(block.kind==='list')return <View key={index} style={a.list}>{block.items.map((item,itemIndex)=><Text key={itemIndex} selectable style={[s.messageText,{paddingLeft:Math.min(item.depth,3)*10}]}>{item.marker} <Inline text={item.text}/></Text>)}</View>;
  if(block.kind==='table')return <View key={index} style={a.table}>{block.rows.map((row,rowIndex)=><View key={rowIndex} style={a.tableRow}>{row.map((cell,columnIndex)=><View key={columnIndex} style={a.tableField}><Text selectable style={[s.messageText,a.tableLabel]}><Inline text={block.headers[columnIndex]||`Column ${columnIndex+1}`}/></Text><Text selectable style={s.messageText}>{cell?<Inline text={cell}/>: '—'}</Text></View>)}</View>)}</View>;
  return <Text key={index} selectable style={s.messageText}><Inline text={block.text}/></Text>;
 })}</View>;
}

const a=StyleSheet.create({
 answer:{gap:12,minWidth:0,alignSelf:'stretch'},
 heading:{fontWeight:'600',color:colors.ink},majorHeading:{fontSize:17,lineHeight:25},
 strong:{fontWeight:'600'},emphasis:{fontStyle:'italic'},
 inlineCode:{fontFamily:Platform.OS==='ios'?'Menlo':'monospace',backgroundColor:colors.paper,fontSize:13},
 code:{fontFamily:Platform.OS==='ios'?'Menlo':'monospace',fontSize:13},
 codeBlock:{backgroundColor:colors.paper,borderRadius:10,padding:12,gap:6},
 list:{gap:7},table:{gap:10},
 tableRow:{backgroundColor:colors.paper,borderWidth:1,borderColor:colors.line,borderRadius:12,padding:12,gap:11},
 tableField:{gap:2,minWidth:0},tableLabel:{fontWeight:'600',fontSize:12,lineHeight:18,color:colors.muted},
});
