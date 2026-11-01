import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Model output is display content, never executable HTML or remote media. */
export function AssistantMarkdown({text}:{text:string}){
 return <div className="assistant-markdown"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
  img:({alt})=><span>{alt??''}</span>,
  a:({href,children})=>href?<a href={href} target="_blank" rel="noopener noreferrer">{children}</a>:<span>{children}</span>,
  table:({children})=><div className="assistant-table" role="region" aria-label="Copilot table" tabIndex={0}><table>{children}</table></div>,
 }}>{text}</Markdown></div>;
}
