import React,{useMemo,useRef,useState,useEffect} from 'react';
import {createPortal} from 'react-dom';
import {ArrowUpRight,Code2,Link2,Pencil,Plus,Search,Trash2,X} from 'lucide-react';
import MermaidView from './MermaidView.jsx';
import {editFlowchart,flowchartItems} from './mermaid-document.mjs';
import {renderDiagram} from './mermaid-render.mjs';

// Every visual edit patches the Markdown through the existing render and save gate.
export default function MermaidEdit({source,onChange,nodes=[],candidates=nodes,onNode,onSource,compact=false,selectedId,onExpand,expanded,empty=false}) {
  const items=useMemo(()=>flowchartItems(source),[source]);
  const [target,setTarget]=useState(null),[from,setFrom]=useState(''),[query,setQuery]=useState('');
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const menu=useRef(null),latest=useRef(source),active=useRef(true),pending=useRef(false);
  latest.current=source;
  useEffect(()=>{setTarget(null);setFrom('');setError('');},[source]);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  useEffect(()=>{
    const key=event=>{if(event.key==='Escape'){setTarget(null);setFrom('');}};
    const outside=event=>{if(!menu.current?.contains(event.target))setTarget(null);};
    window.addEventListener('keydown',key);window.addEventListener('pointerdown',outside);
    return()=>{window.removeEventListener('keydown',key);window.removeEventListener('pointerdown',outside);};
  },[]);
  async function change(request,skill){
    if(pending.current)return false;
    pending.current=true;setBusy(true);setError('');const original=source;
    try {
      const next=editFlowchart(original,request);await renderDiagram(next);
      if(!active.current)return false;
      if(latest.current!==original)throw new Error('图已改变，请重新选择');
      await onChange(next,skill);
      if(!active.current)return false;
      setTarget(null);setFrom('');return true;
    }catch(e){if(active.current)setError(e.message);return false;}
    finally{pending.current=false;if(active.current)setBusy(false);}
  }
  function open(item,event){
    event.preventDefault();event.stopPropagation();setQuery('');setError('');
    const rect=event.currentTarget.getBoundingClientRect();
    setTarget({...item,x:Math.max(8,Math.min(window.innerWidth-304,event.clientX||rect.x)),y:Math.max(8,Math.min(window.innerHeight-360,event.clientY||rect.y))});
  }
  function select(item,action,event){
    if(pending.current)return false;
    if(action==='commit')return change(item);
    if(action==='context'){open(item,event);return false;}
    if(from&&item.kind==='node'){change({kind:'connect',from,to:item.id});return false;}
    if(action==='select'&&item.kind==='node'){
      const node=nodes.find(n=>n.alias===item.id);
      if(node)onNode?.({...node.data.skill,title:node.data.title});
      setTarget(null);return false;
    }
  }
  const choices=candidates.filter(n=>!items.nodes.some(item=>item.id===n.alias)&&`${n.data.title} ${n.data.skill.id}`.toLowerCase().includes(query.toLowerCase()));
  const skill=target?.kind==='node'?nodes.find(n=>n.alias===target.id)?.data.skill:null;
  return <div className={`mermaid-edit ${compact?'is-compact':''}`} aria-busy={busy} onContextMenu={event=>{
    if(!event.target.closest('button,input,textarea,g.node,.flowchart-link,.edgeLabel,.mermaid-edge-hit,.mermaid-label-editor'))open({kind:'canvas'},event);
  }}>
    {from&&<div className="mermaid-connect-status">选择目标节点<button aria-label="取消连接" onClick={()=>setFrom('')}><X size={14}/></button></div>}
    {empty?<div className="mermaid-viewport" aria-label="空白画板"/>:<MermaidView source={source} nodes={nodes} onNode={onNode} items={items} onElement={select} compact={compact} selectedId={selectedId} onExpand={onExpand} expanded={expanded} disabled={busy} onConnect={(from,to)=>change({kind:'connect',from,to})}/>}
    {target&&createPortal(<div ref={menu} className="canvas-menu" role="menu" aria-label="画板菜单" style={{left:target.x,top:target.y}}>
      {target.kind==='canvas'?<>
        {items.editable&&<><label className="canvas-menu-search"><Search size={15}/><input autoFocus aria-label="查找要添加的技能" placeholder="查找技能" value={query} onChange={e=>setQuery(e.target.value)}/></label>
          <div className="canvas-skill-options">{choices.map(node=><button role="menuitem" key={node.alias} disabled={busy} onClick={()=>change({kind:'add',id:node.alias,label:node.data.title},node.data.skill)}><Plus size={15}/><span>{node.data.title}</span></button>)}{!choices.length&&<p>{query?'没有匹配的技能':'技能已在画板中'}</p>}</div></>}
        {onSource&&<button role="menuitem" onClick={()=>{setTarget(null);onSource();}}><Code2 size={15}/>编辑 Mermaid</button>}
      </>:<>
        {skill&&<button role="menuitem" onClick={()=>{setTarget(null);onNode?.(skill);}}><ArrowUpRight size={15}/>查看技能</button>}
        <button role="menuitem" disabled={busy} onClick={()=>{setTarget(null);target.edit?.();}}><Pencil size={15}/>{target.kind==='node'?'修改名称':'修改备注'}</button>
        {target.kind==='node'&&<button role="menuitem" disabled={busy} onClick={()=>{setFrom(target.id);setTarget(null);}}><Link2 size={15}/>连接节点</button>}
        <button role="menuitem" className="destructive" disabled={busy} onClick={()=>change({...target,remove:true})}><Trash2 size={15}/>{target.kind==='node'?'移出画板':'删除连线'}</button>
      </>}
    </div>,document.body)}
    {error&&<p className="error-text" role="alert">{error}</p>}
  </div>;
}
