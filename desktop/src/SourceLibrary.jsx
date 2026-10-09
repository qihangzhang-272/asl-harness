import React, {useEffect, useState} from 'react';
import {Cloud, FolderOpen, ChevronRight, Layers3, ArrowLeft, Plus, RotateCw, Download, ArrowUpRight,Search,Puzzle,BookOpen} from 'lucide-react';
import {ArchitectureMap} from './Architecture.jsx';
import Markdown from './Markdown.jsx';
import RepositoryMarkdown from './RepositoryMarkdown.jsx';
import {shortText,repositoryKey,repositorySkillKey} from './presentation.mjs';
import {useViewState} from './useViewState.jsx';

const name = value => value.split(/[\\/]/).filter(Boolean).pop();
export function SourceTree({groups, repositories, workspace, mode, cloud, onLocal, onCloud, onNavigate, onContext,onLocalContext,onRoot}) {
  const linkedRoot=url=>{
    const matches=groups.filter(group=>group.repository&&repositoryKey(group.repository)===repositoryKey(url));
    return matches.length===1?matches[0].root:null;
  };
  const renderCloud=url=><div className="cloud-source" key={url}>
      <button className={`source-heading ${cloud?.url===url?'selected':''}`} onClick={()=>onCloud(url)} onContextMenu={event=>{event.preventDefault();onContext?.(url);}} title={url}><ChevronRight size={14} className={cloud?.url===url?'expanded':''}/><Cloud size={16}/><span>{linkedRoot(url)?'GitHub 版本':name(url)}</span>{!linkedRoot(url)&&<small>GitHub</small>}</button>
      {cloud?.url===url && <div className="source-children"><button className={!cloud.mode&&cloud.view!=='skills'?'selected':''} onClick={()=>onNavigate({mode:null,view:'overview',skill:null})}><BookOpen size={14}/><span>仓库介绍</span></button><button className={!cloud.mode&&cloud.view==='skills'?'selected':''} onClick={()=>onNavigate({mode:null,view:'skills',skill:null})}><Puzzle size={14}/><span>技能</span><small>{cloud.report?.skills.length??'…'}</small></button>{cloud.report?.modes.map(item=><button title={item.title} className={cloud.mode===item.id?'selected':''} key={item.id} onClick={()=>onCloud(url,item.id)}><Layers3 size={14}/><span>{item.title}</span></button>)}</div>}
    </div>;
  const unlinked=repositories.filter(url=>!linkedRoot(url));
  const renderLocal=({root,modes})=><details key={root} open={root===workspace||!!cloud&&linkedRoot(cloud.url)===root}>
      <summary title={root} onContextMenu={event=>{event.preventDefault();onLocalContext?.(root);}}><ChevronRight size={14}/><FolderOpen size={16}/><span onClick={event=>{event.preventDefault();onRoot?.(root);}}>{name(root)}</span><small>{modes.length}</small></summary>
      <div className="source-children">{modes.map(item=><button key={item.id} title={`${item.title}\n${root}`} className={!cloud&&root===workspace&&mode===item.id?'selected':''} onClick={()=>onLocal(item)} onContextMenu={event=>{event.preventDefault();onLocalContext?.(root,item.id);}}><Layers3 size={14}/><span>{item.title}</span></button>)}
        {repositories.filter(url=>linkedRoot(url)===root).map(renderCloud)}
      </div>
    </details>;
  const cloudLimit=Math.max(0,50-groups.length);
  const extra=groups.slice(50).length+unlinked.slice(cloudLimit).length;
  return <nav className="source-tree" aria-label="模式库">
    <div className="sidebar-label">本地工作库</div>
    {groups.slice(0,50).map(renderLocal)}
    {!!unlinked.length&&<div className="sidebar-label">云端来源</div>}
    {unlinked.slice(0,cloudLimit).map(renderCloud)}
    {!!extra&&<details className="source-overflow" open={groups.slice(50).some(g=>g.root===workspace)||unlinked.slice(cloudLimit).includes(cloud?.url)}><summary>其他连接<small>{extra}</small></summary>{groups.slice(50).map(renderLocal)}{unlinked.slice(cloudLimit).map(renderCloud)}</details>}
  </nav>;
}

