import React, {useEffect, useMemo, useState} from 'react';
import {Box, Layers3, Puzzle, Search, Send, Palette, PenLine, ChartNoAxesCombined, PanelsTopLeft} from 'lucide-react';
import MermaidView from './MermaidView.jsx';
import MermaidEdit from './MermaidEdit.jsx';
import {modeDiagramDocument,sharedDiagram,skillNodes,diagramBlock} from './mode-diagrams.mjs';
import {diagramForMode} from './presentation.mjs';
import {diagramsIn,replaceDiagram,appendDiagramTemplate} from './mermaid-document.mjs';
import './graph-editor.css';

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

// Render authored Mermaid verbatim; materialize existing v0.4 relations only on an explicit edit.
export function ArchitectureMap({mode,skills,onSkill,onEdit,onSaveDocument,initialScope='',availableSkills=skills,compact=false,selectedId}) {
  const [expanded,setExpanded]=useState(false),[chosen,setChosen]=useState(initialScope);
  const document=useMemo(()=>modeDiagramDocument(mode,skills),[mode,skills]);
  const authored=useMemo(()=>diagramsIn(document||''),[document]);
  const paradigms=mode.architecture?.paradigms||[];
  const tabs=authored.length?authored.map((d,i)=>({id:authored.findIndex(other=>other.title===d.title)===i?(paradigms.find(p=>p.title===d.title)?.id||(d.title==='通用能力'?'shared':`document-${i}`)):`document-${i}`,title:d.title})):paradigms.length?paradigms:mode.architecture?.edges?.length?[{id:'legacy',title:'工作架构'}]:[];
  const scopeId=tabs.some(p=>p.id===chosen)||chosen==='shared'?chosen:tabs[0]?.id||'shared';
  const scope=paradigms.find(p=>p.id===scopeId);
  const graph=useMemo(()=>scopeId==='shared'?null:diagramForMode(mode,skills,scopeId),[mode,skills,scopeId]);
  const documentDiagram=authored[tabs.findIndex(p=>p.id===scopeId)];
  const source=documentDiagram?.source||(scopeId==='shared'?sharedDiagram(mode,skills):graph?.source);
  const nodes=documentDiagram||scopeId==='shared'?skillNodes(skills.filter(s=>mode.skills.includes(s.id)),mode.architecture?.nodes):graph?.nodes;
  const placement=scope?.id||(scopeId==='shared'?'shared':null);
  const candidates=skillNodes(placement?availableSkills:skills,mode.architecture?.nodes);
  useEffect(()=>{
    const escape=event=>{if(event.key==='Escape')setExpanded(false);};
    window.addEventListener('keydown',escape);
    return ()=>window.removeEventListener('keydown',escape);
  },[]);
  function edit(){setExpanded(false);onEdit?.(documentDiagram?.title||scope?.title||'通用能力');}
  function selectSkill(skill){setExpanded(false);onSkill?.(skill);}
  async function createDiagram(type){
    const next=appendDiagramTemplate(document||mode.document||'',type);
    await onSaveDocument(mode,next);
    setChosen(`document-${authored.length}`);
  }
  return <section className={`architecture-section ${expanded?'is-expanded':''}`}>
    {!initialScope&&<div className="paradigm-tabs" role="tablist" aria-label="工作范式">
      {tabs.map(p=><button role="tab" aria-selected={scopeId===p.id} className={scopeId===p.id?'active':''} key={p.id} onClick={()=>setChosen(p.id)}>{p.title}</button>)}
      {!!mode.architecture?.shared?.length&&!tabs.some(p=>p.id==='shared')&&<button role="tab" aria-selected={scopeId==='shared'} className={scopeId==='shared'?'active':''} onClick={()=>setChosen('shared')}>通用能力</button>}
    </div>}
    {documentDiagram||graph?.nodes.length||scopeId==='shared'&&mode.architecture?.shared?.length?(onSaveDocument?<MermaidEdit key={scopeId} source={source} nodes={nodes} candidates={candidates} compact={compact} selectedId={selectedId} onNode={selectSkill} onSource={edit} onCreate={createDiagram} onExpand={()=>setExpanded(!expanded)} expanded={expanded} onChange={(next,skill)=>onSaveDocument(mode,documentDiagram?replaceDiagram(document,tabs.findIndex(p=>p.id===scopeId),next):document+diagramBlock('通用能力',next),{skill,placement})}/>:<MermaidView key={scopeId} source={source} nodes={nodes} onNode={selectSkill} compact={compact} selectedId={selectedId} onExpand={()=>setExpanded(!expanded)} expanded={expanded}/>)
      :onSaveDocument?<MermaidEdit empty onCreate={createDiagram} onSource={edit}/>
      :<div className="architecture-empty"><Puzzle size={28}/><p>{skills.length?'尚未定义工作范式':'尚未添加技能'}</p>{onEdit&&<button onClick={edit}>编辑工作范式</button>}</div>}
  </section>;
}
