import React,{useEffect,useRef,useState} from 'react';
import {ArrowUpRight,ChevronsDownUp,ChevronsUpDown,Expand,Minimize2,PanelRightClose,PanelRightOpen,RefreshCw,X} from 'lucide-react';
import Markdown from '../../../desktop/src/Markdown.jsx';
import FileTree from './FileTree.jsx';

export function FileContent({document,file,url,onFile}){
  if(/\.(png|jpe?g|gif|webp|svg)$/i.test(file))return <figure className="asl-artifact-image"><img src={url} alt={file}/></figure>;
  if(/\.(pdf|html)$/i.test(file))return <div className="asl-artifact-frame"><iframe title={file} src={url} sandbox=""/></div>;
  if(document==null)return <p className="asl-preview-empty">此格式暂不支持内嵌预览，可在 Sidebar 或系统文件夹中打开。</p>;
  return /\.(md|markdown)$/i.test(file)?<div className="asl-markdown"><Markdown text={document} onLink={href=>{if(/^https?:/.test(href)){window.open(href,'_blank','noopener,noreferrer');return true;}}} onFile={onFile}/></div>:<pre className="asl-preview-code">{document}</pre>;
}

export default function SkillPreview({target,skills,api,sessionId,revision,onClose,onEdit,onAction,onInspection,onDraftChange}){
  const [id,setId]=useState(target.ids?.[0]||''),[file,setFile]=useState('SKILL.md'),[data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [expanded,setExpanded]=useState(false),[collapsed,setCollapsed]=useState(false),[treeOpen,setTreeOpen]=useState(true),[query,setQuery]=useState(''),[refresh,setRefresh]=useState(0),[listing,setListing]=useState([]);
  const [editing,setEditing]=useState(false),[draft,setDraft]=useState(''),[saving,setSaving]=useState(false);
  const request=useRef(0),loaded=useRef(''),live=useRef({}),artifact=target.kind==='artifact';
  const dirty=data?.document!=null&&draft!==data.document;
  live.current={data,dirty};
  useEffect(()=>{onDraftChange(editing||dirty?{identifier:id,file,dirty}:null);},[editing,id,file,dirty,onDraftChange]);
  useEffect(()=>()=>onDraftChange(null),[onDraftChange]);
  const name=artifact?target.path.split(/[\\/]/).at(-1):skills.find(s=>s.id===id)?.title||id;
  useEffect(()=>{
    let alive=true;const seq=++request.current;setBusy(true);setError('');
    if(!live.current.dirty&&loaded.current!==id+'/'+file){setData(null);onInspection(null);}
    const args=artifact?{sessionId,path:target.path}:{kind:'skill',identifier:id,file};
    api(artifact?'artifactPreview':'read',args).then(value=>{if(alive&&seq===request.current){if(live.current.dirty){if(live.current.data.fingerprint!==value.fingerprint)setError('文件已在其他位置更新；你的草稿仍保留，请先复制草稿再重新读取并合并。');return;}loaded.current=id+'/'+file;setData(value);setDraft(value.document||'');if(value.files)setListing(value.files);onInspection(artifact?{kind:'artifact',path:target.path}:{kind:'skill',identifier:id,file:value.file});}}).catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setBusy(false);});
    return()=>{alive=false;};
  },[id,file,target.path,sessionId,revision,refresh]);
  function discard(){return !dirty||window.confirm('预览有未保存修改，切换会丢弃草稿。继续吗？');}
  function select(path){if(!saving&&path!==file&&discard()){setEditing(false);setDraft(data?.document||'');setFile(path);}}
  async function save(){setSaving(true);setError('');try{const value=await api('save',{kind:'skill',identifier:id,file,expected:data.fingerprint,document:draft});setData(value);setDraft(value.document);}catch(e){setError(e.message);}finally{setSaving(false);}}
  async function action(name,entry){
    if(name==='refresh'){setRefresh(v=>v+1);return;}
    if(name==='edit'){onEdit(id,entry.path);return;}
    await onAction(name,{identifier:id,file:entry.path});
  }
  const mediaArgs=artifact?{sessionId,path:target.path}:{kind:'skill',identifier:id,file};
  const url='asl-workspace/file?'+new URLSearchParams(mediaArgs);
  return <aside className="asl-skill-preview" aria-label={artifact?'产物预览':'技能快速预览'} data-expanded={expanded&&!collapsed} data-collapsed={collapsed} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();e.stopPropagation();if(dirty&&!saving&&!busy)save();}}}>

    <header className="asl-preview-header"><div className="title-group">{collapsed?<button className="asl-btn" aria-label="展开技能预览" onClick={()=>setCollapsed(false)}><PanelRightOpen size={17}/></button>:<span title={name}>{name}</span>}</div>
      <div className="asl-preview-actions"><button aria-label="刷新预览" onClick={()=>setRefresh(v=>v+1)}><RefreshCw size={15}/></button><button aria-label={expanded?'还原预览':'放大预览'} onClick={()=>setExpanded(!expanded)}>{expanded?<Minimize2 size={15}/>:<Expand size={15}/>}</button><button aria-label="收起预览" onClick={()=>setCollapsed(true)}><PanelRightClose size={15}/></button><button aria-label="关闭预览" onClick={onClose}><X size={15}/></button></div>
    </header>
    {!artifact&&<div className="asl-preview-skills">{target.ids.map(value=><button className="skill-tab" key={value} title={skills.find(s=>s.id===value)?.title||value} aria-selected={id===value} disabled={saving} onClick={()=>{if(value!==id&&discard()){setEditing(false);setDraft(data?.document||'');setListing([]);setId(value);setFile('SKILL.md');setQuery('');}}}><span>{skills.find(s=>s.id===value)?.title||value}</span></button>)}</div>}
    {!artifact&&<div className="asl-preview-edit-bar" hidden={collapsed}><button className="asl-btn" disabled={!data||data.document==null||saving||busy} aria-pressed={editing} onClick={()=>setEditing(!editing)}>{editing?'阅读':'编辑 Markdown'}</button><button className="asl-btn" disabled={!dirty||saving||busy} onClick={save}>{saving?'保存中…':dirty?'保存修改':'已保存'}</button></div>}
    <div className="asl-preview-body">{!artifact&&<section className="asl-preview-tree"><div className="asl-preview-tree-header"><div className="asl-preview-actions"><button aria-label={treeOpen?'收起全部文件夹':'展开全部文件夹'} onClick={()=>setTreeOpen(!treeOpen)}>{treeOpen?<ChevronsDownUp size={15}/>:<ChevronsUpDown size={15}/>}</button><button onClick={()=>onAction('reveal',{identifier:id,file:''})} title="在系统文件夹中显示技能目录" aria-label="在系统文件夹中显示技能目录"><ArrowUpRight size={15}/></button></div><input className="asl-input" style={{height:26,border:'1px solid var(--line)',borderRadius:4,padding:'0 6px',fontSize:12,background:'var(--surface)',color:'var(--ink)'}} aria-label="查找预览文件" placeholder="查找文件…" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="asl-preview-tree-scroll">{listing.length>0&&<FileTree key={id} files={listing} selected={file} query={query} expanded={treeOpen} onSelect={select} onAction={action}/>}</div></section>}
      <section className="asl-preview-document" aria-busy={busy}>{error&&<p role="alert" className="asl-preview-error">{error}</p>}{busy&&!dirty&&!data?<p className="asl-preview-empty">正在读取文件…</p>:data&&<><p title={artifact?target.path:file}>{artifact?target.path:file}</p><div className={editing?'asl-preview-editor-wrap':undefined} onDoubleClick={e=>{if(!artifact&&!saving&&data.document!=null&&!e.target.closest('a,button,summary'))setEditing(true);}}>{editing?<textarea className="asl-preview-editor" aria-label="预览 Markdown 原文" autoFocus spellCheck={false} disabled={saving} value={draft} onChange={e=>setDraft(e.target.value)}/>:<FileContent document={dirty?draft:data.document} file={artifact?target.path:file} url={url} onFile={relative=>{const parts=file.split('/').slice(0,-1);for(const part of relative.split('/'))if(part==='..')parts.pop();else if(part&&part!=='.')parts.push(part);const next=parts.join('/');if(data.files.some(f=>f.path===next))select(next);}}/>}</div></>}</section>
    </div>
    <footer className="asl-preview-footer"><span>{saving?'保存中':dirty?'未保存修改':busy?'读取中':error?'读取或保存失败':`${editing?'编辑':'预览'}${data?.document!=null?' · UTF-8 · '+data.document.length+' 字符':''}`}</span>{artifact?<button className="asl-btn" onClick={()=>onAction('sidebar',{path:target.path,sessionId})}><ArrowUpRight size={14}/>Sidebar</button>:<button className="asl-btn" disabled={!data||busy} onClick={()=>onEdit(id,file)}><ArrowUpRight size={14}/>完整页面编辑</button>}</footer>
  </aside>;
}
