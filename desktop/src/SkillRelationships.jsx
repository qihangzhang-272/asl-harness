import React,{createContext,useContext,useId,useRef,useState} from 'react';
import {Network,Layers3,ChevronRight,Archive,MessageSquare,ArrowUpRight} from 'lucide-react';
import {skillRelations,affectedLocations} from './skill-relations.mjs';
import './relationships.css';

export const LibraryContext=createContext(null);
const locationLabel=item=>item.scope==='user'?'所有项目':item.scope==='preset'?'工作模式':(item.project||item.location||'').split(/[\\/]/).filter(Boolean).at(-1);

export function ChangeImpact({modes=[],onNavigate}){
  const context=useContext(LibraryContext);
  if(!context)return null;
  const locations=affectedLocations(context.connections,context.catalog?.environment||context.workspace,modes);
  return <div className="change-impact">
    {!!modes.length&&<div><strong>这次修改涉及</strong><span>{modes.map(id=>context.catalog.modes.find(mode=>mode.id===id)?.title||id).join('、')}</span></div>}
    {!!locations.length&&<div><strong>保存后需要更新 {locations.length} 个配置位置</strong><ul>{locations.map(item=><li key={item.id}>{context.hostName(item.host)} · {locationLabel(item)}</li>)}</ul>{onNavigate&&<button onClick={()=>onNavigate(()=>context.onAgent(locations[0].host))}>前往 Agent 更新<ArrowUpRight size={14}/></button>}</div>}
    {!!modes.length&&!locations.length&&<p>这些模式目前没有已记录的 Agent 配置位置。</p>}
  </div>;
}

export default function SkillRelationships({item,leave}){
  const context=useContext(LibraryContext),popover=useRef(null),trigger=useRef(null),id=useId();
  const [retiring,setRetiring]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[expanded,setExpanded]=useState(false);
  if(!context||!Array.isArray(item.usedBy))return null;
  const relation=skillRelations(context.catalog,item.id),{modes,dependencies,dependents}=relation;
  const blocked=!!modes.length||!!dependents.length||context.catalog.skills.length===1;
  const title=key=>context.catalog.skills.find(skill=>skill.id===key)?.title||key;
  const navigate=action=>leave(()=>{popover.current?.hidePopover();action();});
  function open(){
    if(popover.current.matches(':popover-open'))return;
    const box=trigger.current.getBoundingClientRect(),width=Math.min(440,window.innerWidth-32);
    popover.current.style.left=`${Math.max(16,Math.min(box.left,window.innerWidth-width-16))}px`;
    popover.current.style.top=`${Math.min(box.bottom+8,window.innerHeight-240)}px`;
    popover.current.style.maxHeight=`${window.innerHeight-Math.min(box.bottom+8,window.innerHeight-240)-16}px`;
    setRetiring(false);setError('');popover.current.scrollTop=0;
  }
  async function archive(){
    setBusy(true);setError('');
    try{await context.onArchive(item);popover.current?.hidePopover();}
    catch(error){setError(error.message);}finally{setBusy(false);}
  }
  return <div className="skill-context-actions">
    <button ref={trigger} className="relation-trigger" aria-haspopup="dialog" aria-expanded={expanded} popoverTarget={id} aria-controls={id} onClick={open}><Network size={15}/>使用关系<span>{modes.length?`${modes.length} 个模式`:'未加入模式'}</span></button>
    <button onClick={()=>navigate(()=>context.onFeedback({scope:'skill',target:item.id}))}><MessageSquare size={14}/>反馈</button>
    <div ref={popover} id={id} popover="auto" onToggle={event=>setExpanded(event.newState==='open')} className="relationship-popover" role="dialog" aria-label={`${item.title}的使用关系`}>
      <header><Network size={18}/><div><strong>{item.title}</strong><span>同一份能力，由这些模式共同使用</span></div></header>
      <div className="relationship-body">
        {modes.length?<div className="relationship-modes">{modes.map(mode=><div className={mode.id===context.modeId?'is-current':''} key={mode.id}>
          <button onClick={()=>navigate(()=>context.onMode(mode.id))}><Layers3 size={17}/><span><strong>{mode.title}</strong><small>{mode.direct?'直接选择这项能力':`由 ${mode.via.slice(0,-1).map(title).join(' → ')} 带入`}</small></span><ChevronRight size={15}/></button>
          {retiring&&!context.readOnly&&<button className="relation-edit" onClick={()=>navigate(()=>context.onEditMode(mode.id))}>编辑模式，检查引用</button>}
        </div>)}</div>:<p className="relationship-empty">尚未被工作模式使用。仍可阅读和保留，不需要为此清理。</p>}
        {(!!dependencies.length||!!dependents.length)&&<section className="relationship-dependencies"><h3>能力依赖</h3>{!!dependencies.length&&<p>它需要：{dependencies.map(skill=>skill.title||skill.id).join('、')}</p>}{!!dependents.length&&(retiring?<div className="relation-dependent-links"><p>依赖它的能力</p>{dependents.map(skill=><button key={skill.id} aria-label={`检查引用：${skill.title||skill.id}`} onClick={()=>navigate(()=>context.onSkill(skill.id))}><span>{skill.title||skill.id}</span>检查引用<ChevronRight size={14}/></button>)}</div>:<p>依赖它的能力：{dependents.map(skill=>skill.title||skill.id).join('、')}</p>)}<small>这是必需能力的引用，区别于画板里的工作配合关系。</small></section>}
        {retiring?<section className="retirement-review" aria-label="归档条件"><h3>归档前，先确认用途</h3><p>{modes.length||dependents.length?'仍有引用。先在对应模式或能力中处理引用，再回到这里归档。':context.catalog.skills.length===1?'这是库中的最后一项能力，暂时不能归档。':'完整能力包会从活动库移入归档，之后可以在“归档”中找回。'}</p>
          <div><button disabled={busy} onClick={()=>setRetiring(false)}>暂时保留</button><button disabled={blocked||busy||context.readOnly} onClick={()=>leave(archive)}>继续归档</button></div>
        </section>:<ChangeImpact modes={modes.map(mode=>mode.id)} onNavigate={navigate}/>}
        {error&&<p className="error-text" role="alert">{error}</p>}
      </div>
      {!context.readOnly&&!retiring&&<footer><span>修改这项能力会影响所有使用者</span><button onClick={()=>setRetiring(true)}><Archive size={14}/>归档技能</button></footer>}
    </div>
  </div>;
}
