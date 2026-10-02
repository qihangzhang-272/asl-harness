import React,{useMemo,useRef,useState,useEffect} from 'react';
import {Link2,Trash2,X} from 'lucide-react';
import MermaidView from './MermaidView.jsx';
import {editFlowchart,flowchartItems} from './mermaid-document.mjs';
import {renderDiagram} from './mermaid-render.mjs';

// Editing patches the Markdown's Mermaid source; the official renderer owns layout.
export default function MermaidEdit({source,onChange,nodes,onNode,onSource}) {
  const items=useMemo(()=>flowchartItems(source),[source]);
  const [target,setTarget]=useState(null),[from,setFrom]=useState('');
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);const root=useRef(null),latest=useRef(source),active=useRef(true);
  latest.current=source;
  useEffect(()=>{setTarget(null);setFrom('');setError('');},[source]);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  async function change(request){
    if(busy)return false;
    setBusy(true);setError('');const original=source;
    try {const next=editFlowchart(original,request);await renderDiagram(next);if(!active.current)return false;if(latest.current!==original)throw new Error('图已改变，请重新选择');await onChange(next);if(!active.current)return false;setTarget(null);setFrom('');return true;}
    catch(e){setError(e.message);return false;}finally{setBusy(false);}
  }
  function select(item,action,event){
    if(busy)return false;
    if(action==='commit')return change(item);
    if(from&&item.kind==='node'){change({kind:'connect',from,to:item.id});return false;}
    if(action==='select') {const skill=nodes.find(n=>n.alias===item.id)?.data.skill;if(skill)onNode?.(skill);return;}
    const parent=root.current.getBoundingClientRect(),rect=event.currentTarget?.getBoundingClientRect?.()||parent;
    setTarget({...item,x:Math.max(8,Math.min(parent.width-160,(event.clientX||rect.x)-parent.x)),y:Math.max(8,Math.min(parent.height-65,(event.clientY||rect.y)-parent.y))});setError('');
  }
  return <div className="mermaid-edit" ref={root} aria-busy={busy} onDoubleClick={event=>{if(!event.target.closest('button,input,select,form,g.node,path.flowchart-link,.edgeLabel,.mermaid-inline-editor'))onSource?.();}} onContextMenu={event=>{if(!event.target.closest('button,input,select,form,g.node,path.flowchart-link,.edgeLabel,.mermaid-edge-hit,.mermaid-inline-editor')){event.preventDefault();onSource?.();}}}>
    {items.editable&&nodes.some(n=>!items.nodes.some(item=>item.id===n.alias))&&<select aria-label="添加技能节点" disabled={busy} value="" onChange={e=>{const node=nodes.find(n=>n.alias===e.target.value);if(node)change({kind:'add',id:node.alias,label:node.data.title});}}><option value="">添加技能…</option>{nodes.filter(n=>!items.nodes.some(item=>item.id===n.alias)).map(n=><option key={n.alias} value={n.alias}>{n.data.title}</option>)}</select>}
    {from&&<div className="mermaid-connect-status">选择要连接的节点<button aria-label="取消连接" onClick={()=>setFrom('')}><X size={14}/></button></div>}
    <MermaidView source={source} nodes={nodes} onNode={onNode} items={items} onElement={select}/>
    {target&&<div className="mermaid-inline-editor" role="menu" style={{left:target.x,top:target.y}}>
      <div><button type="button" aria-label={target.kind==='node'?'移出图':'删除连线'} disabled={busy} onClick={()=>change({...target,remove:true})}><Trash2 size={15}/></button>
        {target.kind==='node'&&<button type="button" aria-label="连接节点" disabled={busy} onClick={()=>{setFrom(target.id);setTarget(null);}}><Link2 size={15}/></button>}
        <button type="button" aria-label="关闭菜单" disabled={busy} onClick={()=>setTarget(null)}><X size={15}/></button></div>
    </div>}
    {error&&<p className="error-text" role="alert">{error}</p>}
  </div>;
}
