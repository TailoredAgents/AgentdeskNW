import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {AssistantMarkdown} from '../src/components/AssistantMarkdown';

const render=(text:string)=>renderToStaticMarkup(createElement(AssistantMarkdown,{text}));
describe('assistant answer display boundary',()=>{
 it('displays grounded comparisons as semantic tables with keyboard scrolling',()=>{
  const html=render('## Current work\n\n| Record | State |\n| --- | --- |\n| Preview Lane | **Blocked** |');
  expect(html).toContain('<h2>Current work</h2>');expect(html).toContain('<table>');expect(html).toContain('<strong>Blocked</strong>');expect(html).toContain('tabindex="0"');
 });
 it('does not turn model HTML, remote image references or script URLs into active content',()=>{
  const html=render('<script>alert(1)</script>\n\n![Unverified image](https://tracking.example/pixel)\n\n[Unsafe](javascript:alert%281%29)\n\n[Source](https://example.com/evidence)');
  expect(html).not.toContain('<script');expect(html).not.toContain('<img');expect(html).not.toContain('tracking.example');expect(html).not.toContain('javascript:');expect(html).toContain('rel="noopener noreferrer"');expect(html).toContain('https://example.com/evidence');
 });
});