export default function SourceLibrary({source, onNavigate, onUse, onSave, onRefresh, onOrganize, localModes=[], busy}) {
  const [document, setDocument] = useState(''),[error,setError]=useState(''),[retry,setRetry]=useState(0),[reading,setReading]=useState(false);
  const [query,setQuery]=useViewState(`repository-query:${source.url}:${source.mode||''}`,'');
  const [limit,setLimit]=useViewState(`repository-limit:${source.url}:${source.mode||''}`,24);
  const report=source.report;
  const skill=report?.skills.find(s=>repositorySkillKey(s)===source.skill||s.id===source.skill);
  const mode=report?.modes.find(m=>m.id===source.mode);
  const skills=mode?(report.catalog?.skills||[]).filter(s=>mode.skills.includes(s.id)):report?.skills||[];
  const visible=skills.filter(s=>`${s.title} ${s.id} ${s.description}`.toLowerCase().includes(query.toLowerCase()));
  useEffect(()=>{
    let active=true;
    setDocument('');setError('');
    setReading(!!skill);
    if(skill)window.asl.sourceDocument(skill.source).then(r=>{if(active){if(r.ok)setDocument(r.value);else setError(r.error);}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setReading(false);});
    return ()=>{active=false;};
  },[skill?.source,retry]);
  const showSkills=()=>onNavigate({view:'skills',skill:null});
  function organize(event,item){event.currentTarget.closest('details').open=false;onOrganize(item,skill);}
  return <section className="source-library">
    <div className="page-heading"><div><div className="source-breadcrumb"><Cloud size={15}/>{source.url.replace('https://github.com/','')}</div><h1>{skill?.title||mode?.title || name(source.url)}</h1></div>
      <div className="heading-actions"><button disabled={busy||source.loading} aria-label="刷新云端模式库" onClick={onRefresh}><RotateCw size={16} className={source.loading?'spin':''}/></button>{onOrganize&&skills.length>0&&<details className="repository-organize"><summary>{skill?'加入模式':'组织技能'}<Plus size={16}/></summary><div><button disabled={busy} onClick={event=>organize(event,null)}><Plus size={15}/>新建模式</button>{localModes.map(item=><button key={item.id} disabled={busy} onClick={event=>organize(event,item)}><Layers3 size={15}/>{item.title}</button>)}</div></details>}{!skill&&mode?<><button disabled={busy} onClick={()=>onSave(mode)}><Download size={16}/>保存到本地</button><button className="primary" disabled={busy} onClick={()=>onUse(mode)}>在 Agent 使用<ArrowUpRight size={16}/></button></>:null}</div>
    </div>
    {source.loading&&!report&&<div className="source-loading" role="status"><span className="loading-line"/><span className="loading-line"/><span className="loading-line"/>正在读取仓库…</div>}
    {!report&&source.readme&&<div className="repository-readme"><RepositoryMarkdown key={source.url} document={source.readme}/></div>}
    {source.error&&<div className="inline-note" role="alert">{source.error}<button onClick={onRefresh}>重试</button></div>}
    {report?.cacheStatus==='stale'?<div className="inline-note" role="status">更新未完成，保留上次内容。<button onClick={onRefresh}>重试</button></div>:report?.cacheStatus==='cached'?<p className="muted">上次读取 · {new Date(report.checkedAt).toLocaleString()}</p>:null}
    {report&&<>{skill?<><button onClick={showSkills}><ArrowLeft size={16}/>返回技能</button>{error?<div role="alert"><p>{error}</p><button onClick={()=>setRetry(n=>n+1)}>重新读取</button></div>:reading?<p role="status">正在读取技能…</p>:<RepositoryMarkdown key={skill.source} document={{text:document,url:`${skill.origin?.replace('/tree/','/blob/')||source.url}/SKILL.md`}} report={report}/>}</>:<>
      <div className="tabs repository-tabs"><button className={source.view!=='skills'?'active':''} onClick={()=>onNavigate({view:'overview',skill:null})}>{mode?'逻辑架构':'仓库介绍'}</button><button className={source.view==='skills'?'active':''} onClick={showSkills}>查看 {skills.length} 个技能</button></div>
      {source.view==='skills'?<><div className="search large"><Search size={17}/><input aria-label="搜索仓库技能" placeholder="搜索技能" value={query} onChange={e=>{setQuery(e.target.value);setLimit(24);}}/></div><div className="repository-skill-grid">{visible.slice(0,limit).map(s=><button className="repository-skill-card" key={repositorySkillKey(s)} onClick={()=>onNavigate({skill:repositorySkillKey(s)})}><span className="source-mode-icon"><Puzzle size={23}/></span><div><h2>{s.title||s.id}</h2><p>{shortText(s.description,130)}</p></div><ChevronRight size={18}/></button>)}</div>{!visible.length&&<p className="muted">没有匹配的技能</p>}{visible.length>limit&&<button onClick={()=>setLimit(limit+24)}>显示更多</button>}</>:mode?<><ArchitectureMap key={`${source.url}:${mode.id}`} mode={mode} skills={skills} onSkill={s=>onNavigate({view:'skills',skill:s.id})}/><details className="mode-method" key={mode.id}><summary>模式说明</summary><Markdown text={mode.document}/></details></>:<>
        {!!report.modes.length&&<div className="source-mode-grid">{report.modes.map(m=><button className="source-mode-card" key={m.id} onClick={()=>onNavigate({mode:m.id,view:'overview',skill:null})}><span className="source-mode-icon"><Layers3 size={24}/></span><h2>{m.title}</h2><footer><span>{m.skills.length} 个技能</span><ChevronRight size={17}/></footer></button>)}</div>}
        {report.readme?<div className="repository-readme"><RepositoryMarkdown key={`${source.url}:${report.commit}`} document={report.readme} report={report}/></div>:<div className="empty-state"><p>仓库未提供 README</p><button onClick={()=>window.asl.external(source.url)}>打开 GitHub<ArrowUpRight size={15}/></button></div>}
      </>}
    </>}</>}
  </section>;
}
