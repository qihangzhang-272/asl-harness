import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft} from 'lucide-react';
import Markdown from './Markdown.jsx';
import {repositoryDocumentLink,repositoryLanguageOptions} from './repository-links.mjs';
import {useViewState,useScrollMemory} from './useViewState.jsx';

export default function RepositoryMarkdown({document,report}) {
  const [history,setHistory]=useViewState(`repository-document:${document.url}`,[]);
  const repository=new URL(document.url).pathname.split('/').filter(Boolean).slice(0,2).join('/');
  const [language,setLanguage]=useViewState(`repository-language:${repository.toLowerCase()}`,null);
  const languages=useMemo(()=>repositoryLanguageOptions(document,report?.repositoryFiles),[document.url,document.text,report?.repositoryFiles]);
  const original=repositoryDocumentLink(document.url,document.url);
  const preferred=languages.find(option=>language===null?option.label==='中文':language===(option.language||'original'))||languages[0]||original;
  const saved=history.at(-1);
  // Older reading history stored a relative file path; new entries keep the requested version.
  const route=(typeof saved==='string'?repositoryDocumentLink(saved,document.url):saved)||preferred;
  const file=route?.file||'',ref=route?.ref||'',hash=route?.hash||'';
  const [current,setCurrent]=useState(document),[error,setError]=useState(''),[loading,setLoading]=useState(false),[retry,setRetry]=useState(0);
  const cache=useRef(new Map()),reader=useRef(null);
  const [loadedKey,setLoadedKey]=useState('');
  const cacheKey=`${ref}:${file}`;
  const isOriginal=!file||file===original?.file&&ref===original?.ref;
  const ready=!loading&&!error&&(isOriginal||loadedKey===cacheKey);
  useScrollMemory(`repository:${document.url}:${cacheKey}:${hash}`,reader,ready);
  useLayoutEffect(()=>{
    if(!ready||!hash)return;
    try{
      const id=decodeURIComponent(hash.slice(1));
      [...reader.current.querySelectorAll('.markdown-content [id]')].find(element=>element.id===id)?.scrollIntoView({block:'start'});
    }catch{/* A malformed or missing section keeps the document readable. */}
  },[hash,current,ready]);
  useEffect(()=>{
    let active=true;setError('');
    if(isOriginal){setCurrent(document);setLoading(false);return;}
    if(cache.current.has(cacheKey)){setCurrent(cache.current.get(cacheKey));setLoadedKey(cacheKey);setLoading(false);return;}
    setLoading(true);
    const read=report?.snapshot&&ref===report.commit?window.asl.repositoryDocument(report.snapshot,file):window.asl.repositoryOverview(`https://github.com/${repository}`,{file,ref});
    read.then(result=>{
      if(!result.ok||!result.value)throw new Error(result.error||'仓库中没有这份文档');
      cache.current.set(cacheKey,result.value);if(active){setCurrent(result.value);setLoadedKey(cacheKey);}
    }).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[file,ref,isOriginal,document.text,document.url,cacheKey,report?.snapshot,report?.commit,retry]);
  function follow(href){
    const next=repositoryDocumentLink(href,current.url);if(!next)return false;
    setHistory(previous=>[...previous,next]);
    return true;
  }
  function chooseLanguage(value){
    const option=languages.find(item=>`${item.ref}:${item.file}`===value);
    if(option){setLanguage(option.language||'original');setHistory([]);}
  }
  return <div ref={reader} className="repository-document" aria-busy={loading}>
    {(history.length>0||languages.length>1)&&<div className="repository-document-toolbar">
      {!!history.length&&<button onClick={()=>setHistory(previous=>previous.slice(0,-1))}><ArrowLeft size={15}/>返回文档</button>}
      {languages.length>1&&<label>阅读语言<select aria-label="阅读语言" value={`${preferred?.ref}:${preferred?.file}`} onChange={event=>chooseLanguage(event.target.value)}>{languages.map(option=><option key={`${option.ref}:${option.file}`} value={`${option.ref}:${option.file}`}>{option.label}</option>)}</select></label>}
    </div>}
    {ready&&ref&&ref!==original?.ref&&<p className="repository-document-version">其他版本 · {ref}</p>}
    {loading&&<p role="status">正在读取文档…</p>}
    {error&&<div role="alert"><p className="error-text">这份文档暂时读不到。<button onClick={()=>setRetry(n=>n+1)}>重新读取</button></p><p className="muted">暂时保留上次读到的内容。</p><details><summary>查看详情</summary><pre>{error}</pre></details></div>}
    {(ready||error)&&<Markdown text={current.text} baseUrl={current.url} onLink={follow}/>}
  </div>;
}
