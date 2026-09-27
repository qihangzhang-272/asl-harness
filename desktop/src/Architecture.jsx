import React, {useEffect, useMemo, useState, useRef} from 'react';
import svgPanZoom from 'svg-pan-zoom';
import {Box, Layers3, Puzzle, Search, Send, Palette, PenLine, ChartNoAxesCombined, PanelsTopLeft, Plus, Pencil, Maximize2, Minimize2, ArrowUpRight, Minus, Scan} from 'lucide-react';
import {diagramForMode} from './presentation.mjs';

const icons={Box,Layers3,Puzzle,Search,Send,Palette,PenLine,ChartNoAxesCombined,PanelsTopLeft};
export function MapIcon({value='Box',color='#007AFF',size=19}) {
  const Icon=icons[value];
  if(Icon)return <Icon size={size}/>;
  if(value.startsWith('<svg')) {
    const svg=(value.includes('xmlns=')?value:value.replace('<svg','<svg xmlns="http://www.w3.org/2000/svg"')).replaceAll('currentColor',color);
    return <img alt="" width={size} height={size} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}/>;
  }
  return <span aria-hidden="true">{value}</span>;
}
const mermaidReady=import('mermaid').then(({default:mermaid})=>{
  mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'base',look:'classic',layout:'dagre',htmlLabels:false,
    fontFamily:'-apple-system, BlinkMacSystemFont, Segoe UI, Microsoft YaHei UI, sans-serif',
    themeVariables:{fontSize:'15px',primaryColor:'#ffffff',primaryTextColor:'#1d1d1f',
      primaryBorderColor:'#cfd6df',lineColor:'#8b99ac',edgeLabelBackground:'#fafbfd'},
    flowchart:{htmlLabels:false,curve:'bumpX',nodeSpacing:35,rankSpacing:50,padding:12,wrappingWidth:170,useMaxWidth:false}});
  return mermaid;
});
export function ArchitectureMap({mode,skills,onSkill,onEdit,onGuide}) {
  const [expanded,setExpanded]=useState(false),[error,setError]=useState('');
  const [paradigmId,setParadigmId]=useState('');
  const container=useRef(null),pan=useRef(null),openSkill=useRef(onSkill);
  openSkill.current=onSkill;
  const diagram=useMemo(()=>diagramForMode(mode,skills,paradigmId),[mode,skills,paradigmId]);
  function fit() {
    const bounds=container.current?.getBoundingClientRect();
    if(!pan.current||!bounds?.width||!bounds.height)return;
    pan.current.resize();pan.current.fit();
    const zoom=pan.current.getSizes().realZoom;
    if(zoom>1.15)pan.current.zoomBy(1.15/zoom);
    pan.current.center();
  }
  useEffect(()=>{
    function escape(e){if(e.key==='Escape')setExpanded(false);}
    window.addEventListener('keydown',escape);
    return ()=>window.removeEventListener('keydown',escape);
  },[]);
  useEffect(()=>{
    if(!container.current||!diagram.nodes.length)return;
    let cancelled=false,observer;
    setError('');
    (async()=>{
      const mermaid=await mermaidReady;
      const {svg}=await mermaid.render('asl-'+crypto.randomUUID(),diagram.source);
      if(cancelled)return;
      const element=container.current;
      element.innerHTML=svg;
      const image=element.querySelector('svg');
      image.setAttribute('width','100%');image.setAttribute('height','100%');image.style.maxWidth='none';
      diagram.nodes.forEach(n=>{
        const group=image.querySelector(`[id^="flowchart-${n.alias}-"], [id*="-flowchart-${n.alias}-"], [id$="-${n.alias}"]`);
        if(!group)return;
        group.setAttribute('role','button');group.setAttribute('tabindex','0');
        group.setAttribute('aria-label',n.data.title);group.dataset.skill=n.id;
        const rect=group.querySelector('rect');
        if(rect){rect.setAttribute('rx','8');rect.setAttribute('ry','8');if(n.data.color)rect.style.stroke=n.data.color;}
        const tooltip=document.createElementNS('http://www.w3.org/2000/svg','title');
        tooltip.textContent=n.data.note||n.data.title;group.append(tooltip);
        const iconSlot=[...group.querySelectorAll('.text-inner-tspan')].find(span=>span.textContent==='◈');
        if(n.data.icon?.startsWith('<svg')&&iconSlot){
          const icon=document.createElementNS('http://www.w3.org/2000/svg','image');
          const markup=n.data.icon.includes('xmlns=')?n.data.icon:n.data.icon.replace('<svg','<svg xmlns="http://www.w3.org/2000/svg"');
          icon.setAttribute('href','data:image/svg+xml;charset=utf-8,'+encodeURIComponent(markup.replaceAll('currentColor',n.data.color||'#007AFF')));
          const box=iconSlot.getBBox();
          iconSlot.style.opacity='0';
          icon.setAttribute('x',String(box.x));icon.setAttribute('y',String(box.y));
          icon.setAttribute('width',String(box.width));icon.setAttribute('height',String(box.height));
          iconSlot.closest('text').parentNode.append(icon);
        }
        let down;
        group.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};});
        group.addEventListener('click',e=>{
          if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;
          setExpanded(false);openSkill.current(n.data.skill);
        });
        group.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setExpanded(false);openSkill.current(n.data.skill);}});
      });
      const resize=()=>{
        const bounds=element.getBoundingClientRect();
        if(cancelled||!bounds.width||!bounds.height)return;
        if(!pan.current)pan.current=svgPanZoom(image,{fit:true,center:true,controlIconsEnabled:false,minZoom:.15,maxZoom:8,dblClickZoomEnabled:false});
        fit();
      };
      resize();
      observer=new ResizeObserver(resize);
      observer.observe(element);
    })().catch(e=>{if(!cancelled)setError('架构图未能显示：'+e.message);});
    return ()=>{cancelled=true;observer?.disconnect();pan.current?.destroy();pan.current=null;};
  },[diagram]);
  return <section className={`architecture-section ${expanded?'is-expanded':''}`}>
    <header className="architecture-toolbar">
      <div><strong>{expanded?mode.title:'工作架构'}</strong><span>{mode.architecture?.paradigms?`${mode.architecture.paradigms.length} 种工作范式`:'待定义工作范式'}</span></div>
      <div className="heading-actions">
        {onGuide&&<button className="text-button" onClick={()=>{setExpanded(false);onGuide();}}>交给 Agent <ArrowUpRight size={14}/></button>}
        {onEdit&&<button onClick={()=>{setExpanded(false);onEdit();}}><Pencil size={14}/>编辑</button>}
        <button className="icon-button" aria-label={expanded?'收起架构图':'放大架构图'} title={expanded?'收起':'放大'} onClick={()=>setExpanded(!expanded)}>{expanded?<Minimize2 size={17}/>:<Maximize2 size={17}/>}</button>
      </div>
    </header>
    {!!mode.architecture?.paradigms?.length && <div className="paradigm-tabs" role="tablist" aria-label="工作范式">{mode.architecture.paradigms.map(p=><button role="tab" aria-selected={diagram.paradigm?.id===p.id} className={diagram.paradigm?.id===p.id?'active':''} key={p.id} onClick={()=>setParadigmId(p.id)}>{p.title}<small>{p.skills.length}</small></button>)}</div>}
    {diagram.paradigm && <p className="paradigm-description">{diagram.paradigm.description}</p>}
    {!mode.architecture?.paradigms && <p className="map-note">这个 Mode 还只有技能清单。编辑工作架构，或交给 Agent 根据本地技能定义常用范式。</p>}
    {diagram.nodes.length ? <div className="architecture-canvas">
      <div className="mermaid-diagram" ref={container} aria-label="技能架构图"/>
      {error&&<p role="alert" className="architecture-render-error">{error}</p>}
      <div className="diagram-controls">
        <button aria-label="缩小" title="缩小" onClick={()=>pan.current?.zoomOut()}><Minus size={16}/></button>
        <button aria-label="适应画布" title="适应画布" onClick={fit}><Scan size={16}/></button>
        <button aria-label="放大" title="放大" onClick={()=>pan.current?.zoomIn()}><Plus size={16}/></button>
      </div>
    </div> : <div className="architecture-empty"><Puzzle size={28}/><p>{skills.length?'这些能力按需独立使用。':'添加技能后在这里呈现。'}</p></div>}
    {!!mode.architecture?.shared?.length && <div className="shared-capabilities"><span>通用能力<small>各范式按需使用</small></span><div>{mode.architecture.shared.map(id=>{const s=skills.find(s=>s.id===id);return s&&<button key={id} onClick={()=>onSkill(s)}><Puzzle size={14}/>{mode.architecture.nodes?.find(n=>n.skill===id)?.title||s.title}</button>;})}</div></div>}
    <footer className="architecture-caption"><span>每个节点都是一个完整技能</span><span>拖动平移 · 滚轮缩放 · 点选查看</span></footer>
  </section>;
}

export {default as ArchitectureEditor} from './ParadigmEditor.jsx';
