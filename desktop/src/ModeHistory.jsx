import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Play,Pause,RotateCcw,ChevronLeft,ChevronRight,MoreHorizontal} from 'lucide-react';
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
  const [drawing,setDrawing]=useState(null),[playing,setPlaying]=useState(false),[notice,setNotice]=useState('');
  const [listing,setListing]=useState(false),[rendering,setRendering]=useState(false),[retry,setRetry]=useState(0);
  const details=useRef(new Map()),drawings=useRef(new Map()),version=useRef(0);
  const live=useRef(true),listVersion=useRef(0),listBusy=useRef(false),renderJob=useRef(null);
  const leave=useLeaveGuard(false,busy);
  const current=useMemo(()=>({snapshot:{document:mode.document,skills:mode.roots||mode.skills,capabilities:mode.capabilities,architecture:mode.architecture}}),[mode]);
  const entries=useMemo(()=>[...records].reverse().concat({revision:'current',title:'当前结构'}),[records]);
  const index=Math.max(0,entries.findIndex(entry=>entry.revision===revision));
  const selected=entries[index];
  const label=id=>skills.find(skill=>skill.id===id)?.title||id;
  const changes=modeChanges(previous?.snapshot,detail?.snapshot);
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
    live.current=true;details.current=new Map();setRecords([]);setNext(null);setRevision('current');setDetail(null);setPrevious(null);setDrawing(null);setTitle('');setPlaying(false);setNotice('');
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
      if(prior)readRecord(prior).then(value=>{if(version.current===ticket)setPrevious(value);}).catch(()=>{});
      // Prefetch records only; SVG rendering stays single-flight and follows the latest selection.
      for(const entry of [entries[index-1],entries[index+1]].filter(Boolean))readRecord(entry.revision).catch(()=>{});
    }).catch(error=>{if(version.current===ticket){setError(error.message);setPlaying(false);}})
      .finally(()=>{if(version.current===ticket)setRendering(false);});
    return()=>{version.current++;};
  },[revision,title,entries,current,retry]);
  const ready=!rendering&&detail?.revision===selected.revision&&!error;
  const missing=detail?.snapshot.skills.filter(id=>!skills.some(skill=>skill.id===id))||[];
  useEffect(()=>{
    if(!playing||!ready||document.hidden)return;
    if(index===entries.length-1){setPlaying(false);return;}
    const timer=setTimeout(()=>setRevision(entries[index+1].revision),1100);
    return()=>clearTimeout(timer);
  },[playing,ready,index,entries]);
  useEffect(()=>{const pause=()=>{if(document.hidden)setPlaying(false);};document.addEventListener('visibilitychange',pause);return()=>document.removeEventListener('visibilitychange',pause);},[]);
  function seek(nextIndex){setPlaying(false);setRevision(entries[nextIndex].revision);setNotice('');}
  async function restore() {
    if(!ready||busy||readOnly||missing.length||selected.revision==='current')return;
    setBusy(true);setPlaying(false);setError('');
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
  const caption=selected.revision==='current'?'当前结构':'保存的结构';
  return <EditorPage title={`${mode.title} · 演变`} onClose={()=>leave(onClose)}>
    <div className="mode-history" aria-busy={busy}>
      <div className="evolution-heading">
        <div className="evolution-graphs" role="tablist" aria-label="架构视图">{graphs.map((item,i)=><button key={i} role="tab" aria-selected={item===graph} onClick={()=>{setTitle(item.title);setPlaying(false);}}>{item.title}</button>)}</div>
        <details className="evolution-actions"><summary aria-label="记录操作"><MoreHorizontal size={19}/></summary><div>
          <button disabled={!ready||busy||readOnly||!!missing.length} onClick={()=>onContinue({...mode,...detail.snapshot,roots:detail.snapshot.skills})}>从这里继续编辑</button>
          <button disabled={!ready||busy||readOnly||!!missing.length||revision==='current'} onClick={restore}><RotateCcw size={14}/>恢复这个版本</button>
        </div></details>
      </div>
      {error&&<div className="evolution-error" role="alert">这次内容未能读取或更新。<button disabled={busy||listing} onClick={()=>{details.current.delete(revision);setDetail(null);setRetry(value=>value+1);load();}}>重试</button><details><summary>详情</summary>{error}</details></div>}
      <div className="evolution-canvas" data-revision={ready?selected.revision:''}>
        {drawing?<MermaidView source={drawing.source} renderedDiagram={drawing} evolve compact/>:<div className="evolution-empty">{ready?'这个版本还没有架构图':status==='loading'?'正在读取记录…':'选择记录查看结构'}</div>}
        {!ready&&!error&&drawing&&<span className="evolution-reading" role="status">正在读取…</span>}
      </div>
      <footer className="evolution-dock">
        <div className="evolution-caption"><span><time>{date}</time><strong>{caption}</strong></span><span className="evolution-summary">
          {notice||(!ready?'':changes.added.length||changes.removed.length?`加入 ${changes.added.length} · 移出 ${changes.removed.length}`:changes.structure?'调整结构':'')}
        </span></div>
        <div className="evolution-transport">
          <button aria-label={playing?'暂停回放':'回放变化'} disabled={entries.length<2||busy} onClick={()=>{if(!playing&&index===entries.length-1)setRevision(entries[0].revision);setPlaying(!playing);}}>{playing?<Pause size={17}/>:<Play size={17}/>}</button>
          <button aria-label="上个版本" disabled={!index||busy} onClick={()=>seek(index-1)}><ChevronLeft size={16}/></button>
          <div className="evolution-track" style={{'--progress':`${index/Math.max(1,entries.length-1)*100}%`}}>
            <div className="evolution-rail"/>
            <div className="evolution-stops" aria-hidden="true">{entries.map((entry,i)=><i key={entry.revision} className={i<=index?'is-past':''} style={{left:`${i/Math.max(1,entries.length-1)*100}%`}}/>)}</div>
            <input type="range" aria-label="演进时间轴" aria-valuetext={`${date} ${caption}`} min="0" max={entries.length-1} step="1" value={index} disabled={busy||entries.length<2} onChange={event=>seek(Number(event.target.value))}/>
          </div>
          <button aria-label="下个版本" disabled={index===entries.length-1||busy} onClick={()=>seek(index+1)}><ChevronRight size={16}/></button>
        </div>
        <div className="evolution-context">
          {status==='not-repository'?<span>这个库还没有版本记录。</span>:<>
            {next!==null&&next!==undefined&&<button disabled={busy||listing} onClick={()=>load(true)}>更早记录</button>}
            <details><summary>{ready&&missing.length?`缺少 ${missing.length} 个技能`:'变化说明'}</summary><div>
              {ready&&!!missing.length&&<p>请先在工作库补齐：{missing.map(label).join('、')}。</p>}
              {ready&&!!changes.added.length&&<p>加入：{changes.added.map(label).join('、')}</p>}{ready&&!!changes.removed.length&&<p>移出：{changes.removed.map(label).join('、')}</p>}
              {ready?<>{selected.revision!=='current'&&<p>{selected.title}</p>}{detail?.note?.document?<Markdown text={detail.note.document}/>:<p>尚未补充说明</p>}</>:<p>{error?'这条记录暂时无法显示。':'正在读取所选记录…'}</p>}
              <small>回看只呈现当时的模式组织，技能正文保持当前内容。</small>
            </div></details>
          </>}
        </div>
      </footer>
    </div>
  </EditorPage>;
}
