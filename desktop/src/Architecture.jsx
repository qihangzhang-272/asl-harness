import React, {useEffect, useMemo, useState, useRef} from 'react';
import svgPanZoom from 'svg-pan-zoom';
import {Box, Layers3, Puzzle, Search, Send, Palette, PenLine, ChartNoAxesCombined, PanelsTopLeft, Plus, X, Pencil, Maximize2, Minimize2, ArrowDown, ArrowUpRight, Minus, Scan} from 'lucide-react';
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
    flowchart:{htmlLabels:false,curve:'bumpY',nodeSpacing:28,rankSpacing:36,padding:8,wrappingWidth:220,useMaxWidth:false}});
  return mermaid;
});
export function ArchitectureMap({mode,skills,onSkill,onEdit,onGuide}) {
  const [expanded,setExpanded]=useState(false),[error,setError]=useState('');
  const container=useRef(null),pan=useRef(null),openSkill=useRef(onSkill);
  openSkill.current=onSkill;
  const diagram=useMemo(()=>diagramForMode(mode,skills),[mode,skills]);
  useEffect(()=>{
    function escape(e){if(e.key==='Escape')setExpanded(false);}
    window.addEventListener('keydown',escape);
    return ()=>window.removeEventListener('keydown',escape);
  },[]);
  useEffect(()=>{
    if(!container.current||!skills.length)return;
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
        const group=image.querySelector(`[id*="-flowchart-${n.alias}-"], [id$="-${n.alias}"]`);
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
      pan.current=svgPanZoom(image,{fit:true,center:true,controlIconsEnabled:false,minZoom:.15,maxZoom:8,dblClickZoomEnabled:false});
      observer=new ResizeObserver(()=>{pan.current?.resize();pan.current?.fit();pan.current?.center();});
      observer.observe(element);
    })().catch(e=>{if(!cancelled)setError('架构图未能显示：'+e.message);});
    return ()=>{cancelled=true;observer?.disconnect();pan.current?.destroy();pan.current=null;};
  },[diagram]);
  return <section className={`architecture-section ${expanded?'is-expanded':''}`}>
    <header className="architecture-toolbar">
      <div><strong>{expanded?mode.title:'技能架构'}</strong><span>{skills.length} 个技能{diagram.edges.length?` · ${diagram.edges.length} 条关联`:' · 尚未定义关联'}</span></div>
      <div className="heading-actions">
        <button className="text-button" onClick={()=>{setExpanded(false);onGuide();}}>交给 Agent <ArrowUpRight size={14}/></button>
        <button disabled={!onEdit} onClick={()=>{setExpanded(false);onEdit();}}><Pencil size={14}/>编辑</button>
        <button className="icon-button" aria-label={expanded?'收起架构图':'放大架构图'} title={expanded?'收起':'放大'} onClick={()=>setExpanded(!expanded)}>{expanded?<Minimize2 size={17}/>:<Maximize2 size={17}/>}</button>
      </div>
    </header>
    {skills.length ? <div className="architecture-canvas">
      <div className="mermaid-diagram" ref={container} aria-label="技能架构图"/>
      {error&&<p role="alert" className="architecture-render-error">{error}</p>}
      <div className="diagram-controls">
        <button aria-label="缩小" title="缩小" onClick={()=>pan.current?.zoomOut()}><Minus size={16}/></button>
        <button aria-label="适应画布" title="适应画布" onClick={()=>{pan.current?.fit();pan.current?.center();}}><Scan size={16}/></button>
        <button aria-label="放大" title="放大" onClick={()=>pan.current?.zoomIn()}><Plus size={16}/></button>
      </div>
    </div> : <div className="architecture-empty"><Puzzle size={28}/><p>添加技能后在这里呈现。</p></div>}
    <footer className="architecture-caption"><span>每个节点都是一个完整技能</span><span>拖动平移 · 滚轮缩放 · 点选查看</span></footer>
  </section>;
}

