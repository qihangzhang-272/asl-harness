import React,{useEffect,useState} from 'react';
import {ChevronDown,ChevronUp,FileText,MessageCircle} from 'lucide-react';

const states={running:'DeepSeek 正在工作',idle:'DeepSeek 已就绪',completed:'本轮已完成',waiting:'等待确认',failed:'执行出错',unknown:'正在连接会话'};
const tools={running:'执行中',completed:'完成',failed:'失败',interrupted:'已中断'};
export default function RunPeek({api,sessionId,onArtifact,onSkill,onChat}){
  const [activity,setActivity]=useState(null),[error,setError]=useState(''),[open,setOpen]=useState(false);
  useEffect(()=>{
    let stopped=false,timer;setActivity(null);setError('');
    const poll=async()=>{try{const value=await api('activity',{sessionId});if(!stopped){setActivity(value);setError('');}}catch(e){if(!stopped)setError(e.message);}finally{if(!stopped)timer=setTimeout(poll,1500);}};
    if(sessionId)poll();return()=>{stopped=true;clearTimeout(timer);};
  },[sessionId]);
  const status=error?'failed':activity?.status||'unknown';
  return <section className={'asl-run-peek'+(open?' is-open':'')} aria-label="执行进度与产物">
    <button className="asl-run-state" data-status={status} aria-expanded={open} onClick={()=>setOpen(!open)}><span className="status-dot"/><strong>{states[status]||'会话已连接'}</strong><span>{activity?.artifacts.length||0} 个产物</span>{open?<ChevronDown size={15}/>:<ChevronUp size={15}/>}</button>
    {open&&<div className="asl-run-details">{error?<p className="asl-preview-error" role="alert">{error}</p>:<>{activity?.recentSkill&&<button className="asl-btn" onClick={()=>onSkill(activity.recentSkill.id)}>{activity.activeSkill?'正在读取':'最近读取'}：{activity.recentSkill.title}</button>}<p>实际工具调用</p><ol className="asl-run-tools">{activity?.tools.map(tool=><li key={tool.id}><span>{tool.name}</span><span>{tools[tool.status]||tool.status}</span></li>)}</ol>{!activity?.tools.length&&<p className="asl-preview-empty">尚无工具调用。选中节点只会预览技能。</p>}<p>已保存产物</p><div className="asl-run-artifacts">{activity?.artifacts.map(item=><button key={item.path} className="asl-run-artifact" title={item.path} onClick={()=>onArtifact(item.path)}><FileText size={15}/><span className="artifact-title">{item.title}</span></button>)}{!activity?.artifacts.length&&<p className="asl-preview-empty">尚未生成产物。保存成功的文件会显示在这里。</p>}</div></>}<button className="asl-btn" onClick={onChat}><MessageCircle size={14}/>查看原生对话</button></div>}
  </section>;
}
