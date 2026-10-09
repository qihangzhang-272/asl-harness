import React,{useEffect,useRef,useState} from 'react';
import {ArrowUpRight,LoaderCircle,RotateCw} from 'lucide-react';
import EditorPage,{useLeaveGuard} from './EditorPage.jsx';
import './guide.css';

export default function EnvironmentGuide({workspace,mode,repository,api,read,onClose,onVerified}) {
  const [context,setContext]=useState(null),[agents,setAgents]=useState([]);
  const [goal,setGoal]=useState(''),[submittedGoal,setSubmittedGoal]=useState('');
  const [loading,setLoading]=useState(true),[pending,setPending]=useState(false);
  const [session,setSession]=useState(null),[error,setError]=useState('');
  const live=useRef(true),generation=useRef(0);
  const leave=useLeaveGuard(goal.trim()!==submittedGoal,pending);
  useEffect(()=>{live.current=true;start();return()=>{live.current=false;};},[]);
  function start(){
    const token=++generation.current;
    setLoading(true);setError('');
    read('agent-guide','读取 Agent',async call=>{
      try{
        const [report,available]=await Promise.all([
          call('run','guide',{workspace,...(mode?{mode}:{})}),call('assistants'),
        ]);
        if(!live.current||generation.current!==token)return;
        setContext(report);setAgents(available.filter(item=>item.available));
      }catch(failure){if(live.current&&generation.current===token)setError({step:'read',failure});}
      finally{if(live.current&&generation.current===token)setLoading(false);}
    });
  }
  async function launch(agent){
    if(pending||loading||!context)return;
    setPending(true);setError('');
    try{
      const result=await api('organize',agent.id,{workspace,...(mode?{mode}:{}),goal,...(repository?{snapshot:repository.snapshot}:{})});
      if(!live.current)return;
      if(!result.canceled){setSession({...result,name:agent.name});setSubmittedGoal(goal.trim());}
    }catch(failure){if(live.current)setError({step:'launch',agent,failure});}
    finally{if(live.current)setPending(false);}
  }
  function verify(){
    setPending(true);setError('');
    read('agent-guide','检查整理结果',async call=>{
      try{
        if(session){const status=await api('setupStatus',session.id);if(live.current)setSession(previous=>({...previous,...status}));}
        await call('run','describe',{workspace});
        if(live.current)await onVerified(workspace);
      }catch(failure){if(live.current)setError({step:'verify',failure});}
      finally{if(live.current)setPending(false);}
    });
  }
  function retry(){
    if(error.step==='launch')return launch(error.agent);
    if(error.step==='verify')return verify();
    start();
  }
  return <EditorPage title="整理模式" onClose={()=>leave(onClose)}>
    <section className="environment-guide" aria-label="Agent 整理入口">
      <label className="field"><span>想怎么整理</span><textarea rows={3} maxLength={2000} value={goal} onChange={event=>setGoal(event.target.value)} placeholder="也可以直接在 Agent 中说明"/></label>
      <div className="guide-agents">
        {agents.map(agent=><button className="primary" key={agent.id} disabled={loading||pending||!context} onClick={()=>launch(agent)}>在 {agent.name.replace(' CLI','')} 中继续<ArrowUpRight size={16}/></button>)}
        {loading?<span role="status"><LoaderCircle size={16} className="spin"/>正在检查 Agent…</span>:!agents.length&&!error?<p>未发现可启动的 Agent</p>:null}
      </div>
      {session&&<p role="status">{session.status==='failed'?'会话未完成，可重新打开。':session.status==='ended'?'会话已结束，请检查整理结果。':'已在 '+session.name.replace(' CLI','')+' 打开，可直接对话。'}</p>}
      {error&&<><p className="error-text" role="alert">{error.step==='launch'?'未能打开 Agent，目标已保留。':error.step==='verify'?'未能读取整理结果。':'未能读取 Agent。'}<button className="text-button" disabled={loading||pending} onClick={retry}>重试</button></p><details className="guide-cli"><summary>查看详情</summary><pre>{JSON.stringify({message:error.failure.diagnostic||error.failure.message,code:error.failure.code,details:error.failure.details},null,2)}</pre></details></>}
      {context?.cli&&<details className="guide-cli"><summary>其他 Agent · CLI</summary><code>{context.cli} cli.describe</code></details>}
    </section>
    <div className="dialog-actions">
      <button disabled={loading||pending} onClick={start}><RotateCw size={16}/>重新检查</button>
      <button disabled={pending||loading} onClick={verify}><RotateCw size={16} className={pending?'spin':''}/>查看整理结果</button>
    </div>
  </EditorPage>;
}
