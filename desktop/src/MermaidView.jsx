import React,{memo,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Minus,Plus,Scan,Maximize2,Minimize2,MousePointer2,Hand,Keyboard,X} from 'lucide-react';
import {renderDiagram} from './mermaid-render.mjs';
import {editRenderedLabel} from './mermaid-inline.mjs';
import {attachHandles,edgeHit} from './mermaid-handles.mjs';
import {structureElements,attachStructureDrag} from './mermaid-structure-dom.mjs';
import {diagramNodes,flowCanvas,attachFlowDrag} from './mermaid-canvas.mjs';
import {readLayout} from './mermaid-document.mjs';
import './mermaid.css';
import {attachCanvasControls} from './mermaid-controls.mjs';
import {canvasKeys} from './mermaid-shortcuts.mjs';
import {captureDiagram,animateDiagram} from './diagram-evolution.mjs';

export default memo(function MermaidView({source,onNode,nodes=[],onError,items,structure,onElement,onConnect,compact=false,selectedId,onExpand,expanded=false,disabled=false,evolve=false,evolutionGroup,renderedDiagram,apiRef,onSelection,onAction,actions}) {
  const [svg,setSvg]=useState(''),[error,setError]=useState(''),[scale,setScale]=useState(onElement?'read':'fit');
  const markup=useMemo(()=>({__html:svg}),[svg]);
  const [renderedSource,setRenderedSource]=useState('');
  const [naturalWidth,setNaturalWidth]=useState(0),[naturalHeight,setNaturalHeight]=useState(0),[availableWidth,setAvailableWidth]=useState(0),[availableHeight,setAvailableHeight]=useState(0);
  const fit=Math.min(1,naturalWidth&&availableWidth?Math.max(1,availableWidth-32)/naturalWidth:1,naturalHeight&&availableHeight?availableHeight/naturalHeight:1);
  // Stitch 9eab5bf772cb44d0ac422dac1df02a7e keeps initial reading at the designed font size.
  const zoom=compact?Math.max(.05,fit):scale==='read'?Math.max(1,fit):scale==='fit'?fit:scale;
  const box=useRef(null),section=useRef(null),[visible,setVisible]=useState(false);
  const camera=useRef(null),[frame,setFrame]=useState(0);
  const previousDiagram=useRef(new Map());
  const previousGroup=useRef(null);
  const selectionState=useRef({keys:[],tool:'select'}),controls=useRef(null);
  const canvasFocused=useRef(false);
  const [pan,setPan]=useState({x:0,y:0}),panRef=useRef(pan),anchor=useRef(null);
  const [tool,setTool]=useState('select'),[help,setHelp]=useState(false);
  function moveCamera(next){panRef.current=next;setPan(next);}
  function zoomTo(action,event){
    if(action==='fit'){camera.current=null;setRenderedSource('');setFrame(n=>n+1);setScale('fit');moveCamera({x:0,y:0});return;}
    const rect=box.current?.querySelector('.mermaid-drawing')?.getBoundingClientRect(),viewport=box.current?.getBoundingClientRect();
    const next=action==='actual'?1:Math.max(.15,Math.min(3,zoom*(action==='zoom-in'?1.2:1/1.2)));
    if(rect&&viewport){const x=event?.clientX??viewport.x+viewport.width/2,y=event?.clientY??viewport.y+viewport.height/2;anchor.current={x,y,rx:(x-rect.x)/zoom,ry:(y-rect.y)/zoom};}
    setScale(next);
  }
  useLayoutEffect(()=>{const point=anchor.current,rect=box.current?.querySelector('.mermaid-drawing')?.getBoundingClientRect();if(point&&rect){anchor.current=null;moveCamera({x:panRef.current.x+point.x-rect.x-point.rx*zoom,y:panRef.current.y+point.y-rect.y-point.ry*zoom});}controls.current?.paint();},[zoom,pan]);
  const callbacks=useRef({});callbacks.current={onNode,onElement,onConnect,nodes,onSelection,onAction,zoomTo};
  const bindingKey=JSON.stringify([nodes.map(n=>[n.alias,n.data.title,n.data.skill?.id]),!!onElement,!!onConnect]);
  useEffect(()=>{const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'160px'});observer.observe(section.current);return()=>observer.disconnect();},[]);
  useEffect(()=>{
    if(!visible)return;
    let current=true;setError('');
    if(onElement&&renderedSource&&renderedSource!==source)camera.current=box.current?.querySelector('svg')?.getAttribute('viewBox');
    (renderedDiagram?.source===source?Promise.resolve(renderedDiagram.svg):renderDiagram(source)).then(result=>{if(current){
      if(evolve){previousDiagram.current=previousGroup.current===evolutionGroup?captureDiagram(box.current):new Map();previousGroup.current=evolutionGroup;}
      const rendered=new DOMParser().parseFromString(result,'image/svg+xml').documentElement;
      // Do not recenter the paper under the pointer after a direct manipulation.
      if(camera.current)rendered.setAttribute('viewBox',camera.current);
      const dimensions=rendered.getAttribute('viewBox').split(/[\s,]+/);
      setNaturalWidth(Number(dimensions[2]));setNaturalHeight(Number(dimensions[3]));
      setSvg(new XMLSerializer().serializeToString(rendered));setRenderedSource(source);
    }}).catch(e=>{if(current){setError(e.message);onError?.(e.message);}});
    return()=>{current=false;};
  },[source,visible,frame,renderedDiagram,evolve,evolutionGroup]);
  useLayoutEffect(()=>{if(evolve)animateDiagram(box.current,previousDiagram.current);},[svg,evolve]);
  useLayoutEffect(()=>{
    // Identical SVG bytes in a new version must not retain the previous comparison's marks.
    if(evolve&&renderedSource===source)box.current?.querySelectorAll('.evolution-changed').forEach(element=>element.classList.remove('evolution-changed','evolution-added','evolution-updated'));
  },[renderedDiagram,evolutionGroup]);
  useEffect(()=>{
    const viewport=box.current;if(!viewport)return;
    const observer=new ResizeObserver(entries=>{
      if(!viewport.isConnected)return;
      const style=getComputedStyle(viewport),limit=parseFloat(style.maxHeight);
      setAvailableWidth(entries[0].contentRect.width);
      setAvailableHeight(Number.isFinite(limit)?Math.max(1,limit-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)):entries[0].contentRect.height);
    });
    observer.observe(viewport);return()=>observer.disconnect();
  },[svg]);
  useLayoutEffect(()=>{const drawing=box.current?.querySelector('svg');return()=>drawing?.dispatchEvent(new Event('asl:release-inline'));},[svg]);
  useLayoutEffect(()=>{
    if(!box.current||renderedSource!==source)return;
    if(selectionState.current.source!==source){selectionState.current.keys=selectionState.current.keys.filter(key=>/^(node|participant):/.test(key));selectionState.current.source=source;}
    // A catalog refresh can replace callbacks without changing the SVG. Do not cancel an active drag.
    const onNode=skill=>callbacks.current.onNode?.(skill);
    const holdCamera=()=>{camera.current=box.current.querySelector('svg')?.getAttribute('viewBox');};
    const onElement=callbacks.current.onElement?(...args)=>{if(args[0].kind==='layout')holdCamera();return callbacks.current.onElement?.(...args);}:null;
    const onConnect=callbacks.current.onConnect?(...args)=>{holdCamera();return callbacks.current.onConnect?.(...args);}:null;
    const openNode=alias=>{const node=callbacks.current.nodes.find(n=>n.alias===alias);if(node)onNode({...node.data.skill,title:node.data.title});};
    box.current.querySelectorAll('.mermaid-edge-hit').forEach(element=>element.remove());
    const findNodes=alias=>diagramNodes(box.current,alias);
    const findNode=alias=>findNodes(alias)[0];
    const handles=[],entries=[];
    let navigation;
    const choose=(item,event)=>{if(onElement(item,'select',event)!==false)navigation?.choose(item,event);};
    box.current.querySelectorAll('g.node').forEach(el=>el.classList.remove('is-selected'));
    for(const node of nodes){
      for(const element of findNodes(node.alias)){
      element.setAttribute('role','button');element.setAttribute('tabindex','0');element.setAttribute('aria-label',node.data.title);
      element.classList.toggle('is-selected',node.data.skill?.id===selectedId);
      element.onclick=()=>openNode(node.alias);
      element.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openNode(node.alias);}};
      if(onElement&&!items?.editable&&!structure?.type){
        const target={kind:'node',id:node.alias,label:node.data.title,edit:()=>callbacks.current.onAction?.('source')};entries.push({element,item:target});
        element.onclick=event=>{event.stopPropagation();choose(target,event);};element.ondblclick=target.edit;element.onkeydown=null;element.onfocus=()=>navigation?.choose(target);
      }
      }
    }
    if(items?.editable&&onElement){
      for(const node of items.nodes){
        const element=findNode(node.id);if(!element)continue;
        element.setAttribute('role','button');element.setAttribute('tabindex','0');element.setAttribute('aria-label',node.label);
        const target={kind:'node',id:node.id,label:node.label};
        const edit=event=>{event?.stopPropagation();editRenderedLabel(element,target,label=>onElement({...target,label},'commit',event));};
        target.edit=()=>edit();entries.push({element,item:target});
        element.onclick=event=>{event.stopPropagation();choose(target,event);};
        element.ondblclick=edit;
        element.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();if(!navigation?.nodeIds().includes(target.id))navigation?.choose(target);onElement(target,'context',e);};
        element.onkeydown=null;element.onfocus=()=>navigation?.choose(target);
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
          const edit=event=>{event?.stopPropagation();editRenderedLabel(element===hit?path:element,target,label=>onElement({...target,label},'commit',event));};
          target.edit=()=>edit();entries.push({element,item:target});
          element.onclick=event=>{event.stopPropagation();choose(target,event);};element.ondblclick=edit;
          element.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();onElement({...target,edit:()=>edit(e)},'context',e);};
          element.onkeydown=null;element.onfocus=()=>navigation?.choose(target);
        }
      });
    }
    const svgElement=box.current.querySelector('svg');
    const canvas=svgElement&&items?.editable&&onElement?flowCanvas(svgElement,items,readLayout(source),false):null;
    const detach=svgElement?attachHandles(svgElement,handles,onConnect,canvas):()=>{};
    let detachStructure=()=>{};
    if(canvas&&!compact)detachStructure=attachFlowDrag(svgElement,canvas,change=>onElement(change,'commit'),{ids:()=>navigation?.nodeIds()||[],start:id=>{if(!navigation?.nodeIds().includes(id))navigation?.choose(entries.find(e=>e.item.kind==='node'&&e.item.id===id).item);}});
    if(svgElement&&structure?.type&&onElement) {
      const structured=structureElements(svgElement,structure);
      for(const {element,item,label} of structured) {
        element.setAttribute('role','button');element.setAttribute('tabindex','0');element.setAttribute('aria-label',item.label||'编辑图中文字');
        const edit=event=>{event?.stopPropagation();editRenderedLabel(label||element,item,value=>onElement({...item,label:value},'commit',event));};
        const target={...item,edit:()=>edit()};entries.push({element,item:target});
        element.ondblclick=edit;
        element.onclick=event=>{event.stopPropagation();choose(target,event);};
        element.oncontextmenu=event=>{event.preventDefault();event.stopPropagation();navigation?.choose(target);onElement(target,'context',event);};
        element.onkeydown=null;element.onfocus=()=>navigation?.choose(target);
      }
      detachStructure=attachStructureDrag(svgElement,structured,structure,change=>onElement(change,'commit'));
    }
    if(onElement&&!compact){
      navigation=attachCanvasControls(box.current,entries,canvas,selectionState.current,{
        edges:items?.edges||[],
        pan:moveCamera,getPan:()=>panRef.current,onTool:setTool,zoom:(...args)=>callbacks.current.zoomTo(...args),
        onSelection:value=>callbacks.current.onSelection?.(value),
        canOpen:item=>item&&callbacks.current.nodes.some(n=>n.alias===item.id),
        onAction:(action,selection,event)=>{if(action==='help')setHelp(v=>!v);else callbacks.current.onAction?.(action,selection,event);},
        commit:change=>onElement(change,'commit'),
      });controls.current=navigation;if(apiRef)apiRef.current=navigation;
    }
    if(canvasFocused.current&&document.activeElement===document.body)box.current.focus({preventScroll:true});
    return ()=>{navigation?.destroy();controls.current=null;if(apiRef)apiRef.current=null;detach();detachStructure();};
  },[svg,bindingKey,items,structure,compact,selectedId,renderedSource]);
  return <section ref={section} className={`mermaid-view ${compact?'is-compact':''} ${onElement?'is-interactive':''} ${scale==='read'&&zoom>fit?'is-reading':''}`} aria-label="Mermaid 架构图">
    {error?<div role="alert" className="mermaid-error"><strong>这张图需要修正</strong><details><summary>详细错误</summary><pre>{error}</pre></details></div>:null}
    {!svg&&!error&&<div role="status" className="mermaid-pending">正在绘图…</div>}
    {svg&&<><div className="mermaid-viewport" ref={box} tabIndex={onElement?0:undefined} aria-label={onElement?'交互画板':undefined} onFocusCapture={()=>{canvasFocused.current=true;}} onBlurCapture={e=>{if(e.relatedTarget&&!e.currentTarget.contains(e.relatedTarget))canvasFocused.current=false;}} inert={disabled||renderedSource!==source}><div className="mermaid-drawing" style={{width:`${naturalWidth*zoom}px`,transform:onElement?`translate(${pan.x}px,${pan.y}px)`:undefined}} dangerouslySetInnerHTML={markup}/></div>
      {!compact&&<>
        {zoom<.65&&<p className="mermaid-reading-hint">全图概览 · 点击百分比以 100% 阅读文字</p>}
        {scale==='read'&&zoom>fit&&<p className="mermaid-reading-hint">滚轮平移 · Ctrl + 滚轮缩放 · Shift + 1 查看全图</p>}
        <div className="mermaid-tools" role="toolbar" aria-label="画板工具">
          {onElement&&<><button aria-label="选择工具" title="选择（V）" aria-pressed={tool==='select'} onClick={()=>controls.current?.setTool('select')}><MousePointer2 size={15}/></button><button aria-label="平移工具" title="平移（H）；按住空格临时平移" aria-pressed={tool==='hand'} onClick={()=>controls.current?.setTool('hand')}><Hand size={15}/></button><span className="mermaid-tool-divider"/>{actions}<span className="mermaid-tool-divider"/></>}
          <button aria-label="缩小图" title="缩小（−）" disabled={zoom<=.15} onClick={()=>zoomTo('zoom-out')}><Minus size={15}/></button>
          <button className="mermaid-scale" aria-label="按原始大小阅读" title="100%（Shift+0）" onClick={()=>zoomTo('actual')}>{Math.round(zoom*100)}%</button>
          <button aria-label="放大图" title="放大（+）" disabled={zoom>=3} onClick={()=>zoomTo('zoom-in')}><Plus size={15}/></button>
          <button aria-label="全图概览并复位" title="显示全图（Shift+1）" onClick={()=>zoomTo('fit')}><Scan size={15}/><span>全图</span></button>
          {onExpand&&<button aria-label={expanded?'退出全屏画板':'全屏编辑画板'} onClick={onExpand}>{expanded?<Minimize2 size={15}/>:<Maximize2 size={15}/>}</button>}
          {onElement&&<button aria-label="画板快捷键" title="快捷键（?）" aria-expanded={help} onClick={()=>setHelp(!help)}><Keyboard size={16}/></button>}
        </div>
        {help&&<aside className="mermaid-shortcut-panel" role="dialog" aria-label="画板快捷键" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setHelp(false);box.current?.focus();}}}><header><strong>画板快捷键</strong><button autoFocus aria-label="关闭快捷键说明" onClick={()=>{setHelp(false);box.current?.focus();}}><X size={16}/></button></header><dl>{canvasKeys.map(([name,key])=><div key={name}><dt>{name}</dt><dd>{key}</dd></div>)}</dl><p>复制、多选拖动和方向键微调适用于流程图。文字编辑时，快捷键作用于文字。</p></aside>}
      </>}
    </>}
  </section>;
});
