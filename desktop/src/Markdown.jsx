import React, {useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Marked} from 'marked';
import DOMPurify from 'dompurify';
import MermaidView from './MermaidView.jsx';

export default function Markdown({text, onFile, baseUrl, onLink}) {
  const container=useRef(null),[slots,setSlots]=useState([]);
  const frontmatter=(text||'').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const body=frontmatter?(text||'').slice(frontmatter[0].length):text;
  const {html,diagrams}=useMemo(()=>{
    const diagrams=[];
    const parser=new Marked({gfm:true,renderer:{code(token){
      if(token.lang?.trim().toLowerCase()!=='mermaid')return false;
      const index=diagrams.push(token.text)-1;
      return `<div class="mermaid-placeholder" data-mermaid-block="${index}"></div>`;
    }}});
    const html=DOMPurify.sanitize(parser.parse(body||''),{FORBID_TAGS:['iframe','style','form','input','video','audio',...(!baseUrl?['img']:[])],FORBID_ATTR:['style']});
    const doc=new DOMParser().parseFromString(html,'text/html');
    for(const image of doc.querySelectorAll('img')){
      try{
        const url=new URL(image.getAttribute('src'),baseUrl);
        if(url.protocol!=='https:'){image.remove();continue;}
        if(url.hostname==='github.com') {url.hostname='raw.githubusercontent.com';url.pathname=url.pathname.replace('/blob/','/');}
        image.setAttribute('src',url.href);image.setAttribute('loading','lazy');image.setAttribute('referrerpolicy','no-referrer');
      }catch{image.remove();}
    }
    return{html:doc.body.innerHTML,diagrams};
  },[body,baseUrl]);
  useEffect(()=>{setSlots([...container.current.querySelectorAll('[data-mermaid-block]')]);},[html]);
  return <>{frontmatter&&<details className="markdown-metadata"><summary>技能元信息</summary><pre>{frontmatter[1]}</pre></details>}<article ref={container} className="markdown-content" onClick={event=>{
    const link=event.target.closest('a');
    if(!link)return;
    event.preventDefault();
    let href=link.getAttribute('href') || '';
    if(href.startsWith('#'))return;
    if(baseUrl){try{href=new URL(href,baseUrl).href;}catch{return;}}
    if(onLink?.(href))return;
    if(/^https?:\/\//i.test(href))window.asl.external(href);
    else if(onFile){try{onFile(decodeURIComponent(href.split('#')[0]));}catch{/* malformed repository link */}}
  }} dangerouslySetInnerHTML={{__html:html}}/>{slots.filter(slot=>container.current?.contains(slot)&&diagrams[Number(slot.dataset.mermaidBlock)]!==undefined).map((slot,i)=>createPortal(<MermaidView source={diagrams[Number(slot.dataset.mermaidBlock)]}/>,slot,`${html.length}-${i}`))}</>;
}
