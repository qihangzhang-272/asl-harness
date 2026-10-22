import React,{useEffect,useState} from 'react';
import {History,ChevronLeft,ChevronRight,X} from 'lucide-react';
import './file-history.css';

export default function FileHistory({workspace,file,api,onSelect,revision:linkedRevision,onClose}){
  const [records,setRecords]=useState([]),[revision,setRevision]=useState(linkedRevision||''),[detail,setDetail]=useState(null);
  const [status,setStatus]=useState('loading'),[error,setError]=useState(''),[offset,setOffset]=useState(0),[next,setNext]=useState(null),[retry,setRetry]=useState(0);
  useEffect(()=>{
    let active=true;setStatus('loading');setError('');setRecords([]);setDetail(null);
    api('run','history',{workspace,file,limit:10,offset}).then(result=>{
      if(!active)return;setRecords(result.entries||[]);setNext(result.nextOffset);setStatus(result.status);
      setRevision(linkedRevision||result.entries?.[0]?.revision||'');
    }).catch(error=>{if(active){setError(error.message);setStatus('error');}});
    return()=>{active=false;};
  },[workspace,file,offset,retry,linkedRevision]);
  useEffect(()=>{
    if(!revision)return;
    let active=true;setDetail(null);setError('');
    api('run','history',{workspace,file,revision}).then(result=>{if(active)setDetail(result);}).catch(error=>{if(active)setError(error.message);});
    return()=>{active=false;};
  },[workspace,file,revision,retry]);
  return <section className="file-history" aria-label="正文变更记录">
    <header><span><History size={16}/>改过什么</span><button aria-label="关闭正文变更记录" onClick={onClose}><X size={15}/></button></header>
    <p className="file-history-boundary">这里只显示已留下的版本记录。当前未记录的修改不会出现在这里。</p>
    {error?<div className="file-history-error" role="alert"><p>{error}</p><button onClick={()=>setRetry(value=>value+1)}>重新读取变更记录</button></div>:status==='loading'?<div className="history-skeleton" role="status" aria-label="正在读取变更记录"><i/><i/><i/></div>:!records.length&&!linkedRevision?<p className="file-history-empty">{status==='not-repository'?'这个库还没有 Git 记录。':'这个文件还没有可查看的版本。'}保存内容与建立版本记录是两件事。</p>:<>
      {!linkedRevision&&<div className="file-history-versions"><select aria-label="正文版本" value={revision} onChange={event=>setRevision(event.target.value)}>{records.map(record=><option key={record.revision} value={record.revision}>{new Date(record.date).toLocaleDateString('zh-CN')} · {record.title}</option>)}</select><button aria-label="上一页正文记录" disabled={!offset} onClick={()=>setOffset(value=>Math.max(0,value-10))}><ChevronLeft size={15}/></button><button aria-label="下一页正文记录" disabled={next==null} onClick={()=>setOffset(next)}><ChevronRight size={15}/></button></div>}
      {detail?<><pre className="file-history-diff">{detail.diff?.split('\n').map((line,index)=><span key={index} className={line.startsWith('+')&&!line.startsWith('+++')?'diff-add':line.startsWith('-')&&!line.startsWith('---')?'diff-remove':''}>{line||' '}</span>)}</pre>{detail.truncated&&<p>内容较长，当前显示部分差异；完整内容请在本地 Git 中查看。</p>}{onSelect&&<button className="history-link-action" onClick={()=>onSelect({revision,file})}>关联这次修改</button>}</>:<div className="history-skeleton" role="status" aria-label="正在读取正文差异"><i/><i/><i/></div>}
    </>}
  </section>;
}
