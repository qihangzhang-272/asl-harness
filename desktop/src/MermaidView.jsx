import React,{memo,useEffect,useMemo,useRef,useState} from 'react';
import {Minus,Plus,Scan} from 'lucide-react';
import {renderDiagram} from './mermaid-render.mjs';
import {editRenderedLabel} from './mermaid-inline.mjs';
import './mermaid.css';

export default memo(function MermaidView({source,onNode,nodes=[],onError,items,onElement}) {
  const [svg,setSvg]=useState(''),[error,setError]=useState(''),[scale,setScale]=useState(null);
  const markup=useMemo(()=>({__html:svg}),[svg]);
  const [naturalWidth,setNaturalWidth]=useState(0),[availableWidth,setAvailableWidth]=useState(0);
  const zoom=scale??Math.min(1,Math.max(.85,availableWidth/naturalWidth||1));
  const box=useRef(null),section=useRef(null),[visible,setVisible]=useState(false);
  useEffect(()=>{const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'160px'});observer.observe(section.current);return()=>observer.disconnect();},[]);
  useEffect(()=>{
    if(!visible)return;
    let current=true;setError('');setScale(null);setSvg('');
    renderDiagram(source).then(result=>{if(current){
      setNaturalWidth(Number(new DOMParser().parseFromString(result,'image/svg+xml').documentElement.getAttribute('viewBox').split(/[\s,]+/)[2]));
      setSvg(result);
    }}).catch(e=>{if(current){setError(e.message);onError?.(e.message);}});
    return()=>{current=false;};
  },[source,visible]);
  useEffect(()=>{
    if(!box.current)return;
    const observer=new ResizeObserver(entries=>setAvailableWidth(entries[0].contentRect.width));
    observer.observe(box.current);return()=>observer.disconnect();
  },[svg]);
  useEffect(()=>{
    if(!box.current)return;
    box.current.querySelectorAll('.mermaid-edge-hit').forEach(element=>element.remove());
    const findNode=alias=>[...box.current.querySelectorAll('g.node')].find(el=>el.id.includes(`flowchart-${alias}-`)||el.id===alias);
    for(const node of nodes){
      const element=findNode(node.alias);
      if(!element)continue;
      element.setAttribute('role','button');element.setAttribute('tabindex','0');element.setAttribute('aria-label',node.data.title);
      element.onclick=()=>onNode?.(node.data.skill);
      element.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onNode?.(node.data.skill);}};
    }
    if(items?.editable&&onElement){
      for(const node of items.nodes){
        const element=findNode(node.id);if(!element)continue;
        element.setAttribute('role','button');element.setAttribute('tabindex','0');element.setAttribute('aria-label',node.label);
        const target={kind:'node',id:node.id,label:node.label};
        const edit=event=>{if(onElement(target,'select',event)!==false)editRenderedLabel(element,target,label=>onElement({...target,label},'commit',event));};
        element.onclick=edit;
        element.ondblclick=edit;
        element.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();onElement(target,'context',e);};
        element.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();edit(e);}};
      }
      const paths=[...box.current.querySelectorAll('path.flowchart-link')];
      const labels=[...box.current.querySelectorAll('g.edgeLabels g.label[data-id]')];
      items.edges.forEach((edge,index)=>{
        const path=paths.find(el=>el.getAttribute('data-id')===edge.renderId);if(!path)return;
        const label=labels.find(el=>el.getAttribute('data-id')===edge.renderId)?.parentElement;
        const hit=path.cloneNode(false);hit.removeAttribute('id');hit.removeAttribute('data-id');hit.removeAttribute('style');hit.removeAttribute('marker-end');hit.removeAttribute('marker-start');hit.setAttribute('class','mermaid-edge-hit');path.after(hit);
        for(const element of [path,hit,label].filter(Boolean)){
          const target={kind:'edge',index,label:edge.label};
          element.setAttribute('role','button');element.setAttribute('tabindex','0');element.setAttribute('aria-label',edge.label||'编辑连线');
          const edit=event=>{if(onElement(target,'select',event)!==false)editRenderedLabel(element===hit?path:element,target,label=>onElement({...target,label},'commit',event));};
          element.onclick=edit;
          element.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();onElement(target,'context',e);};
          element.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();edit(e);}};
        }
      });
    }
  },[svg,onNode,nodes,items,onElement]);
  return <section ref={section} className="mermaid-view" aria-label="Mermaid 架构图">
    {error?<div role="alert" className="mermaid-error"><strong>这张图需要修正</strong><details><summary>详细错误</summary><pre>{error}</pre></details></div>:null}
    {!svg&&!error&&<div role="status" className="mermaid-pending">正在绘图…</div>}
    {svg&&<><div className="mermaid-viewport" ref={box}><div className="mermaid-drawing" style={{width:`${naturalWidth*zoom}px`}} dangerouslySetInnerHTML={markup}/></div>
      <div className="mermaid-tools"><button aria-label="缩小图" disabled={zoom<=.3} onClick={()=>setScale(Math.max(.3,zoom-.2))}><Minus size={15}/></button><button aria-label="适应宽度" onClick={()=>setScale(Math.min(1,availableWidth/naturalWidth||1))}><Scan size={15}/></button><button aria-label="放大图" disabled={zoom>=3} onClick={()=>setScale(Math.min(3,zoom+.2))}><Plus size={15}/></button></div></>}
  </section>;
});
