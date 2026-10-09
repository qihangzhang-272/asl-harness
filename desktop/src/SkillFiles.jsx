import React, { useEffect, useRef, useState } from 'react';
import { FileText, FolderOpen, Code, Save, Search, Puzzle, RotateCw } from 'lucide-react';
import Markdown from './Markdown.jsx';
import MermaidView from './MermaidView.jsx';
import PanelResize from './PanelResize.jsx';
import {diagramsIn,outlineFor} from './mermaid-document.mjs';
import {useLeaveGuard} from './EditorPage.jsx';
import {useViewState,useScrollMemory} from './useViewState.jsx';
export default function SkillFiles({ item, Dialog, readFile, saveFile, onClose, readOnly, embedded=false, initialFile }) {
  const [data, setData] = useState(null);
  const key=`file:${item.path||item.source||''}:${item.id}`;
  const [file, setFile] = useViewState(key,'SKILL.md');
  useEffect(()=>{if(initialFile)setFile(initialFile);},[initialFile]);
  const rendered=useRef(null);
  const [document, setDocument] = useState(''), [editing, setEditing] = useState(false);
  const [error, setError] = useState(''), [query, setQuery] = useState(''), [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const refreshRead=useRef(false);
  useEffect(()=>{
    const discard=()=>{refreshRead.current=true;setRetry(n=>n+1);};
    window.document.addEventListener('asl:discard-drafts',discard);
    return()=>window.document.removeEventListener('asl:discard-drafts',discard);
  },[]);
  const dirty = data?.document != null && document.replaceAll('\r\n','\n') !== data.document.replaceAll('\r\n','\n');
  const leave=useLeaveGuard(dirty,busy,embedded?'.skill-canvas-panel':'.editor-page');
  useScrollMemory(`${key}:${file}`,rendered,!!data&&!editing&&!busy);
  useEffect(() => {
    let active = true;
    setBusy(true); setError(''); setData(null);
    const refresh=refreshRead.current;refreshRead.current=false;
    readFile(file,refresh).then(result => { if (active) { setData(result); setDocument(result.document || ''); setEditing(false); } })
      .catch(e => { if (active) {if(file!=='SKILL.md'&&/不在当前包|文件不在/.test(e.message))setFile('SKILL.md');else setError(e.message);} }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [file,key,item.fingerprint,retry]);
  function edit(){if(!readOnly&&!busy&&data?.document!=null)setEditing(true);}
  const groups = [...new Set((data?.files || []).map(f => f.group))];
  return <Dialog title={item.title} onClose={() => leave(onClose)} wide>
    {!embedded&&<div className="package-summary"><Puzzle size={18}/><span>{data?.files.length ?? item.fileCount} 个文件 · 完整技能包</span><small>{item.requires.length ? `依赖 ${item.requires.join('、')}` : '未声明其他技能依赖'}</small></div>}
    <div className="file-workbench">
      <aside className="package-sidebar"><nav className="package-tree" aria-label="技能文件架构">
        <div className="search"><Search size={14}/><input aria-label="搜索技能文件" placeholder="查找文件" value={query} onChange={e=>setQuery(e.target.value)}/></div>
        {groups.map(group => <details key={group} open><summary title={group}><FolderOpen size={14}/><span>{group}</span><small>{data.files.filter(f=>f.group===group).length}</small></summary>
          {data.files.filter(f=>f.group===group && f.path.toLowerCase().includes(query.toLowerCase())).map(entry=><button key={entry.path} disabled={busy} className={file===entry.path?'active':''} title={entry.path}
            onClick={()=>{if(file!==entry.path)leave(()=>setFile(entry.path));}}><FileText size={13}/><span>{entry.path.includes('/') ? entry.path.slice(entry.path.indexOf('/')+1) : entry.path}</span></button>)}
        </details>)}
      </nav><PanelResize name="skill-files" label="调整技能文件目录宽度" initial={220} min={140} max={360}/></aside>
      <section className="package-document" onDoubleClick={event=>{if(!event.target.closest('button,a,input,textarea,.mermaid-viewport'))edit();}}>
        <header><span title={file}>{file}</span><div className="tabs"><button aria-label="重新读取文件" title="重新读取文件" disabled={busy} onClick={()=>leave(()=>{refreshRead.current=true;setRetry(n=>n+1);})}><RotateCw size={14}/></button><button disabled={busy} className={!editing?'active':''} onClick={()=>setEditing(false)}>预览</button><button disabled={readOnly || data?.document == null || busy} className={editing?'active':''} onClick={()=>setEditing(true)}><Code size={14}/>编辑</button></div></header>
        {busy||!data&&!error ? <p className="muted">正在读取文件…</p> : !data ? <div role="alert"><p className="error-text">{error}</p><button onClick={()=>setRetry(value=>value+1)}>重新读取</button></div> : data.document == null ? <p className="inline-note">此文件为二进制或超过 1 MB，保留在完整技能包中；请使用本地编辑器处理。</p> : editing ?
          <textarea aria-label="文件内容" className="package-code" spellCheck={false} value={document} onChange={e=>setDocument(e.target.value)}/> :
          /\.md$/i.test(file) ? <div ref={rendered} className="package-rendered">{file==='SKILL.md'&&!diagramsIn(document).length&&outlineFor(document)&&<details className="diagram-outline"><summary>文档结构</summary><MermaidView source={outlineFor(document)}/></details>}<Markdown text={document} onFile={relative=>{
            const parts=file.split('/').slice(0,-1);
            for(const part of relative.split('/')){if(part==='..')parts.pop();else if(part!=='.'&&part)parts.push(part);}
            const target=parts.join('/');
            if(data.files.some(f=>f.path===target))leave(()=>setFile(target));
          }}/></div> : /\.(mmd|mermaid)$/i.test(file)?<MermaidView source={document}/>:<pre ref={rendered} className="package-preview">{document}</pre>}
      </section>
    </div>
    {error && data && <p role="alert" className="error-text">{error}</p>}
    <div className="dialog-actions">{!embedded&&<span className="muted">{dirty ? '有未保存修改' : '直接对应本地文件'} · 保存不会执行脚本</span>}<button disabled={busy} onClick={()=>leave(onClose)}>关闭</button><button className="primary" disabled={!dirty || busy || readOnly} onClick={async()=>{
      setBusy(true); setError('');
      try { await saveFile({operation:'skill.file.save',id:item.id,file,document,expected:data.fingerprint}); const result=await readFile(file,true); setData(result); setDocument(result.document || ''); setEditing(false); }
      catch(e){setError(e.message);} finally{setBusy(false);}
    }}><Save size={15}/>校验并保存</button></div>
  </Dialog>;
}
