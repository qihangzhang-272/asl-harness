import React,{useMemo,useRef,useState,useEffect} from 'react';
import {createPortal} from 'react-dom';
import {ArrowUpRight,Code2,Link2,Pencil,Plus,Search,Trash2,X} from 'lucide-react';
import MermaidView from './MermaidView.jsx';
import {editFlowchart,flowchartItems} from './mermaid-document.mjs';
import {structureItems,editStructure} from './mermaid-structure.mjs';
import {renderDiagram} from './mermaid-render.mjs';

// Every visual edit patches the Markdown through the existing render and save gate.
export default function MermaidEdit({source,onChange,nodes=[],candidates=nodes,onNode,onSource,compact=false,selectedId,onExpand,expanded,empty=false}) {
  const items=useMemo(()=>flowchartItems(source),[source]);
  const structure=useMemo(()=>structureItems(source),[source]);
  const [target,setTarget]=useState(null),[from,setFrom]=useState(''),[query,setQuery]=useState('');
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const menu=useRef(null),latest=useRef(source),active=useRef(true),pending=useRef(false);
  latest.current=source;
  useEffect(()=>{setTarget(null);setFrom('');setError('');},[source]);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  useEffect(()=>{
    const key=event=>{if(event.key==='Escape'){setTarget(null);setFrom('');}};
    const outside=event=>{if(menu.current&&!menu.current.contains(event.target))setTarget(null);};
    window.addEventListener('keydown',key);window.addEventListener('pointerdown',outside);
    return()=>{window.removeEventListener('keydown',key);window.removeEventListener('pointerdown',outside);};
  },[]);
  async function change(request,skill){
    if(pending.current)return false;
    pending.current=true;setBusy(true);setError('');const original=source;
    try {
      const next=structure.type?editStructure(original,request):editFlowchart(original,request);await renderDiagram(next);
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
    if(action==='select'&&['node','participant'].includes(item.kind)){
      const node=nodes.find(n=>n.alias===item.id);
      if(node){onNode?.({...node.data.skill,title:node.data.title});setTarget(null);return false;}
    }
  }
  const choices=candidates.filter(n=>!(structure.type?structure.items:items.nodes).some(item=>item.id===n.alias)&&`${n.data.title} ${n.data.skill.id}`.toLowerCase().includes(query.toLowerCase()));
  const skill=['node','participant'].includes(target?.kind)?nodes.find(n=>n.alias===target.id)?.data.skill:null;
  const peers=structure.items.filter(i=>i.kind===target?.kind&&(structure.type==='mindmap'?i.parent===target?.parent:i.scope===target?.scope));
  const peerIndex=peers.findIndex(i=>i.key===target?.key);
  const canMove=structure.type&&structure.structural&&!structure.activation&&target?.kind!=='condition'&&(structure.type!=='mindmap'||target?.parent);
  return <div className={`mermaid-edit ${compact?'is-compact':''}`} aria-busy={busy} onContextMenu={event=>{
    if(!event.target.closest('button,input,textarea,g.node,[data-asl-edit],.flowchart-link,.edgeLabel,.mermaid-edge-hit,.mermaid-label-editor'))open({kind:'canvas'},event);
  }}>
    {from&&<div className="mermaid-connect-status">选择目标节点<button aria-label="取消连接" onClick={()=>setFrom('')}><X size={14}/></button></div>}
    {empty?<div className="mermaid-viewport" aria-label="空白画板"/>:<MermaidView source={source} nodes={nodes} onNode={onNode} items={items} structure={structure} onElement={select} compact={compact} selectedId={selectedId} onExpand={onExpand} expanded={expanded} disabled={busy} onConnect={(from,to)=>change({kind:'connect',from,to})}/>}
    {target&&createPortal(<div ref={menu} className="canvas-menu" role="menu" aria-label="画板菜单" style={{left:target.x,top:target.y}}>
      {target.kind==='canvas'?<>
        {(items.editable||structure.type&&structure.structural)&&<><label className="canvas-menu-search"><Search size={15}/><input autoFocus aria-label="查找要添加的技能" placeholder="查找技能" value={query} onChange={e=>setQuery(e.target.value)}/></label>
          <div className="canvas-skill-options">{choices.map(node=><button role="menuitem" key={node.alias} disabled={busy} onClick={()=>change({kind:'add',id:node.alias,label:node.data.title,parent:target.parent},node.data.skill)}><Plus size={15}/><span>{node.data.title}</span></button>)}{!choices.length&&<p>{query?'没有匹配的技能':'技能已在画板中'}</p>}</div></>}
        {onSource&&<button role="menuitem" onClick={()=>{setTarget(null);onSource();}}><Code2 size={15}/>编辑原文</button>}
      </>:<>
        {skill&&<button role="menuitem" onClick={()=>{setTarget(null);onNode?.(skill);}}><ArrowUpRight size={15}/>查看技能</button>}
        <button role="menuitem" disabled={busy} onClick={()=>{setTarget(null);target.edit?.();}}><Pencil size={15}/>{['node','participant'].includes(target.kind)?'修改名称':'修改备注'}</button>
        {!structure.type&&target.kind==='node'&&<button role="menuitem" disabled={busy} onClick={()=>{setFrom(target.id);setTarget(null);}}><Link2 size={15}/>连接节点</button>}
        {structure.type==='mindmap'&&<button role="menuitem" onClick={()=>setTarget({...target,kind:'canvas',parent:target.key})}><Plus size={15}/>添加子技能</button>}
        {canMove&&[-1,1].map(step=>peers[peerIndex+step]&&<button role="menuitem" key={step} disabled={busy} onClick={()=>change({kind:'move',key:target.key,to:peers[peerIndex+step].key,placement:step<0?'before':'after'})}>{target.kind==='participant'?(step<0?'左移':'右移'):(step<0?'上移':'下移')}</button>)}
        {(!structure.type||structure.structural&&!structure.activation&&!['participant','condition'].includes(target.kind)&&!(structure.type==='mindmap'&&!target.parent))&&<button role="menuitem" className="destructive" disabled={busy} onClick={()=>change({...target,remove:true})}><Trash2 size={15}/>{structure.type==='mindmap'?'移除分支':target.kind==='node'?'移出画板':'移除'}</button>}
        {structure.type&&onSource&&<button role="menuitem" onClick={()=>{setTarget(null);onSource();}}><Code2 size={15}/>编辑原文</button>}
      </>}
    </div>,document.body)}
    {error&&<p className="error-text" role="alert">{error}</p>}
  </div>;
}
