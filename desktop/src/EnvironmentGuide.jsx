import React,{useEffect,useRef,useState} from 'react';
import {AlertCircle,Copy,FolderOpen,LoaderCircle,Plus,RotateCw,X} from 'lucide-react';
import EditorPage from './EditorPage.jsx';
import {guidePrompt,guideReady,guideSelection,guideText} from './guide.mjs';
import './guide.css';

// Full page, opened before any read: the document and the local skill roots arrive afterwards.
export default function EnvironmentGuide({workspace,mode,repository,api,read,onClose,onVerified}) {
  const [document,setDocument]=useState(null),[roots,setRoots]=useState([]);
  const [included,setIncluded]=useState([]),[references,setReferences]=useState([]);
  const [goal,setGoal]=useState(''),[edited,setEdited]=useState(null);
  const [loading,setLoading]=useState(true),[copied,setCopied]=useState(false),[confirming,setConfirming]=useState(false),[error,setError]=useState('');
  const [checking,setChecking]=useState(false),[rootsError,setRootsError]=useState('');
  const live=useRef(true),generation=useRef(0);
  const loaded=useRef(false);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  const ready=guideReady(document);
  function start(){
    const token=++generation.current;
    const current=()=>live.current&&generation.current===token;
    setLoading(true);setError('');
    read('agent-guide','读取中',async call=>{
      try {
        const guide=await call('run','guide',{workspace,...(mode?{mode}:{})});
        if(!current())return;
        setDocument(guide.document);
      } catch(failure) { if(current())setError(failure.message); }
      finally { if(current())setLoading(false); }
    });
    setRootsError('');
    api('guideRoots').then(list=>{
      if(!current())return;
      const discovered=list||[],firstLoad=!loaded.current;
      loaded.current=true;setRoots(discovered);
      setIncluded(previous=>guideSelection(discovered.map(item=>item.path),firstLoad?(repository?[]:null):previous));
    }).catch(()=>{if(current())setRootsError('本机目录未读到，可添加目录或重试。');});
  }
  useEffect(()=>{start();},[]);
  const generated=guidePrompt({goal,document,included,references,repository});
  // The textarea below stays the single source for the prompt; rebuild only on request.
  const prompt=guideText({generated,edited});
  const changed=edited!==null;
  const touched=()=>{setCopied(false);setConfirming(false);};
  async function choose(){
    try{const path=await api('choose','reference');if(!live.current||!path)return;setReferences(v=>v.includes(path)?v:[...v,path]);touched();}
    catch(failure){if(live.current)setError(failure.message);}
  }
  async function copy(){
    if(!ready)return;
    try{await api('copyText',prompt);if(!live.current)return;setCopied(true);setError('');}
    catch(failure){if(live.current){setCopied(false);setError(failure.message);}}
  }
  function refresh(){start();}
  function verify(){
    setChecking(true);setError('');
    read('agent-guide','检查整理结果',async call=>{
      try { await call('run','describe',{workspace});if(live.current)await onVerified(workspace); }
      catch(failure){if(live.current)setError(failure.message);}
      finally{if(live.current)setChecking(false);}
    });
  }
  function rebuild(){setEdited(null);setCopied(false);setConfirming(false);}
  return <EditorPage title="整理模式" onClose={onClose}>
    <div className="environment-guide">
      <section className="guide-side">
        <label className="field"><span>工作场景</span><textarea rows={3} value={goal} onChange={e=>{setGoal(e.target.value);touched();}} placeholder="例如：持续研究 AI 产品"/></label>
        <div className="guide-location"><FolderOpen size={17} aria-hidden="true"/><span><strong>写入位置</strong><small title={workspace}>{workspace}</small></span></div>
        {repository&&<div className="guide-location"><FolderOpen size={17}/><span><strong>来源仓库</strong><small>{repository.repository.replace('https://github.com/','')}</small><small>{repository.commit.slice(0,8)}</small></span></div>}
        <div className="field-heading"><span>本机技能 <small className="muted">已选 {included.length}/{roots.length}</small></span></div>
        {loading&&<p className="inline-note" role="status"><LoaderCircle size={16} className="spin" aria-hidden="true"/>正在读取…</p>}
        {!loading&&!ready&&<p className="inline-note" role="alert"><AlertCircle size={16} aria-hidden="true"/><span>读取失败。<button className="text-button" title="重新读取工作环境" onClick={start}>重试</button></span></p>}
        {rootsError&&<p role="alert">{rootsError}<button onClick={start}>重试</button></p>}
        <div className="guide-roots">{roots.map(item=><label className="guide-root" key={item.path}><input type="checkbox" checked={included.includes(item.path)} onChange={e=>{setIncluded(v=>e.target.checked?[...v,item.path]:v.filter(path=>path!==item.path));touched();}}/><span>{item.name}<small title={item.path}>{item.path}</small></span></label>)}</div>
        <div className="field-heading"><span>参考资料</span><button onClick={choose} title="添加参考目录"><Plus size={15} aria-hidden="true"/>添加目录</button></div>
        {references.map(path=><div className="guide-reference" key={path}><FolderOpen size={15} aria-hidden="true"/><span title={path}>{path}</span><button className="icon-button" title={`不参考 ${path}`} aria-label={`不参考 ${path}`} onClick={()=>{setReferences(v=>v.filter(item=>item!==path));touched();}}><X size={17} aria-hidden="true"/></button></div>)}
      </section>
      <section className="guide-prompt">
        <div className="field-heading"><span>完整提示词</span></div>
        <textarea className="code-editor guide-text" aria-label="完整整理提示词" value={prompt} disabled={!ready} onChange={e=>{setEdited(e.target.value);touched();}}/>
        {changed&&<p className="guide-note muted">已手动修改</p>}
        {error&&<p className="error-text" role="alert">{error}</p>}
      </section>
    </div>
    <div className="dialog-actions">
      <button onClick={refresh} disabled={loading} title="重新读取本地内容"><RotateCw size={16} className={loading?'spin':''} aria-hidden="true"/>查看更新</button>
      {changed&&(confirming
        ? <span className="guide-confirm">丢弃手动修改？<button className="text-button" title="丢弃手动修改，按当前选项重新生成" onClick={rebuild}>确认重新生成</button><button className="text-button" onClick={()=>setConfirming(false)}>取消</button></span>
        : <button onClick={()=>setConfirming(true)} title="按当前选项重新生成提示词">重新生成</button>)}
      <button className="primary" onClick={copy} disabled={!ready} title="复制提示词"><Copy size={15} aria-hidden="true"/><span aria-live="polite">{copied?'已复制':'复制'}</span></button>
      <button onClick={verify} disabled={checking||loading}><RotateCw size={15} className={checking?'spin':''}/>查看整理结果</button>
    </div>
  </EditorPage>;
}
