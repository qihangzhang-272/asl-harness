import React,{useContext,useState} from 'react';
import {ArrowUpRight,History,MessageSquare,Link2,X} from 'lucide-react';
import {LibraryContext} from './SkillRelationships.jsx';
import FileHistory from './FileHistory.jsx';
import './feedback.css';

export const blankFeedback=initial=>({scope:initial?.scope||'case',target:initial?.target||'',revision:'',file:'',followUp:''});
const scopes=[['case','本次结果','只调整这次的交付，不改变长期能力。'],['skill','一项能力','以后使用这项能力时，都遵循这条反馈。'],['mode','工作模式','调整这个场景中的能力选择或配合方式。'],['profile','工作偏好','影响所有工作模式，需要明确是长期偏好。']];

export default function FeedbackDetails({record,onChange,editing,busy,readOnly,saved,onOpen,onHandoff,workspace,api,children}){
  const context=useContext(LibraryContext),catalog=context?.catalog;
  const [history,setHistory]=useState(false),[historyFile,setHistoryFile]=useState(''),[viewLinked,setViewLinked]=useState(false);
  if(!record)return <><section className="feedback-unassigned"><MessageSquare size={16}/><span>这条记录还没有指定作用范围。</span>{editing&&!readOnly&&<button onClick={()=>onChange(blankFeedback())}>补充作用范围</button>}</section>{children}</>;
  const scope=scopes.find(item=>item[0]===record.scope),objects=record.scope==='skill'?catalog?.skills:record.scope==='mode'?catalog?.modes:[];
  const target=objects?.find(item=>item.id===record.target),file=record.scope==='profile'?'PROFILE.md':`${record.scope}s/${record.target}/${record.scope==='skill'?'SKILL.md':'MODE.md'}`;
  const missing=record.scope!=='case'&&record.scope!=='profile'&&!target;
  function retarget(scope,target=''){
    if((record.revision||record.followUp)&&!window.confirm('更换作用对象会清除已关联的修改和核对记录，继续？'))return;
    onChange({...blankFeedback({scope,target})});setHistory(false);setViewLinked(false);
  }
  return <section className="feedback-details" aria-label="反馈作用与处理">
    <div className="feedback-scope-heading"><h2>这条反馈，应该改变什么</h2>{!editing&&<span>{scope?.[1]||'待确认范围'}</span>}</div>
    {editing?<>
      <div className="feedback-scope-options" role="group" aria-label="反馈作用范围">{scopes.map(([key,label])=><button key={key} disabled={busy||readOnly} aria-pressed={record.scope===key} onClick={()=>{if(record.scope!==key)retarget(key);}}>{label}</button>)}</div>
      <p className="feedback-scope-help">{scope?.[2]}</p>
      {['skill','mode'].includes(record.scope)&&<label className="field"><span>{record.scope==='skill'?'对应能力':'对应工作模式'}</span><select aria-label="反馈作用对象" disabled={busy||readOnly} value={record.target} onChange={event=>retarget(record.scope,event.target.value)}><option value="">请选择对象</option>{missing&&record.target&&<option value={record.target}>{record.target} · 已不在当前库</option>}{objects?.map(item=><option value={item.id} key={item.id}>{item.title}</option>)}</select></label>}
    </>:<p className="feedback-scope-help">{record.scope==='case'?'这次交付的调整，未要求修改长期能力。':record.scope==='profile'?'作用于所有模式的长期工作偏好。':target?.title||`原对象 ${record.target} 已不在当前库。`}</p>}
    {!editing&&record.scope!=='case'&&!missing&&<button className="feedback-object-link" onClick={()=>onOpen({scope:record.scope,target:record.target})}>查看{scope?.[1]}<ArrowUpRight size={14}/></button>}
    <div className="feedback-body">{children}</div>
    {record.scope!=='case'&&(!missing||record.revision)&&<div className="feedback-follow-up">
      <div className="feedback-section-heading"><h3>后续改了什么</h3>{record.revision?<span><Link2 size={13}/>已关联修改</span>:<span>尚未关联修改</span>}</div>
      {record.revision?<div className="feedback-linked-revision"><button disabled={busy} onClick={()=>{setViewLinked(!viewLinked);setHistory(false);}}>{viewLinked?'收起实际变化':'查看实际变化'}<History size={14}/></button><small>{record.revision.slice(0,8)} · {record.file.split('/').at(-1)}</small>{editing&&<button aria-label="移除关联版本" disabled={busy} onClick={()=>{onChange({...record,revision:'',file:'',followUp:''});setViewLinked(false);}}><X size={14}/></button>}</div>:editing&&!readOnly&&<button disabled={busy||missing} onClick={()=>{setHistory(!history);setHistoryFile(file);setViewLinked(false);}}>从已有版本中选择<History size={14}/></button>}
      {history&&<><p className="feedback-history-help">选一次真实修改来对照反馈。未留下版本的内容，请先在 Agent 中记录。</p>{record.scope==='mode'&&<select aria-label="模式变更文件" value={historyFile} onChange={event=>setHistoryFile(event.target.value)}><option value={file}>模式说明</option><option value={`modes/${record.target}/mode.yaml`}>成员与组织</option></select>}<FileHistory key={historyFile} workspace={workspace} api={api} file={historyFile} onClose={()=>setHistory(false)} onSelect={value=>{onChange({...record,...value});setHistory(false);setViewLinked(true);}}/></>}
      {viewLinked&&record.revision&&<FileHistory key={record.revision+record.file} workspace={workspace} api={api} file={record.file} revision={record.revision} onClose={()=>setViewLinked(false)}/>}
      {record.revision&&(editing?<label className="field"><span>后来如何核对</span><textarea rows={2} maxLength={8000} aria-label="反馈核对记录" disabled={busy} value={record.followUp} onChange={event=>onChange({...record,followUp:event.target.value})} placeholder="记录核对方法和看到的结果，例如在新会话中再次尝试后的表现。"/></label>:record.followUp?<p className="feedback-check-note">{record.followUp}</p>:<p className="feedback-scope-help">还没有补充核对结果。</p>)}
      {record.followUp&&<small className="feedback-proof-boundary">核对结果由记录者填写，不代表 App 已执行或验证这项任务。</small>}
    </div>}
    {saved&&!readOnly&&<button className="feedback-handoff" disabled={busy} onClick={onHandoff}>交给 Agent 继续处理<ArrowUpRight size={14}/></button>}
  </section>;
}
