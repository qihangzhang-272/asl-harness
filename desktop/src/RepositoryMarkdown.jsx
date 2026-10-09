import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ArrowLeft} from 'lucide-react';
import Markdown from './Markdown.jsx';
import {repositoryFileLink} from './repository-links.mjs';
import {useViewState,useScrollMemory} from './useViewState.jsx';

export default function RepositoryMarkdown({document,report}) {
  const [history,setHistory]=useViewState(`repository-document:${document.url}`,[]);
  const [current,setCurrent]=useState(document),[error,setError]=useState(''),[loading,setLoading]=useState(false),[retry,setRetry]=useState(0);
  const cache=useRef(new Map()),reader=useRef(null);
  const route=history.at(-1)||'';
  let file=route.split('#')[0];try{file=decodeURIComponent(file);}catch{}
  const [loadedKey,setLoadedKey]=useState('');
  const cacheKey=`${report?.commit||report?.snapshot||document.url}:${file}`;
  const ready=!loading&&!error&&(!file||loadedKey===cacheKey);
  useScrollMemory(`repository:${document.url}:${route}`,reader,ready);
  useLayoutEffect(()=>{
    if(!ready||!route.includes('#'))return;
    try{
      const id=decodeURIComponent(route.slice(route.indexOf('#')+1));
      [...reader.current.querySelectorAll('.markdown-content [id]')].find(element=>element.id===id)?.scrollIntoView({block:'start'});
    }catch{/* A malformed or missing section keeps the document readable. */}
  },[route,current,ready]);
  useEffect(()=>{
    let active=true;setError('');
    if(!file){setCurrent(document);setLoading(false);return;}
    if(cache.current.has(cacheKey)){setCurrent(cache.current.get(cacheKey));setLoadedKey(cacheKey);setLoading(false);return;}
    setLoading(true);
    const parts=new URL(document.url).pathname.split('/').filter(Boolean);
    const read=report?.snapshot?window.asl.repositoryDocument(report.snapshot,file):window.asl.repositoryOverview(`https://github.com/${parts[0]}/${parts[1]}`,{file,ref:parts[3]});
    read.then(result=>{
      if(!result.ok||!result.value)throw new Error(result.error||'仓库中没有这份文档');
      cache.current.set(cacheKey,result.value);if(active){setCurrent(result.value);setLoadedKey(cacheKey);}
    }).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[file,document.text,document.url,cacheKey,retry]);
  function follow(href){
    const next=repositoryFileLink(href,current.url);if(!next)return false;
    setHistory(previous=>[...previous,next]);
    return true;
  }
  return <div ref={reader} className="repository-document" aria-busy={loading}>
    {!!history.length&&<button onClick={()=>setHistory(previous=>previous.slice(0,-1))}><ArrowLeft size={15}/>返回文档</button>}
    {loading&&<p role="status">正在读取文档…</p>}
    {error&&<div role="alert"><p className="error-text">{error}</p><button onClick={()=>setRetry(n=>n+1)}>重新读取</button></div>}
    <Markdown text={current.text} baseUrl={current.url} onLink={follow}/>
  </div>;
}
