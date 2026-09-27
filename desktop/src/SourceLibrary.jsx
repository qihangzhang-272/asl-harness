import React, {useEffect, useState} from 'react';
import {Cloud, FolderOpen, ChevronRight, Layers3, ArrowLeft, Plus, RotateCw, Download, ArrowUpRight} from 'lucide-react';
import {ArchitectureMap} from './Architecture.jsx';
import Markdown from './Markdown.jsx';
import {shortText} from './presentation.mjs';

const name = value => value.split(/[\\/]/).filter(Boolean).pop();
export function SourceTree({local, repositories, workspace, mode, cloud, onLocal, onCloud, onAdd}) {
  const groups = new Map();
  for (const item of local || []) {
    if (!groups.has(item.workspace)) groups.set(item.workspace, []);
    groups.get(item.workspace).push(item);
  }
  return <nav className="source-tree" aria-label="模式库">
    <div className="sidebar-label">模式库<button className="icon-button" aria-label="连接模式库" onClick={onAdd}><Plus size={16}/></button></div>
    {[...groups].map(([root, modes]) => <details key={root} open={root === workspace}>
      <summary title={root}><ChevronRight size={14}/><FolderOpen size={16}/><span>{name(root)}</span><small>{modes.length}</small></summary>
      <div className="source-children">{modes.map(item => <button key={item.id} title={item.title} className={!cloud && root === workspace && mode === item.id ? 'selected' : ''} onClick={()=>onLocal(item)}><Layers3 size={14}/><span>{item.title}</span></button>)}</div>
    </details>)}
    {repositories.map(url => <div className="cloud-source" key={url}>
      <button className={`source-heading ${cloud?.url===url?'selected':''}`} onClick={()=>onCloud(url)} title={url}><ChevronRight size={14} className={cloud?.url===url?'expanded':''}/><Cloud size={16}/><span>{name(url)}</span></button>
      {cloud?.url===url && <div className="source-children">{cloud.report?.modes.map(item=><button title={item.title} className={cloud.mode===item.id?'selected':''} key={item.id} onClick={()=>onCloud(url,item.id)}><Layers3 size={14}/><span>{item.title}</span></button>)}</div>}
    </div>)}
  </nav>;
}

export default function SourceLibrary({source, onSelect, onUse, onSave, onRefresh, onSkills, busy}) {
  const [skill, setSkill] = useState(null);
  const [document, setDocument] = useState('');
  useEffect(()=>{setSkill(null);setDocument('');},[source.url,source.mode]);
  useEffect(()=>{
    let active=true;
    setDocument('');
    const file=source.report?.skills.find(s=>s.id===skill?.id);
    if(file)window.asl.sourceDocument(file.source).then(r=>{if(active)setDocument(r.ok?r.value:r.error);}).catch(e=>{if(active)setDocument('无法读取技能：'+e.message);});
    return ()=>{active=false;};
  },[skill]);
  const report = source.report;
  const mode = report?.modes.find(m=>m.id===source.mode);
  const skills = mode?.skills.map(id=>report.catalog.skills.find(s=>s.id===id)).filter(Boolean) || [];
  return <section className="source-library">
    <div className="page-heading"><div><div className="source-breadcrumb"><Cloud size={15}/>{source.url.replace('https://github.com/','')}</div><h1>{mode?.title || name(source.url)}</h1></div>
      <div className="heading-actions"><button disabled={busy} aria-label="刷新云端模式库" onClick={onRefresh}><RotateCw size={16}/></button>{mode&&<><button disabled={busy} onClick={()=>onSave(mode)}><Download size={16}/>保存到本地</button><button className="primary" disabled={busy} onClick={()=>onUse(mode)}>在 Agent 使用<ArrowUpRight size={16}/></button></>}</div>
    </div>
    {source.loading&&<div className="source-loading" role="status"><span className="loading-line"/><span className="loading-line"/><span className="loading-line"/>正在读取模式库…</div>}
    {source.error&&<div className="inline-note" role="alert">{source.error}<button onClick={onRefresh}>重试</button></div>}
    {report&&!mode&&!source.loading&&<div className="source-mode-grid">{report.modes.map(m=><button className="source-mode-card" key={m.id} onClick={()=>{setSkill(null);onSelect(m.id);}}><span className="source-mode-icon"><Layers3 size={24}/></span><h2>{m.title}</h2><p>{shortText(m.document.split('\n').find(l=>l.trim()&&!l.startsWith('#')),115)}</p><footer><span>{m.skills.length} 个技能</span><ChevronRight size={17}/></footer></button>)}</div>}
    {report&&!report.modes.length&&<div className="empty-state"><h2>{report.modeError?'模式定义需要修正':'这个仓库没有工作模式'}</h2>{report.modeError&&<p>{report.modeError}</p>}<button onClick={onSkills}>查看 {report.skills.length} 个技能<ChevronRight size={16}/></button></div>}
    {mode&&!source.loading&&<>
      <button className="text-button" onClick={()=>{setSkill(null);onSelect(null);}}><ArrowLeft size={16}/>全部模式</button>
      <ArchitectureMap key={mode.id} mode={mode} skills={skills} onSkill={setSkill}/>
      {skill&&<section className="source-skill-preview"><div className="field-heading"><h2>{skill.title}</h2><button onClick={()=>setSkill(null)}>收起</button></div><Markdown text={document || skill.description || ''}/></section>}
      <details className="source-mode-notes"><summary>模式说明</summary><Markdown text={mode.document}/></details>
    </>}
  </section>;
}
