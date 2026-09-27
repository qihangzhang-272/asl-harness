import React, {useMemo} from 'react';
import {marked} from 'marked';
import DOMPurify from 'dompurify';

export default function Markdown({text, onFile}) {
  const frontmatter=(text||'').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const body=frontmatter?(text||'').slice(frontmatter[0].length):text;
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(body || '', {gfm:true}), {
    FORBID_TAGS:['img', 'iframe', 'style', 'form', 'input', 'video', 'audio'],
    FORBID_ATTR:['style'],
  }), [body]);
  return <>{frontmatter&&<details className="markdown-metadata"><summary>技能元信息</summary><pre>{frontmatter[1]}</pre></details>}<article className="markdown-content" onClick={event=>{
    const link=event.target.closest('a');
    if(!link)return;
    event.preventDefault();
    const href=link.getAttribute('href') || '';
    if(/^https?:\/\//i.test(href))window.asl.external(href);
    else if(onFile && !href.startsWith('#'))onFile(decodeURIComponent(href.split('#')[0]));
  }} dangerouslySetInnerHTML={{__html:html}}/></>;
}
