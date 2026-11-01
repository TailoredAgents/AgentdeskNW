import {test} from 'node:test';
import assert from 'node:assert/strict';
import {answerRuns,parseAgentAnswer} from '../src/agent-answer-format';

test('a normal Agent answer separates prose, headings and next steps without dropping facts',()=>{
 const blocks=parseAgentAnswer('Mike is a potential fit, **pending repair detail**.\n\n## Next step\n1. Confirm the repair estimate.\n2. Ask whether he wants a walkthrough.\n\nThe draft is saved and **unsent**.');
 assert.deepEqual(blocks,[
  {kind:'paragraph',text:'Mike is a potential fit, **pending repair detail**.'},
  {kind:'heading',level:2,text:'Next step'},
  {kind:'list',items:[{marker:'1.',text:'Confirm the repair estimate.',depth:0},{marker:'2.',text:'Ask whether he wants a walkthrough.',depth:0}]},
  {kind:'paragraph',text:'The draft is saved and **unsent**.'},
 ]);
 assert.ok(blocks[0].kind==='paragraph');
 assert.deepEqual(answerRuns(blocks[0].text),[{text:'Mike is a potential fit, '},{text:'pending repair detail',strong:true},{text:'.'}]);
});

test('inline emphasis and code preserve literal identifiers and code contents',()=>{
 assert.deepEqual(answerRuns('Use **current _reported_ facts**, not `confirmed=true`. investor_mike_demo is an ID.'),[
  {text:'Use '},{text:'current ',strong:true},{text:'reported',emphasis:true,strong:true},{text:' facts',strong:true},{text:', not '},{text:'confirmed=true',code:true},{text:'. investor_mike_demo is an ID.'},
 ]);
 assert.deepEqual(answerRuns('Escaped \\*literal\\* and unmatched **word'),[{text:'Escaped *literal* and unmatched **word'}]);
 assert.deepEqual(answerRuns('``a `backtick` and **literal**``'),[{text:'a `backtick` and **literal**',code:true}]);
});

test('comparison tables retain every label and value for stacked phone rows',()=>{
 assert.deepEqual(parseAgentAnswer('| Buyer | Fit | Next step |\n| :--- | ---: | --- |\n| Mike | Conditional | Clarify repairs |\n| David | Funding unconfirmed | Ask about timing |'),[
  {kind:'table',headers:['Buyer','Fit','Next step'],rows:[['Mike','Conditional','Clarify repairs'],['David','Funding unconfirmed','Ask about timing']]},
 ]);
 assert.deepEqual(parseAgentAnswer('Buyer | Note\n--- | ---\nMike | Ask about A\\|B and `x|y`\n\nStill unsent.'),[
  {kind:'table',headers:['Buyer','Note'],rows:[['Mike','Ask about A\\|B and `x|y`']]},
  {kind:'paragraph',text:'Still unsent.'},
 ]);
});

test('uneven table data and empty tables remain visible instead of silently losing columns',()=>{
 const uneven='| Buyer | Fit |\n| --- | --- |\n| Mike | Possible | Extra source |';
 assert.deepEqual(parseAgentAnswer(uneven),[{kind:'paragraph',text:uneven}]);
 const empty='| Buyer | Fit |\n| --- | --- |';
 assert.deepEqual(parseAgentAnswer(empty),[{kind:'paragraph',text:empty}]);
 const after='| Buyer | Fit |\n| --- | --- |\n| Mike | Possible |\n| David | Unknown | Extra detail |';
 assert.deepEqual(parseAgentAnswer(after),[
  {kind:'table',headers:['Buyer','Fit'],rows:[['Mike','Possible']]},
  {kind:'paragraph',text:'| David | Unknown | Extra detail |'},
 ]);
});

test('fenced code never turns its headings, HTML or link-like content into controls',()=>{
 const code='# literal\n<script>alert(1)</script>\n[Approve](agentdesknw://approve/one)';
 assert.deepEqual(parseAgentAnswer('```text\n'+code+'\n```'),[{kind:'code',language:'text',text:code}]);
 assert.deepEqual(parseAgentAnswer('~~~\n**not bold**\n~~~'),[{kind:'code',language:'',text:'**not bold**'}]);
 const partial='```text\nDo not hide this unfinished answer.';
 assert.deepEqual(parseAgentAnswer(partial),[{kind:'paragraph',text:partial}]);
});

test('links, images, raw HTML and action-looking URLs are inert visible text',()=>{
 for(const text of [
  '[Open](javascript:alert(1))',
  '![Private](https://external.example/track.png)',
  '<img src="https://external.example/track.png" onerror="alert(1)">',
  '[Approve](agentdesknw://work/one?approve=yes)',
  'https://external.example/?token=not-a-real-token',
 ]){
  assert.deepEqual(parseAgentAnswer(text),[{kind:'paragraph',text}]);
  assert.deepEqual(answerRuns(text),[{text}]);
 }
});

test('large and multiline answers keep all text without a partial formatting cutoff',()=>{
 const large='**Full evidence** '.repeat(4000);
 assert.deepEqual(parseAgentAnswer(large),[{kind:'paragraph',text:large}]);
 assert.deepEqual(answerRuns(large),[{text:large}]);
 const lines=Array.from({length:1001},(_,index)=>`Record ${index}`).join('\n');
 assert.deepEqual(parseAgentAnswer(lines),[{kind:'paragraph',text:lines}]);
 assert.deepEqual(parseAgentAnswer('First line.\r\nSecond line.\r\n\r\n- One\r\n  - Nested detail'),[
  {kind:'paragraph',text:'First line.\nSecond line.'},
  {kind:'list',items:[{marker:'•',text:'One',depth:0},{marker:'•',text:'Nested detail',depth:1}]},
 ]);
});
