import React,{useEffect,useRef,useState} from 'react';
import {FolderOpen,RotateCw} from 'lucide-react';
import EditorPage from './EditorPage.jsx';

export default function SkillUpdate({workspace,item,api,onClose,onReview}){
  const [url,setUrl]=useState(item.source?.startsWith('https://github.com/')?item.source:''),[candidates,setCandidates]=useState([]),[selected,setSelected]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[checked,setChecked]=useState(false);
  const live=useRef(true);
  useEffect(()=>()=>{live.current=false;},[]);
  async function read(local=false){
    setBusy(true);setError('');setChecked(false);setCandidates([]);setSelected('');
    try{
      const directory=local?await api('choose','skillFolder'):null;
      if(local&&!directory)return;
      const report=await (local?api('localSkills',directory,true):api('githubSkills',url.trim(),true));
      if(!live.current)return;
      const matches=report.skills.filter(skill=>skill.id===item.id);
      setCandidates(matches);setSelected(matches[0]?.source||'');setChecked(true);
    }catch(error){if(live.current)setError(error.message);}finally{if(live.current)setBusy(false);}
  }
  async function compare(){
    const candidate=candidates.find(skill=>skill.source===selected);
    if(!candidate)return;
    setBusy(true);setError('');
    try{
      const request={operation:'skill.import',id:item.id,expected:item.fingerprint,source:candidate.source,...(candidate.origin?{sourceOrigin:candidate.origin}:{})};
      const preview=await api('run','edit',{workspace,request});
      if(live.current)onReview({...request,expectedSource:preview.sourceFingerprint},preview);
    }catch(error){if(live.current)setError(error.message);}finally{if(live.current)setBusy(false);}
  }
  return <EditorPage title={`${item.title} · 来源与更新`} onClose={onClose}>
    <section className="skill-update" aria-label="单项能力版本比较">
      <h2>先比较，再决定替换</h2><p>读取来源不会修改本地。选定一份版本后，先查看哪些文件不同、会影响哪些模式。</p>
      {item.source&&<p className="skill-source-address">当前来源：<span>{item.source}</span></p>}
      <label className="field"><span>GitHub 来源地址</span><input aria-label="能力更新来源地址" value={url} disabled={busy} onChange={event=>{setUrl(event.target.value);setChecked(false);setCandidates([]);}} placeholder="https://github.com/…"/></label>
      <div className="heading-actions"><button disabled={busy||!url.trim()} onClick={()=>read()}><RotateCw size={15}/>读取来源版本</button><button disabled={busy} onClick={()=>read(true)}><FolderOpen size={15}/>选择本地版本</button></div>
      {busy&&!candidates.length&&<div className="history-skeleton" role="status" aria-label="正在读取候选版本"><i/><i/><i/></div>}
      {checked&&!candidates.length&&<p className="inline-note">这份来源中没有找到同名能力“{item.id}”。可检查地址或选择其他本地版本。</p>}
      {!!candidates.length&&<div className="skill-update-candidates"><h3>找到的同名能力</h3>{candidates.map(candidate=><label key={candidate.source}><input type="radio" name="skill-update-source" disabled={busy} checked={selected===candidate.source} onChange={()=>setSelected(candidate.source)}/><span><strong>{candidate.title}</strong><small>{candidate.origin||candidate.source}</small></span></label>)}</div>}
      <p className="skill-update-boundary">这里比较的是选定来源与当前本地版本。没有共同基线时，不能自动判断哪一段是你的本地修改，也不会自动合并。</p>
      {error&&<p className="error-text" role="alert">{error}</p>}
    </section><div className="dialog-actions"><button disabled={busy} onClick={onClose}>保留本地版本</button><button className="primary" disabled={busy||!selected} onClick={compare}>比较这份版本</button></div>
  </EditorPage>;
}
