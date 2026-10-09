import React,{useEffect,useState} from 'react';
import {Plus,FileText,Save,Archive,RotateCw} from 'lucide-react';
import EditorPage,{useLeaveGuard} from './EditorPage.jsx';
import PanelResize from './PanelResize.jsx';
import Markdown from './Markdown.jsx';

export default function EnvironmentDocuments({workspace,api,readOnly,onClose,onSaved}) {
  const [file,setFile]=useState('PROFILE.md'),[files,setFiles]=useState([]),[data,setData]=useState(null);
  const [document,setDocument]=useState(''),[editing,setEditing]=useState(false),[creating,setCreating]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[retry,setRetry]=useState(0);
  const [external,setExternal]=useState(false);
  const dirty=creating||data!=null&&document!==data.document;
  const leave=useLeaveGuard(dirty,busy);
  useEffect(()=>window.asl.onEnvironmentChanged(event=>{if(event.workspace===workspace&&!event.error)setExternal(true);}),[workspace]);
  useEffect(()=>{if(external&&!dirty&&!busy){setExternal(false);setRetry(n=>n+1);}},[external,dirty,busy]);
  useEffect(()=>{
    if(creating)return;
    let active=true;setBusy(true);setError('');
    api('run','documents',{workspace,file}).then(result=>{
      if(active){setData(result);setFiles(result.files);setDocument(result.document);setEditing(false);}
    }).catch(error=>{if(active){setData(null);setError(error.message);}}).finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;};
  },[workspace,file,retry,creating]);
  const select=next=>{if(file!==next||creating)leave(()=>{setCreating(false);setData(null);setNotice('');setFile(next);});};
  async function save(archive=false){
    setBusy(true);setError('');setNotice('');
    let written=false;
    try{
      const result=await api('run','edit',{workspace,apply:true,request:{operation:`environment.file.${archive?'archive':'save'}`,file,
        ...(data?.fingerprint?{expected:data.fingerprint}:{}),...(!archive?{document}:{})}});
      if(result.canceled)return;
      written=true;
      const next=await api('run','documents',{workspace,file:archive?'PROFILE.md':file});
      setCreating(false);setFile(next.file);setData(next);setFiles(next.files);setDocument(next.document);setEditing(false);setExternal(false);
      setNotice(archive?'已归档':file==='PROFILE.md'?'已保存，已配置的 Agent 可在配置页更新。':'已保存');
      onSaved?.();
    }catch(error){setError(`${written?'已保存，重新读取失败：':''}${error.message}`);}finally{setBusy(false);}
  }
  return <EditorPage title="偏好与记录" onClose={()=>leave(onClose)}>
    <div className="file-workbench environment-documents">
      <aside className="package-sidebar"><nav className="package-tree" aria-label="偏好与反馈">
        <button className={file==='PROFILE.md'?'active':''} disabled={busy} onClick={()=>select('PROFILE.md')}><FileText size={15}/><span>工作偏好</span></button>
        <div className="sidebar-label">反馈记录</div>
        {files.filter(item=>item.path!=='PROFILE.md').map(item=><button key={item.path} className={file===item.path?'active':''} disabled={busy} onClick={()=>select(item.path)} title={item.title}><FileText size={14}/><span>{item.title}</span></button>)}
        <button disabled={readOnly||busy} onClick={()=>leave(()=>{setCreating(true);setData(null);setFile(`feedback/${crypto.randomUUID()}.md`);setDocument('# 新反馈\n\n');setEditing(true);setError('');setNotice('');})}><Plus size={15}/>新建记录</button>
      </nav><PanelResize name="environment-documents" label="调整记录目录宽度" initial={220} min={140} max={360}/></aside>
      <section className="package-document" onDoubleClick={event=>{if(!readOnly&&!busy&&(data||creating)&&!event.target.closest('button,a,input,textarea,.mermaid-viewport'))setEditing(true);}}>
        <header><span>{file==='PROFILE.md'?'工作偏好':creating?'新反馈':files.find(item=>item.path===file)?.title||file}</span><div className="tabs">
          <button disabled={busy||creating} aria-label="重新读取记录" title="重新读取记录" onClick={()=>leave(()=>{setExternal(false);setRetry(n=>n+1);})}><RotateCw size={14}/></button>
          <button disabled={busy||!data&&!creating} className={!editing?'active':''} onClick={()=>setEditing(false)}>预览</button>
          <button disabled={busy||readOnly||!data&&!creating} className={editing?'active':''} onClick={()=>setEditing(true)}>编辑</button>
        </div></header>
        {external&&dirty&&<div className="inline-note">文件有新版本，未保存修改已保留。<button disabled={busy} onClick={()=>leave(()=>{setCreating(false);setExternal(false);setRetry(n=>n+1);})}>重新读取</button></div>}
        {busy&&!data&&!creating?<p role="status">正在读取…</p>:data||creating?editing?<textarea className="package-code" aria-label="记录内容" readOnly={busy} spellCheck={false} value={document} onChange={event=>setDocument(event.target.value)}/>:<div className="package-rendered"><Markdown text={document}/></div>:<button onClick={()=>setRetry(n=>n+1)}>重新读取</button>}
      </section>
    </div>
    {error&&<p className="error-text" role="alert">{error}</p>}
    {!!data?.issues?.length&&<details><summary>{data.issues.length} 条记录需要检查</summary>{data.issues.map(issue=><p key={issue.path}>{issue.path}：{issue.message}</p>)}</details>}
    <div className="dialog-actions"><span className="muted" role="status">{notice||(dirty?'有未保存修改':'')}</span>
      {file!=='PROFILE.md'&&!creating&&data&&<button disabled={busy||readOnly} onClick={()=>leave(()=>save(true))}><Archive size={15}/>归档记录</button>}
      <button disabled={busy} onClick={()=>leave(onClose)}>关闭</button><button className="primary" disabled={!dirty||busy||readOnly} onClick={()=>save()}><Save size={15}/>保存</button>
    </div>
  </EditorPage>;
}
