import React,{useEffect,useRef,useState} from 'react';
import {ArrowLeft} from 'lucide-react';
import Markdown from './Markdown.jsx';
import {repositoryFileLink} from './repository-links.mjs';

export default function RepositoryMarkdown({document,report}) {
  const [history,setHistory]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const cache=useRef(new Map()),sequence=useRef(0);
  useEffect(()=>()=>{sequence.current++;},[]);
  const current=history.at(-1)||document;
  function follow(href){
    const file=repositoryFileLink(href,current.url);
    if(!file)return false;
    const request=++sequence.current;setError('');
    const open=result=>{if(request===sequence.current){setHistory(previous=>[...previous,result]);setLoading(false);}};
    if(cache.current.has(file)){open(cache.current.get(file));return true;}
    setLoading(true);
    const parts=new URL(current.url).pathname.split('/').filter(Boolean);
    const read=report?.snapshot?window.asl.repositoryDocument(report.snapshot,file):window.asl.repositoryOverview(`https://github.com/${parts[0]}/${parts[1]}`,{file,ref:parts[3]});
    read.then(result=>{
      if(!result.ok||!result.value)throw new Error(result.error||'仓库中没有这份文档');
      cache.current.set(file,result.value);open(result.value);
    }).catch(e=>{if(request===sequence.current){setError(e.message);setLoading(false);}});
    return true;
  }
  return <div className="repository-document" aria-busy={loading}>
    {!!history.length&&<button onClick={()=>{sequence.current++;setLoading(false);setError('');setHistory(previous=>previous.slice(0,-1));}}><ArrowLeft size={15}/>返回文档</button>}
    {error&&<p className="error-text" role="alert">{error}</p>}
    <Markdown text={current.text} baseUrl={current.url} onLink={follow}/>
  </div>;
}
