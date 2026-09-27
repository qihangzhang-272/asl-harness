import React, {useState} from 'react';
import {RotateCw, ChevronRight, Plug, Plus, Layers3, Check, CircleAlert, Power, ArrowUpRight} from 'lucide-react';
import McpPanel from './McpPanel.jsx';

const baseName=value=>(value||'').split(/[\\/]/).filter(Boolean).pop();
const argsFor=item=>({workspace:item.workspace, mode:item.mode, host:item.host,
  ...(item.scope==='user' ? (item.skillsDir?{skillsDir:item.skillsDir}:{}) : {project:item.project})});

export default function AgentPage({native, catalog, busy, Tag, onConnect, onSetup, onOpen, refresh, task, api, hostId, setHostId}) {
  const [mcp,setMcp]=useState(null);
  const [pending,setPending]=useState(null);
  const [notice,setNotice]=useState('');
  if(mcp)return <McpPanel host={mcp.id} name={mcp.name} initialProject={mcp.project} initialScope={mcp.scope} projects={native?.projects} onClose={()=>setMcp(null)} onChanged={refresh}/>;
  const host=native?.hosts.find(h=>h.id===hostId);
  const installed=(native?.connections||[]).filter(c=>c.host===hostId);
  async function update(item) {
    let result;
    const values=argsFor(item);
    if(item.scope==='user') {
      const plan=await api('run','userSync',values);
      result=await api('run','userSync',{...values,expected:plan.fingerprint,apply:true});
    } else if(item.scope==='preset') result=await api('run','preset',{workspace:item.workspace,mode:item.mode,basePreset:item.basePreset,output:item.project});
    else result=await api('run','project',values);
    if(!result.canceled){setNotice('已更新');await refresh();}
  }
  async function prepareStop(item) {
    const action=item.scope==='user'?'userSync':'disconnect';
    const values={...argsFor(item),...(item.scope==='user'?{remove:true}:{scope:item.scope})};
    const plan=await api('run',action,values);
    setPending({item,action,values,plan});
  }
  async function stop() {
    const result=await api('run',pending.action,{...pending.values,expected:pending.plan.fingerprint,apply:true});
    if(!result.canceled){setPending(null);setNotice('已停用，原技能库不变');await refresh();}
  }
  return <section className="agent-manager">
    <div className="page-heading"><h1>Agent</h1><button disabled={busy} onClick={()=>refresh()} aria-label="刷新 Agent 状态"><RotateCw size={17}/></button></div>
    <div className="agent-tabs" role="tablist" aria-label="Agent">
      {native?.hosts.map(h=><button role="tab" aria-selected={h.id===hostId} className={h.id===hostId?'active':''} key={h.id} onClick={()=>{setHostId(h.id);setPending(null);setNotice('');}}><span className={'host-symbol '+h.id}>{h.name[0]}</span>{h.name}<small>{(native.connections||[]).filter(c=>c.host===h.id).length}</small></button>)}
    </div>
    {!host?<p role="status">正在读取本机配置…</p>:<>
      <header className="host-heading"><div><h2>{host.name}</h2><span className="muted">{host.configured?'已检测到本机配置':host.directoryFound?'已检测到目录':'尚未检测到配置'}</span></div>
        <button className="primary" disabled={busy||!catalog?.modes.length||!host.scopes.length} onClick={()=>onConnect({host:host.id})}><Plus size={16}/>添加工作模式</button></header>
      {notice&&<p role="status" className="connection-notice"><Check size={16}/>{notice}</p>}
      {installed.length?<div className="installed-modes">{installed.map(item=><article className="installed-mode" key={item.id}>
        <div className="installed-mode-heading"><span className="installed-mode-icon"><Layers3 size={23}/></span><div><button className="plain-title" onClick={()=>onOpen(item)}>{item.title}<ChevronRight size={15}/></button><small>{item.scope==='user'?'默认模式':item.scope==='preset'?'DeepSeek 预设':baseName(item.project)} · {item.skills.length} 个技能</small></div>
          <Tag tone={item.status==='configured'?'green':'warning'}>{({configured:'配置已核对',outdated:'可同步更新',attention:'需检查'})[item.status]}</Tag></div>
        {!!item.issues.length&&<p className="error-text">{item.issues[0]}</p>}
        {item.discovery==='requires-connection'&&<p className="inline-note">使用了自选目录，尚未确认 Agent 能发现它。</p>}
        <div className="installed-mode-actions">
          <button onClick={()=>onOpen(item)}>查看模式<ArrowUpRight size={14}/></button>
          <button disabled={busy||item.status==='attention'} onClick={()=>task(()=>update(item))}><RotateCw size={14}/>更新</button>
          <button onClick={()=>onSetup({values:{...argsFor(item),scope:item.scope}})}>检查依赖</button>
          <button className="disconnect-button" disabled={busy||item.status==='attention'} onClick={()=>task(()=>prepareStop(item))}><Power size={14}/>停用</button>
        </div>
        <details className="connection-details"><summary>配置详情</summary><p>本地位置：{item.location}</p><p>模式库：{item.workspace}</p><div className="connection-tags">{item.skills.map(id=><Tag key={id}>{id}</Tag>)}</div><small>已核对配置文件；尚未通过真实 Agent 任务验证。</small></details>
      </article>)}</div>:<div className="agent-empty"><Layers3 size={32}/><h3>还没有工作模式</h3>{!catalog?.modes.length&&<span className="muted">连接模式库后可在这里添加</span>}</div>}
      {pending&&<section className="disconnect-preview" aria-label="停用确认"><div><CircleAlert size={21}/><h3>停用 {pending.item.title}？</h3></div><p>原技能库、账号和其他配置保持不变。</p><details><summary>涉及的文件</summary><pre>{(Array.isArray(pending.plan.paths)?pending.plan.paths:[...pending.plan.items.filter(i=>i.action==='remove').map(i=>i.path),pending.plan.paths.instructions]).join('\n')}</pre></details><div className="heading-actions"><button onClick={()=>setPending(null)}>取消</button><button disabled={busy} onClick={()=>task(stop)}>确认停用</button></div></section>}
      <section className="host-mcp"><div className="field-heading"><h2>MCP</h2>{['codex-app','claude-code'].includes(host.id)&&<button onClick={()=>setMcp(host)}><Plug size={16}/>管理 MCP</button>}</div>
        <div className="mcp-summary-list">{(native.mcpSources||[]).filter(s=>s.host===host.id).map(s=><button key={s.scope+':'+s.project} onClick={()=>setMcp({...host,scope:s.scope,project:s.project})}><Plug size={18}/><div><strong>{s.scope==='user'?'用户配置':baseName(s.project)}</strong><small>{s.error||s.servers.map(server=>server.name).join(' · ')}</small></div><ChevronRight size={16}/></button>)}</div>
        {!['codex-app','claude-code'].includes(host.id)&&<><div className="connection-tags">{host.connections?.map(n=><Tag key={n}>{n}</Tag>)}</div><p className="muted">MCP 请在 {host.name} 内管理。</p></>}
        {['codex-app','claude-code'].includes(host.id)&&!(native.mcpSources||[]).some(s=>s.host===host.id)&&<span className="muted">尚未检测到 MCP 配置</span>}
      </section>
    </>}
  </section>;
}
