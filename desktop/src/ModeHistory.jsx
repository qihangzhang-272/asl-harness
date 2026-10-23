import React,{useEffect,useMemo,useRef,useState} from 'react';
import {RotateCcw,MoreHorizontal,PanelRight,X,Pencil,Save} from 'lucide-react';
import EditorPage,{useLeaveGuard} from './EditorPage.jsx';
import MermaidView from './MermaidView.jsx';
import Markdown from './Markdown.jsx';
import {modeDiagramDocument} from './mode-diagrams.mjs';
import {diagramsIn} from './mermaid-document.mjs';
import {renderDiagram} from './mermaid-render.mjs';
import {modeChanges} from './mode-evolution.mjs';
import './mode-history.css';

export default function ModeHistory({workspace,mode,skills,api,readOnly,onClose,onSaved,onContinue}) {
  const [records,setRecords]=useState([]),[next,setNext]=useState(null),[revision,setRevision]=useState('current');
  const [status,setStatus]=useState('loading'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [detail,setDetail]=useState(null),[previous,setPrevious]=useState(null),[title,setTitle]=useState('');
  const [drawing,setDrawing]=useState(null),[notice,setNotice]=useState('');
  const [listing,setListing]=useState(false),[rendering,setRendering]=useState(false),[retry,setRetry]=useState(0);
  const [traceOpen,setTraceOpen]=useState(()=>window.innerWidth>1100);
  const [editingNote,setEditingNote]=useState(false),[noteDraft,setNoteDraft]=useState(''),[noteError,setNoteError]=useState('');
  const [noteTitles,setNoteTitles]=useState({}),[scrubbing,setScrubbing]=useState(false);
  const timeline=useRef(null);
  const timelineSelection=useRef('current');
  const details=useRef(new Map()),drawings=useRef(new Map()),version=useRef(0);
  const live=useRef(true),listVersion=useRef(0),listBusy=useRef(false),renderJob=useRef(null);
  const leave=useLeaveGuard(editingNote&&noteDraft!==(detail?.note?.document||''),busy);
  const current=useMemo(()=>({snapshot:{document:mode.document,skills:mode.roots||mode.skills,capabilities:mode.capabilities,architecture:mode.architecture}}),[mode]);
  const entries=useMemo(()=>[...records].reverse().concat({revision:'current',title:'当前结构'}),[records]);
  const index=Math.max(0,entries.findIndex(entry=>entry.revision===revision));
  const selected=entries[index];
  const label=id=>skills.find(skill=>skill.id===id)?.title||id;
  const changes=modeChanges(previous?.snapshot,detail?.snapshot);
  const recordTitle=entry=>{
    if(entry.revision==='current')return '当前结构';
    if(noteTitles[entry.revision])return noteTitles[entry.revision];
    let title=entry.title?.replace(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}\s*[｜|]\s*/,'')||'保存的结构';
    if(title.endsWith(mode.id))title=title.slice(0,-mode.id.length).replace(/[:：]\s*$/,'').trim();
    return title||'保存的结构';
  };
  async function readRecord(key) {
    if(key==='current')return current;
    const cache=details.current;
    if(!cache.has(key)){
      const request=api('run','history',{workspace,mode:mode.id,revision:key}).catch(error=>{if(cache.get(key)===request)cache.delete(key);throw error;});
      cache.set(key,request);
      if(cache.size>60)cache.delete(cache.keys().next().value);
    }
    return cache.get(key);
  }
  function graphsFor(snapshot) {
    if(!snapshot)return [];
    const historicalSkills=[...skills,...snapshot.skills.filter(id=>!skills.some(skill=>skill.id===id)).map(id=>({id,title:id,requires:[]}))];
    return diagramsIn(modeDiagramDocument({...mode,...snapshot,roots:snapshot.skills},historicalSkills));
  }
  async function render(source,ticket=version.current) {
    if(!drawings.current.has(source)){
      while(renderJob.current){
        await renderJob.current.catch(()=>{});
        if(!live.current||version.current!==ticket)return null;
      }
      if(!live.current||version.current!==ticket)return null;
      const request=renderDiagram(source).catch(error=>{drawings.current.delete(source);throw error;});
      renderJob.current=request;
      request.finally(()=>{if(renderJob.current===request)renderJob.current=null;}).catch(()=>{});
      drawings.current.set(source,request);
      if(drawings.current.size>12)drawings.current.delete(drawings.current.keys().next().value);
    }
    return {source,svg:await drawings.current.get(source)};
  }
  async function load(more=false) {
    if(more&&listBusy.current)return;
    const ticket=++listVersion.current;listBusy.current=true;setListing(true);setError('');
    if(!more)setStatus('loading');
    try{
      const result=await api('run','history',{workspace,mode:mode.id,limit:40,offset:more?next:0});
      if(!live.current||listVersion.current!==ticket)return;
      setRecords(old=>more?[...old,...result.entries]:result.entries);setNext(result.nextOffset);setStatus(result.status);
    }catch(error){if(live.current&&listVersion.current===ticket){setError(error.message);setStatus('error');}}
    finally{if(live.current&&listVersion.current===ticket){listBusy.current=false;setListing(false);}}
  }
  useEffect(()=>{
    live.current=true;details.current=new Map();setRecords([]);setNext(null);setRevision('current');setDetail(null);setPrevious(null);setDrawing(null);setTitle('');setNotice('');setNoteTitles({});
    return()=>{live.current=false;version.current++;listVersion.current++;};
  },[workspace,mode.id]);
  useEffect(()=>{load();},[workspace,mode.id,mode.fingerprint]);
  useEffect(()=>{
    const ticket=++version.current;setError('');setRendering(true);setPrevious(null);
    const key=selected.revision,prior=entries[index-1]?.revision;
    readRecord(key).then(async result=>{
      if(version.current!==ticket)return;
      const graphs=graphsFor(result.snapshot),graph=graphs.find(graph=>graph.title===title)||graphs[0];
      const rendered=graph?await render(graph.source,ticket):null;
      if(version.current!==ticket)return;
      setDetail({...result,revision:key});setDrawing(rendered);setPrevious(null);
      setNoteTitles(old=>({...old,[key]:result.note?.document.match(/^#\s+([^\r\n]+)/)?.[1]||''}));
      if(prior)readRecord(prior).then(value=>{if(version.current===ticket)setPrevious(value);}).catch(()=>{});
      // Prefetch records only; SVG rendering stays single-flight and follows the latest selection.
      for(const entry of [entries[index-1],entries[index+1]].filter(Boolean))readRecord(entry.revision).catch(()=>{});
    }).catch(error=>{if(version.current===ticket)setError(error.message);})
      .finally(()=>{if(version.current===ticket)setRendering(false);});
    return()=>{version.current++;};
  },[revision,title,entries,current,retry]);
  const ready=!rendering&&detail?.revision===selected.revision&&!error;
  const missing=detail?.snapshot.skills.filter(id=>!skills.some(skill=>skill.id===id))||[];
  useEffect(()=>{
    const viewport=timeline.current;
    const scroll=event=>{
      if(event.ctrlKey||Math.abs(event.deltaX)>=Math.abs(event.deltaY)||viewport.scrollWidth<=viewport.clientWidth)return;
      event.preventDefault();viewport.scrollLeft+=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?viewport.clientWidth:1);
    };
    viewport.addEventListener('wheel',scroll,{passive:false});
    return()=>viewport.removeEventListener('wheel',scroll);
  },[]);
  useEffect(()=>{
    const viewport=timeline.current,node=viewport?.querySelector('[aria-current="step"]');
    if(!node||scrubbing)return;
    const reveal=behavior=>viewport.scrollTo({left:node.offsetLeft-(viewport.clientWidth-node.offsetWidth)/2,behavior});
    reveal(timelineSelection.current===selected.revision||window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth');
    timelineSelection.current=selected.revision;
    let width=viewport.clientWidth;
    const observer=new ResizeObserver(()=>{if(viewport.clientWidth!==width){width=viewport.clientWidth;reveal('instant');}});
    observer.observe(viewport);return()=>observer.disconnect();
  },[index,entries.length,scrubbing]);
  function seek(nextIndex){setRevision(entries[nextIndex].revision);setNotice('');setNoteError('');}
  function closeTrace(){leave(()=>{setEditingNote(false);setTraceOpen(false);});}
  async function saveNote(){
    if(!ready||busy||selected.revision==='current'||!noteDraft.trim())return;
    setBusy(true);setNoteError('');setNotice('');
    try{
      const result=await api('run','historyNote',{workspace,revision:selected.revision,apply:true,
        request:{document:noteDraft,expected:detail.note?.fingerprint||null}});
      if(result.canceled)return;
      const next={...detail,note:{document:result.document,fingerprint:result.fingerprint}};
      details.current.set(selected.revision,Promise.resolve(next));setDetail(next);
      setNoteTitles(old=>({...old,[selected.revision]:result.document.match(/^#\s+([^\r\n]+)/)?.[1]||''}));
      setNoteDraft(result.document);setEditingNote(false);setNotice('说明已保存');
    }catch(error){setNoteError(error.diagnostic||error.message);}finally{setBusy(false);}
  }
  async function restore() {
    if(!ready||busy||readOnly||missing.length||selected.revision==='current')return;
    setBusy(true);setError('');
    try{
      const values={workspace,mode:mode.id,revision:selected.revision,expected:mode.fingerprint};
      await api('run','restoreHistory',values);
      const result=await api('run','restoreHistory',{...values,apply:true});
      if(result.canceled)return;
      setNotice('已恢复，后来的记录仍保留。');setRevision('current');
      try{await onSaved();await load();}catch{setError('已恢复，重新打开后查看最新结构。');}
    }catch(error){setError(error.message);}finally{setBusy(false);}
  }
  const graphs=graphsFor(detail?.snapshot);
  const graph=graphs.find(graph=>graph.title===title)||graphs[0];
  const date=selected.date?new Date(selected.date).toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'现在';
  const noteHeading=ready&&detail.note?.document.match(/^#\s+([^\r\n]+)(?:\r?\n|$)/);
  const selectedTitle=noteHeading?noteHeading[1]:recordTitle(selected);
  return <EditorPage title={`${mode.title} · 演变`} onClose={()=>leave(onClose)}>
    <div className="mode-history" aria-busy={busy}>
      <div className="evolution-heading">
        <div className="evolution-graphs" role="tablist" aria-label="架构视图">{graphs.map((item,i)=><button key={i} role="tab" aria-selected={item===graph} disabled={busy||editingNote} onClick={()=>setTitle(item.title)}>{item.title}</button>)}</div>
        <button className="trace-toggle" aria-expanded={traceOpen} aria-controls="history-trace" disabled={busy} onClick={()=>traceOpen?closeTrace():setTraceOpen(true)}><PanelRight size={16}/>变化说明</button>
        <details className="evolution-actions"><summary aria-label="记录操作"><MoreHorizontal size={19}/></summary><div>
          <button disabled={!ready||busy||readOnly||!!missing.length||editingNote} onClick={()=>onContinue({...mode,...detail.snapshot,roots:detail.snapshot.skills})}>从这里继续编辑</button>
          <button disabled={!ready||busy||readOnly||!!missing.length||revision==='current'||editingNote} onClick={restore}><RotateCcw size={14}/>恢复这个版本</button>
        </div></details>
      </div>
      {error&&<div className="evolution-error" role="alert">这次内容未能读取或更新。<button disabled={busy||listing} onClick={()=>{details.current.delete(revision);setDetail(null);setRetry(value=>value+1);load();}}>重试</button><details><summary>详情</summary>{error}</details></div>}
      <div className="evolution-workbench">
      <div className="evolution-canvas" data-revision={ready?selected.revision:''}>
        {drawing?<MermaidView source={drawing.source} renderedDiagram={drawing} evolutionGroup={graph?.title} evolve compact/>:<div className="evolution-empty">{ready?'这个版本还没有架构图':status==='loading'?'正在读取记录…':'选择记录查看结构'}</div>}
        {!ready&&!error&&drawing&&<span className="evolution-reading" role="status">正在读取…</span>}
        {drawing&&<span className="evolution-legend">蓝色节点：本次切换的新增或文字变化</span>}
      </div>
      {traceOpen&&<aside className="history-trace" id="history-trace" aria-label="所选版本的变化说明" data-revision={ready?selected.revision:''}>
        <header><span>变化说明</span><button aria-label="关闭变化说明" disabled={busy} onClick={closeTrace}><X size={16}/></button></header>
        {!ready?<div className="trace-loading" role="status"><p>{error?'记录暂时无法读取。':'正在读取所选版本…'}</p><i/><i/><i/></div>:<>
          <h2>{selectedTitle}</h2>
          <div className="trace-meta"><time>{date}</time><span>{selected.revision==='current'?'当前结构':selected.source==='save'?'本地保存':'仓库版本'}</span></div>
          {selected.revision==='current'?<p className="trace-empty">选择下方的已保存版本，查看变化和修改依据。</p>:<>
            <section className="trace-changes" aria-label="本次结构变化">
              {!!changes.added.length&&<p><span>加入</span>{changes.added.map(id=><b key={id}>{label(id)}</b>)}</p>}
              {!!changes.removed.length&&<p><span>移出</span>{changes.removed.map(id=><b key={id}>{label(id)}</b>)}</p>}
              {!changes.added.length&&!changes.removed.length&&<p>{previous?(changes.structure?'组织内容有调整':'成员与组织内容保持一致'):index===0?'当前已读取范围的起点':'上一版的对照暂未取得'}</p>}
            </section>
            {editingNote?<form onSubmit={event=>{event.preventDefault();saveNote();}}>
              <label htmlFor="history-note">变更说明</label><textarea id="history-note" aria-label="变更说明" autoFocus maxLength={20000} readOnly={busy} value={noteDraft} onChange={event=>setNoteDraft(event.target.value)} placeholder="记录明确的修改原因、相关材料或核对结果。"/>
              <div className="trace-note-actions"><button type="button" disabled={busy} onClick={()=>leave(()=>{setEditingNote(false);setNoteError('');})}>取消编辑</button><button className="primary" disabled={busy||!noteDraft.trim()}><Save size={14}/>保存说明</button></div>
            </form>:<section className="trace-explanation">
              {detail.note?.document?<Markdown text={noteHeading?detail.note.document.slice(noteHeading[0].length):detail.note.document}/>:<p className="trace-empty">这次变更还没有补充依据。</p>}
              {!readOnly&&<button disabled={busy} onClick={()=>{setNoteDraft(detail.note?.document||'');setEditingNote(true);setNoteError('');}}><Pencil size={14}/>{detail.note?'编辑说明':'补充说明'}</button>}
            </section>}
            {noteError&&<div role="alert" className="trace-note-error"><p>说明未保存，草稿已保留。</p><button disabled={busy} onClick={()=>leave(()=>{details.current.delete(revision);setEditingNote(false);setNoteError('');setRetry(value=>value+1);})}>重新读取说明</button><details><summary>查看原因</summary><pre>{noteError}</pre></details></div>}
            <p className="trace-boundary">回看的是模式组织；技能正文保持当前内容。任务效果以实际记录为准。</p>
          </>}
        </>}
      </aside>}
      </div>
      <footer className="evolution-dock">
        <div className="evolution-caption"><div className="evolution-selection"><strong>{selectedTitle}</strong><span className="evolution-summary" data-notice={!!notice} role="status">
          {notice||(!ready?'正在读取…':selected.revision==='current'?'当前工作区':changes.added.length||changes.removed.length?`加入 ${changes.added.length} · 移出 ${changes.removed.length}`:changes.structure?'调整结构':date)}
        </span></div>
        <div className="evolution-navigation">
          <span className="evolution-position" aria-label={`第 ${index+1} 个，共 ${entries.length} 个版本`}>{index+1}<span> / {entries.length}</span></span>
          <span className="evolution-key-hint"><kbd>←</kbd><kbd>→</kbd> 逐版切换</span>
        </div>
        </div>
        <div className="evolution-timeline" ref={timeline}>
          <div className="evolution-sequence" style={{'--count':entries.length,'--progress':index/Math.max(1,entries.length-1)}} data-scrubbing={scrubbing}>
            <div className="evolution-track" aria-disabled={busy||editingNote||entries.length<2}>
              <div className="evolution-rail" aria-hidden="true"><i/><b/></div>
              <input type="range" aria-label="演进时间轴" aria-valuetext={`${date} ${selectedTitle}`} min="0" max={entries.length-1} step="1" value={index} disabled={busy||editingNote||entries.length<2}
                onPointerDown={()=>setScrubbing(true)} onPointerUp={()=>setScrubbing(false)} onPointerCancel={()=>setScrubbing(false)} onChange={event=>seek(Number(event.target.value))}/>
            </div>
            <nav className="evolution-events" aria-label="版本记录">{entries.map((entry,i)=><button key={entry.revision} data-revision={entry.revision} data-current={entry.revision==='current'} aria-current={entry.revision===selected.revision?'step':undefined} disabled={busy||editingNote} onClick={()=>seek(i)} title={recordTitle(entry)}>
              <i aria-hidden="true"/><span>{recordTitle(entry)}</span><time>{entry.date?new Date(entry.date).toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'现在 · 当前工作区'}</time>
            </button>)}</nav>
          </div>
        </div>
        <div className="evolution-context">
          <span>滚动浏览 · 拖动刻度或点击版本选择</span>
          {status==='not-repository'?<span>这个库还没有版本记录。</span>:<>
            {next!==null&&next!==undefined&&<button disabled={busy||listing} onClick={()=>load(true)}>更早记录</button>}
            {ready&&!!missing.length&&<span>请先补齐：{missing.map(label).join('、')}。</span>}
          </>}
        </div>
      </footer>
    </div>
  </EditorPage>;
}