export function ArchitectureEditor({mode,skills,Dialog,Field,onSave,onClose}) {
  const initial=useMemo(()=>mode.architecture||{nodes:[],edges:[]},[mode]);
  const [value,setValue]=useState(initial);
  const [selected,setSelected]=useState(skills[0]?.id||'');
  const skill=skills.find(s=>s.id===selected);
  const node=value.nodes?.find(n=>n.skill===selected)||{skill:selected};
  const title=id=>value.nodes?.find(n=>n.skill===id)?.title||skills.find(s=>s.id===id)?.title||id;
  const dirty=JSON.stringify(value)!==JSON.stringify(initial);
  const outgoing=(value.edges||[]).filter(e=>e.from===selected);
  const targets=skills.filter(s=>s.id!==selected&&!outgoing.some(e=>e.to===s.id));
  function close(){if(!dirty||window.confirm('架构有未保存的修改，放弃这些修改？'))onClose();}
  function update(field,text) {
    const next={...node};
    if(text)next[field]=text;else delete next[field];
    setValue(v=>({...v,nodes:[...(v.nodes||[]).filter(n=>n.skill!==selected),next]}));
  }
  function changeEdge(edge,field,text) {
    setValue(v=>({...v,edges:v.edges.map(e=>e===edge?{...e,[field]:text}:e)}));
  }
  function removeEdge(edge) {setValue(v=>({...v,edges:v.edges.filter(e=>e!==edge)}));}
  return <Dialog title="编辑技能架构" onClose={close} wide>
    <div className="architecture-editor">
      <nav aria-label="技能节点">
        <div className="architecture-nav-title">技能<span>{skills.length}</span></div>
        {skills.map(s=><button className={`architecture-entry ${s.id===selected?'active':''}`} key={s.id} onClick={()=>setSelected(s.id)}>
          <Puzzle size={15}/><span>{title(s.id)}</span>
        </button>)}
      </nav>
      <div className="architecture-form">{skill ? <>
        <div className="architecture-form-head"><strong>{skill.title}</strong><span className="muted">完整技能</span></div>
        <Field label="显示名称"><input aria-label="节点名称" maxLength={80} placeholder={skill.title} value={node.title||''} onChange={e=>update('title',e.target.value)}/></Field>
        <Field label="备注"><textarea aria-label="节点备注" rows={2} maxLength={1200} placeholder="可选" value={node.note||''} onChange={e=>update('note',e.target.value)}/></Field>
        <details className="architecture-appearance"><summary>图标与颜色</summary><div>
          <Field label="图标"><input aria-label="节点图标" placeholder="emoji / SVG" value={node.icon||''} onChange={e=>update('icon',e.target.value)}/></Field>
          <Field label="颜色"><input aria-label="节点颜色" type="color" value={node.color||'#007AFF'} onChange={e=>update('color',e.target.value)}/></Field>
        </div></details>
        <section className="architecture-relations">
          <div className="architecture-form-head"><strong>关联到</strong>
            <button className="text-button" disabled={!targets.length} onClick={()=>setValue(v=>({...v,edges:[...(v.edges||[]),{from:selected,to:targets[0].id}]}))}><Plus size={14}/>添加关联</button>
          </div>
          {!outgoing.length&&<p className="muted architecture-no-links">尚无关联</p>}
          {outgoing.map(edge=><div className="architecture-edge-editor" key={edge.to}>
            <ArrowDown size={14}/>
            <div><select aria-label={`关联目标 ${edge.to}`} value={edge.to} onChange={e=>changeEdge(edge,'to',e.target.value)}>
              {skills.filter(s=>s.id===edge.to||targets.some(t=>t.id===s.id)).map(s=><option key={s.id} value={s.id}>{title(s.id)}</option>)}
            </select><input aria-label={`关联名称 ${edge.to}`} placeholder="关系说明（可选）" maxLength={80} value={edge.label||''} onChange={e=>changeEdge(edge,'label',e.target.value)}/></div>
            <button className="icon-button" aria-label={`移除关联 ${edge.to}`} onClick={()=>removeEdge(edge)}><X size={15}/></button>
          </div>)}
        </section>
        {(value.edges||[]).some(e=>e.to===selected)&&<div className="architecture-incoming"><span>来自</span>{value.edges.filter(e=>e.to===selected).map(e=><button key={e.from} onClick={()=>setSelected(e.from)}>{title(e.from)}<ArrowUpRight size={12}/></button>)}</div>}
      </> : <div className="architecture-empty"><p>当前 Mode 尚无技能。</p></div>}</div>
    </div>
    <div className="dialog-actions"><span className="muted">只修改呈现，不改写技能正文</span><button onClick={close}>取消</button>
      <button className="primary" disabled={!dirty} onClick={()=>onSave({operation:'mode.save',id:mode.id,expected:mode.fingerprint,document:mode.document,skills:mode.roots,architecture:value})}>保存架构</button>
    </div>
  </Dialog>;
}
