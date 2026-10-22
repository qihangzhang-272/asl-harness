import React,{useEffect,useState} from 'react';
import {FileText,FolderOpen} from 'lucide-react';
import EditorPage from './EditorPage.jsx';
import PanelResize from './PanelResize.jsx';
import Markdown from './Markdown.jsx';

export default function ModeFiles({workspace,mode,api,onClose,initialFile='MODE.md'}){
  const [file,setFile]=useState(initialFile),[data,setData]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    let active=true;setData(null);setError('');
    api('run','modeFiles',{workspace,mode:mode.id,file}).then(result=>{if(active)setData(result);}).catch(error=>{if(active)setError(error.message);});
    return()=>{active=false;};
  },[workspace,mode.id,file,retry]);
  function relativeFile(value){
    const parts=file.split('/').slice(0,-1);
    for(const part of value.split('/')){if(part==='..')parts.pop();else if(part!=='.'&&part)parts.push(part);}
    const target=parts.join('/');
    if(data.files.some(item=>item.path===target))setFile(target);
  }
  return <EditorPage title={`${mode.title} · 配套资料`} onClose={onClose}>
    <p className="muted">模式内的说明、参考和附加文件，分享模式时会一并保留。</p>
    <div className="file-workbench"><aside className="package-sidebar"><nav className="package-tree" aria-label="模式资料目录"><div className="sidebar-label"><FolderOpen size={14}/>模式文件</div>{(data?.files||[]).map(item=><button className={item.path===file?'active':''} key={item.path} title={item.path} onClick={()=>setFile(item.path)}><FileText size={14}/><span>{item.path}</span></button>)}</nav><PanelResize name="mode-files" label="调整模式资料目录宽度" initial={220} min={140} max={360}/></aside>
      <section className="package-document"><header><span>{file}</span></header>{error?<div role="alert"><p>{error}</p><button onClick={()=>setRetry(value=>value+1)}>重新读取资料</button></div>:!data?<p role="status">正在读取资料…</p>:data.document==null?<p className="inline-note">此文件完整保留在模式包中，请在本地编辑器中查看。</p>:/\.md$/i.test(file)?<div className="package-rendered"><Markdown text={data.document} onFile={relativeFile}/></div>:<pre className="package-preview">{data.document}</pre>}</section>
    </div>
  </EditorPage>;
}
