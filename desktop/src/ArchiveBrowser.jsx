import React,{useEffect,useRef,useState} from 'react';
import {Archive,FileText,RotateCw,Search,Trash2,Undo2} from 'lucide-react';
import EditorPage,{useLeaveGuard} from './EditorPage.jsx';
import PanelResize from './PanelResize.jsx';
import Markdown from './Markdown.jsx';
import './archive.css';

export default function ArchiveBrowser({workspace,api,readOnly,onClose,onSaved}) {
  const [catalog,setCatalog]=useState(null),[entry,setEntry]=useState(''),[data,setData]=useState(null);
  const [query,setQuery]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
  const [error,setError]=useState(null),[notice,setNotice]=useState(''),[external,setExternal]=useState(false);
  const live=useRef(true),generation=useRef(0);
  const leave=useLeaveGuard(false,busy);
  useEffect(()=>{live.current=true;load('',null,true);return()=>{live.current=false;generation.current++;};},[workspace]);
  useEffect(()=>window.asl.onEnvironmentChanged(event=>{
    if(event.workspace===workspace&&!event.error){if(!busy){generation.current++;setLoading(false);}setExternal(true);}
  }),[workspace,busy]);
  async function load(preferred=entry,file=null,refresh=false){
    const token=++generation.current;
    setLoading(true);setError(null);setData(null);setNotice('');
    try{
      const next=refresh?await api('run','archives',{workspace}):catalog;
      if(!live.current||generation.current!==token)return;
      if(refresh)setCatalog(next);
      const selected=next?.entries.some(item=>item.entry===preferred)?preferred:next?.entries[0]?.entry||'';
      setEntry(selected);
      if(selected){
        const detail=await api('run','archives',{workspace,entry:selected,...(file?{file}:{})});
        if(!live.current||generation.current!==token)return;
        setData(detail);
      }
      setExternal(false);
    }catch(failure){if(live.current&&generation.current===token)setError({message:'未能读取归档，请重试。',failure});}
    finally{if(live.current&&generation.current===token)setLoading(false);}
  }
  async function change(action){
    if(!data||readOnly||busy||loading||external||!(action==='restore'?data.restorable:data.cleanupAllowed))return;
    setBusy(true);setError(null);setNotice('');
    let completed=false;
    try{
      const values={workspace,entry:data.entry,expected:data.fingerprint};
      const result=action==='restore'
        ?await api('run','edit',{workspace,apply:true,request:{operation:'archive.restore',entry:data.entry,expected:data.fingerprint}})
        :await api('trashArchive',values);
      if(result.canceled||!live.current)return;
      completed=true;
      await load('',null,true);
      if(live.current){setNotice(action==='restore'?'已恢复到工作库':'已移到回收站');await onSaved?.();}
    }catch(failure){
      if(live.current){
        if(failure.code==='EDIT_STALE'||failure.code==='ARCHIVE_MISSING')setExternal(true);
        setError({message:completed?'操作已完成，页面未能更新，请重新读取。':failure.code==='ARCHIVE_CONFLICT'?'原位置已有同名内容，未覆盖。':failure.code==='EDIT_STALE'?'归档已更新，请重新读取。':action==='restore'?'未能恢复，请重新读取后重试。':'未能移到回收站，请重新读取后重试。',failure});
      }
    }finally{if(live.current)setBusy(false);}
  }
  const filtered=(catalog?.entries||[]).filter(item=>`${item.title} ${item.entry}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <EditorPage title="归档" onClose={()=>leave(onClose)}>
    <div className="file-workbench archive-browser">
      <aside className="package-sidebar"><nav className="package-tree" aria-label="归档条目">
        <label className="search"><Search size={15}/><input aria-label="搜索归档" placeholder="搜索归档" value={query} disabled={busy} onChange={event=>setQuery(event.target.value)}/></label>
        {filtered.map(item=><button key={item.entry} className={entry===item.entry?'active':''} disabled={busy} title={item.title} onClick={()=>load(item.entry)}><Archive size={14}/><span>{item.title}</span><small>{{mode:'模式',skill:'技能',feedback:'记录',unknown:'资料'}[item.kind]}</small></button>)}
        {catalog&&!filtered.length&&<p className="muted">{query?'没有找到归档':'暂无归档'}</p>}
      </nav><PanelResize name="archive-browser" label="调整归档目录宽度" initial={230} min={150} max={380}/></aside>
      <section className="package-document">
        <header><span>{data?.title||'归档内容'}</span>{!!data?.files.length&&<label className="archive-file-picker"><FileText size={14}/><select aria-label="归档文件" disabled={busy||loading} value={data.file||''} onChange={event=>load(data.entry,event.target.value)}>{data.files.map(item=><option key={item.path} value={item.path}>{item.path}</option>)}</select></label>}</header>
        <div className="package-rendered">{loading?<p role="status">正在读取…</p>:data?data.document===null?<p>此文件暂不支持预览。</p>:/\.(md|markdown)$/i.test(data.file||'')?<Markdown text={data.document}/>:<pre>{data.document}</pre>:<p className="muted">{catalog?.entries.length?'选择一项归档查看':'归档的内容会显示在这里。'}</p>}</div>
      </section>
    </div>
    {external&&<p className="inline-note" role="status">归档有新变化，请重新读取。</p>}
    {error&&<><p className="error-text" role="alert">{error.message}</p><details><summary>查看详情</summary><pre>{JSON.stringify({message:error.failure.diagnostic||error.failure.message,code:error.failure.code,details:error.failure.details},null,2)}</pre></details></>}
    {!!catalog?.issues.length&&<details><summary>{catalog.issues.length} 项未能读取</summary>{catalog.issues.map((issue,index)=><p key={issue.entry||index}>{issue.entry}：{issue.message}</p>)}</details>}
    <div className="dialog-actions"><span className="muted" role="status">{notice||(!loading&&data&&!data.restorable?'此项仅供查看':'')}</span>
      <button disabled={busy||loading} onClick={()=>load(entry,null,true)}><RotateCw size={15}/>重新读取</button>
      {!readOnly&&data?.cleanupAllowed&&<button disabled={busy||loading||external} onClick={()=>change('trash')}><Trash2 size={15}/>移到回收站</button>}
      {!readOnly&&data?.restorable&&<button className="primary" disabled={busy||loading||external} title={data.target} onClick={()=>change('restore')}><Undo2 size={15}/>恢复到工作库</button>}
    </div>
  </EditorPage>;
}
