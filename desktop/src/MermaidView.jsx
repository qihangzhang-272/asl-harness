import React,{memo,useEffect,useMemo,useRef,useState} from 'react';
import {Minus,Plus,Scan,Maximize2,Minimize2} from 'lucide-react';
import {renderDiagram} from './mermaid-render.mjs';
import {editRenderedLabel} from './mermaid-inline.mjs';
import {attachHandles,edgeHit} from './mermaid-handles.mjs';
import {diagramNodes,structureElements,attachStructureDrag} from './mermaid-structure-dom.mjs';
import './mermaid.css';

export default memo(function MermaidView({source,onNode,nodes=[],onError,items,structure,onElement,onConnect,compact=false,selectedId,onExpand,expanded=false,disabled=false}) {
  const [svg,setSvg]=useState(''),[error,setError]=useState(''),[scale,setScale]=useState(null);
  const markup=useMemo(()=>({__html:svg}),[svg]);
  const [renderedSource,setRenderedSource]=useState('');
  const [naturalWidth,setNaturalWidth]=useState(0),[naturalHeight,setNaturalHeight]=useState(0),[availableWidth,setAvailableWidth]=useState(0);
  const fit=Math.min(1,(availableWidth-32)/naturalWidth||1,compact?150/naturalHeight:Infinity);
  const zoom=compact?Math.max(.05,fit):scale==='fit'?Math.max(.15,fit):(scale??1);
  const box=useRef(null),section=useRef(null),[visible,setVisible]=useState(false);
  const clickTimers=useRef(new Map());
  const callbacks=useRef({});callbacks.current={onNode,onElement,onConnect,nodes};
  const bindingKey=JSON.stringify([nodes.map(n=>[n.alias,n.data.title,n.data.skill?.id]),!!onElement,!!onConnect]);
  // Background catalog/connection refreshes must not cancel a user's pending single click.
  useEffect(()=>()=>{clickTimers.current.forEach(clearTimeout);clickTimers.current.clear();},[source,svg]);
  useEffect(()=>{const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'160px'});observer.observe(section.current);return()=>observer.disconnect();},[]);
  useEffect(()=>{
    if(!visible)return;
    let current=true;setError('');
    renderDiagram(source).then(result=>{if(current){
      const dimensions=new DOMParser().parseFromString(result,'image/svg+xml').documentElement.getAttribute('viewBox').split(/[\s,]+/);
      setNaturalWidth(Number(dimensions[2]));setNaturalHeight(Number(dimensions[3]));
      setSvg(result);setRenderedSource(source);
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
    // A catalog refresh can replace callbacks without changing the SVG. Do not cancel an active drag.
    const onNode=skill=>callbacks.current.onNode?.(skill);
    const onElement=callbacks.current.onElement?(...args)=>callbacks.current.onElement?.(...args):null;
    const onConnect=callbacks.current.onConnect?(...args)=>callbacks.current.onConnect?.(...args):null;
    const openNode=alias=>{const node=callbacks.current.nodes.find(n=>n.alias===alias);if(node)onNode({...node.data.skill,title:node.data.title});};
    box.current.querySelectorAll('.mermaid-edge-hit').forEach(element=>element.remove());
    const findNodes=alias=>diagramNodes(box.current,alias);
    const findNode=alias=>findNodes(alias)[0];
    const handles=[];
    box.current.querySelectorAll('g.node').forEach(el=>el.classList.remove('is-selected'));
    for(const node of nodes){
      for(const element of findNodes(node.alias)){
      element.setAttribute('role','button');element.setAttribute('tabindex','0');element.setAttribute('aria-label',node.data.title);
      element.classList.toggle('is-selected',node.data.skill?.id===selectedId);
      element.onclick=()=>openNode(node.alias);
      element.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openNode(node.alias);}};
      }
    }
    if(items?.editable&&onElement){
      for(const node of items.nodes){
        const element=findNode(node.id);if(!element)continue;
        element.setAttribute('role','button');element.setAttribute('tabindex','0');element.setAttribute('aria-label',node.label);
        const target={kind:'node',id:node.id,label:node.label};
        const cancelClick=()=>{clearTimeout(clickTimers.current.get(node.id));clickTimers.current.delete(node.id);};
        const edit=event=>{cancelClick();event?.stopPropagation();editRenderedLabel(element,target,label=>onElement({...target,label},'commit',event));};
        element.onclick=event=>{event.stopPropagation();cancelClick();if(event.detail>1)return;clickTimers.current.set(node.id,setTimeout(()=>{clickTimers.current.delete(node.id);if(onElement(target,'select',event)!==false)edit(event);},220));};
        element.ondblclick=edit;
        element.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();onElement({...target,edit:()=>edit(e)},'context',e);};
        element.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onElement(target,'select',e);}if(e.key==='F2'){e.preventDefault();edit(e);}};
        if(!compact&&onConnect)handles.push({element,id:node.id});
      }
      const paths=[...box.current.querySelectorAll('path.flowchart-link')];
      const labels=[...box.current.querySelectorAll('g.edgeLabels g.label[data-id]')];
      items.edges.forEach((edge,index)=>{
        const path=paths.find(el=>el.getAttribute('data-id')===edge.renderId);if(!path)return;
        const label=labels.find(el=>el.getAttribute('data-id')===edge.renderId)?.parentElement;
        const hit=edgeHit(path);
        for(const element of [path,hit,label].filter(Boolean)){
          const target={kind:'edge',index,label:edge.label};
          element.setAttribute('role','button');element.setAttribute('tabindex','0');element.setAttribute('aria-label',edge.label||'编辑连线');
          const edit=event=>{if(onElement(target,'select',event)!==false)editRenderedLabel(element===hit?path:element,target,label=>onElement({...target,label},'commit',event));};
          element.onclick=edit;
          element.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();onElement({...target,edit:()=>edit(e)},'context',e);};
          element.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();edit(e);}};
        }
      });
    }
    const svgElement=box.current.querySelector('svg');
    const detach=svgElement?attachHandles(svgElement,handles,onConnect):()=>{};
    let detachStructure=()=>{};
    if(svgElement&&items?.editable&&onElement){
      const entries=items.nodes.filter(n=>!n.implicit).map(item=>({element:findNode(item.id),item:{...item,key:item.id,kind:'node'}})).filter(e=>e.element);
      detachStructure=attachStructureDrag(svgElement,entries,{type:'flowchart',structural:true},change=>onElement(change,'commit'));
    }
    if(svgElement&&structure?.type&&onElement) {
      const entries=structureElements(svgElement,structure);
      for(const {element,item,label} of entries) {
        const isNode=['node','participant'].includes(item.kind);
        element.setAttribute('role','button');element.setAttribute('tabindex','0');element.setAttribute('aria-label',item.label||'编辑图中文字');
        const cancelClick=()=>{clearTimeout(clickTimers.current.get(item.key));clickTimers.current.delete(item.key);};
        const edit=event=>{cancelClick();event?.stopPropagation();editRenderedLabel(label||element,item,value=>onElement({...item,label:value},'commit',event));};
        element.ondblclick=edit;
        element.onclick=event=>{
          event.stopPropagation();cancelClick();if(event.detail>1)return;
          if(!isNode){edit(event);return;}
          clickTimers.current.set(item.key,setTimeout(()=>{clickTimers.current.delete(item.key);if(onElement(item,'select',event)!==false)edit(event);},220));
        };
        element.oncontextmenu=event=>{event.preventDefault();event.stopPropagation();onElement({...item,edit:()=>edit(event)},'context',event);};
        element.onkeydown=event=>{if(event.key==='F2'||event.key==='Enter'){event.preventDefault();edit(event);}};
      }
      detachStructure=attachStructureDrag(svgElement,entries,structure,change=>onElement(change,'commit'));
    }
    return ()=>{detach();detachStructure();};
  },[svg,bindingKey,items,structure,compact,selectedId]);
  return <section ref={section} className={`mermaid-view ${compact?'is-compact':''}`} aria-label="Mermaid 架构图">
    {error?<div role="alert" className="mermaid-error"><strong>这张图需要修正</strong><details><summary>详细错误</summary><pre>{error}</pre></details></div>:null}
    {!svg&&!error&&<div role="status" className="mermaid-pending">正在绘图…</div>}
    {svg&&<><div className="mermaid-viewport" ref={box} inert={disabled||renderedSource!==source}><div className="mermaid-drawing" style={{width:`${naturalWidth*zoom}px`}} dangerouslySetInnerHTML={markup}/></div>
      {!compact&&<div className="mermaid-tools"><button aria-label="缩小图" disabled={zoom<=.15} onClick={()=>setScale(Math.max(.15,zoom-.2))}><Minus size={15}/></button><button aria-label="适应宽度" onClick={()=>setScale('fit')}><Scan size={15}/></button><button aria-label="放大图" disabled={zoom>=3} onClick={()=>setScale(Math.min(3,zoom+.2))}><Plus size={15}/></button>{onExpand&&<button aria-label={expanded?'退出全屏画板':'全屏编辑画板'} onClick={onExpand}>{expanded?<Minimize2 size={15}/>:<Maximize2 size={15}/>}</button>}</div>}</>}
  </section>;
});
