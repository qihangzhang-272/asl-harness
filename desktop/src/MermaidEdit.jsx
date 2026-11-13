import React,{useMemo,useRef,useState,useEffect} from 'react';
import {createPortal} from 'react-dom';
import {ArrowUpRight,Code2,Link2,Pencil,Plus,Search,Trash2,X,Undo2,Redo2,Copy,Clipboard} from 'lucide-react';
import MermaidView from './MermaidView.jsx';
import {editFlowchart,flowchartItems,diagramTemplates} from './mermaid-document.mjs';
import {structureItems,editStructure} from './mermaid-structure.mjs';
import {copyFlowSelection,pasteFlowSelection,deleteFlowSelection} from './mermaid-clipboard.mjs';
import {renderDiagram} from './mermaid-render.mjs';

// Every visual edit patches the Markdown through the existing render and save gate.
export default function MermaidEdit({source='',onChange,onCreate,onUndo,onRedo,nodes=[],candidates=nodes,onNode,onSource,onSelection,compact=false,selectedId,onExpand,expanded,empty=false}) {
  const items=useMemo(()=>flowchartItems(source),[source]);
  const structure=useMemo(()=>structureItems(source),[source]);
  const [target,setTarget]=useState(null),[from,setFrom]=useState(''),[query,setQuery]=useState('');
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [selection,setSelection]=useState([]),canvas=useRef(null),pasteCount=useRef({text:'',count:0});
  useEffect(()=>{onSelection?.(selection);},[selection,onSelection]);
  const boundNodes=useMemo(()=>{
    const mapped=new Map(nodes.map(node=>[node.alias,node]));
    for(const [,alias,json] of source.matchAll(/^\s*%% asl-bind ([\w-]+) (\[[^\r\n]*\])/gm)){
      try{const ids=JSON.parse(json),node=candidates.find(n=>n.data.skill.id===ids[0]);if(node)mapped.set(alias,{...node,alias,data:{...node.data,skills:ids}});}catch{}
    }
    return [...mapped.values()];
  },[source,nodes,candidates]);
  const menu=useRef(null),latest=useRef(source),active=useRef(true),pending=useRef(false);
  latest.current=source;
  useEffect(()=>{setTarget(null);setFrom('');setError('');},[source]);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  useEffect(()=>{if(target)menu.current?.querySelector('button:not(:disabled)')?.focus();},[target?.kind]);
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
      const next=request.kind==='replace'?request.source:request.kind==='template'?diagramTemplates.find(t=>t.id===request.id).source:structure.type?editStructure(original,request):editFlowchart(original,request);await renderDiagram(next);
      if(!active.current)return false;
      if(latest.current!==original)throw new Error('图已改变，请重新选择');
      if(request.kind==='template')await onCreate(request.id);
      else await onChange(next,skill);
      if(!active.current)return false;
      setTarget(null);setFrom('');return true;
    }catch(e){if(active.current)setError(e.message);return false;}
    finally{pending.current=false;if(active.current)setBusy(false);}
  }
  async function restore(action){
    if(pending.current)return;
    pending.current=true;setBusy(true);setError('');
    try{await action();if(active.current){setTarget(null);canvas.current?.focus();}}
    catch(error){if(active.current)setError(error.message);}
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
    if(from&&['node','participant'].includes(item.kind)){
      change(from.endpoint?{...from,kind:'retarget',id:item.id}:{kind:'connect',from:from.id,to:item.id});return false;
    }

  }
  function openSkill(item){
    const node=boundNodes.find(n=>n.alias===item?.id);if(!node)return;
    const ids=node.data.skills;
    if(ids?.length>1){setTarget({kind:'open-skills',skills:ids,x:Math.max(8,window.innerWidth/2-144),y:Math.max(8,window.innerHeight/2-120)});return;}
    onNode?.(node.data.skill);setTarget(null);
  }
  async function action(name,chosen=selection,clipboardEvent){
    if(pending.current)return;
    if(name==='escape'){if(!target&&!from&&!chosen.length&&expanded)onExpand?.();setTarget(null);setFrom('');return;}
    if(name==='undo'){if(onUndo)restore(onUndo);return;}
    if(name==='redo'){if(onRedo)restore(onRedo);return;}
    if(name==='open'){if(chosen.length===1)openSkill(chosen[0]);return;}
    if(name==='source'){onSource?.();return;}
    if(name==='delete'){
      if(!chosen.length)return;
      if(items.editable)change({kind:'replace',source:deleteFlowSelection(source,chosen)});
      else if(chosen.length===1&&canStructure&&!(structure.type==='mindmap'&&!chosen[0].parent))change({...chosen[0],remove:true});
      else setError('此图的结构请使用右键菜单或原文修改。');
      return;
    }
    if(!['copy','cut','paste','duplicate'].includes(name))return;
    if(!items.editable){setError('复制粘贴用于流程图；此图请使用原文或右键结构操作。');return;}
    const original=source,layout=canvas.current?.layout();if(!layout)return;
    try{
      const ids=chosen.filter(i=>i.kind==='node').map(i=>i.id);
      if(name!=='paste'&&!ids.length)return;
      const text=name==='paste'?(clipboardEvent?clipboardEvent.clipboardData.getData('text/plain'):await navigator.clipboard.readText()):copyFlowSelection(source,ids,layout,boundNodes);
      if(name==='copy'||name==='cut'){if(clipboardEvent)clipboardEvent.clipboardData.setData('text/plain',text);else await navigator.clipboard.writeText(text);}
      if(latest.current!==original)throw new Error('图已改变，请重新操作');
      if(name==='cut')await change({kind:'replace',source:deleteFlowSelection(source,chosen)});
      if(name==='paste'||name==='duplicate'){
        const count=pasteCount.current;text===count.text?count.count++:(count.text=text,count.count=1);
        const next=pasteFlowSelection(source,text,layout,name==='duplicate'?32:32*count.count);
        canvas.current?.selectIds(next.ids);await change({kind:'replace',source:next.source});
      }
      if(name==='copy')setTarget(null);
    }catch(error){setError(error.message);}
  }
  const choices=candidates.filter(n=>!(structure.type?structure.items:items.nodes).some(item=>item.id===n.alias)&&`${n.data.title} ${n.data.skill.id}`.toLowerCase().includes(query.toLowerCase()));
  const skill=['node','participant'].includes(target?.kind)?boundNodes.find(n=>n.alias===target.id)?.data.skill:null;
  const peers=structure.items.filter(i=>i.kind===target?.kind&&(i.kind!=='condition'||i.first)&&(structure.type==='mindmap'?i.parent===target?.parent:i.scope===target?.scope));
  const peerIndex=peers.findIndex(i=>i.key===target?.key);
  const canStructure=structure.structural&&!structure.activation;
  const canMove=structure.type&&canStructure&&(target?.kind!=='condition'||target?.first)&&(structure.type!=='mindmap'||target?.parent);
  function addNode(parent){
    const existing=structure.type?structure.items:items.nodes;let n=1;while(existing.some(i=>i.id===`node${n}`))n++;
    return change({kind:'add',id:`node${n}`,label:structure.type==='sequenceDiagram'?'新参与者':'新节点',parent});
  }
  return <div className={`mermaid-edit ${compact?'is-compact':''}`} aria-busy={busy} onContextMenu={event=>{
    if(!event.target.closest('button,input,textarea,g.node,[data-asl-edit],.flowchart-link,.edgeLabel,.mermaid-edge-hit,.mermaid-label-editor'))open({kind:'canvas'},event);
  }}>
    {busy&&<span className="mermaid-save-status" role="status">正在保存…</span>}
    {from&&<div className="mermaid-connect-status">选择目标节点<button aria-label="取消连接" onClick={()=>setFrom('')}><X size={14}/></button></div>}
    {empty?<div className="mermaid-viewport" aria-label="空白画板"/>:<MermaidView source={source} nodes={boundNodes} onNode={onNode} items={items} structure={structure} onElement={select} compact={compact} selectedId={selectedId} onExpand={onExpand} expanded={expanded} disabled={busy} apiRef={canvas} onSelection={setSelection} onAction={action} actions={<><button aria-label="撤销画板修改" title="撤销（Ctrl/⌘+Z）" disabled={busy||!onUndo} onClick={()=>action('undo')}><Undo2 size={15}/></button><button aria-label="重做画板修改" title="重做（Ctrl/⌘+Shift+Z）" disabled={busy||!onRedo} onClick={()=>action('redo')}><Redo2 size={15}/></button></>} onConnect={(from,to,geometry)=>change({kind:'connect',from,to,...geometry})}/>}
    {target&&createPortal(<div ref={menu} className="canvas-menu" role="menu" aria-label="画板菜单" onKeyDown={event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setTarget(null);canvas.current?.focus();return;}
      if(event.target.matches('input'))return;
      const buttons=[...menu.current.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);
      const next={ArrowDown:(index+1)%buttons.length,ArrowUp:(index-1+buttons.length)%buttons.length,Home:0,End:buttons.length-1}[event.key];
      if(next!==undefined){event.preventDefault();buttons[next]?.focus();}
    }} style={{left:target.x,top:target.y,maxHeight:`calc(100vh - ${target.y+8}px)`}}>
      {onUndo&&<button role="menuitem" disabled={busy} onClick={()=>restore(onUndo)}><Undo2 size={15}/>撤销<kbd>Ctrl Z</kbd></button>}
      {onRedo&&<button role="menuitem" disabled={busy} onClick={()=>restore(onRedo)}><Redo2 size={15}/>重做<kbd>Ctrl Shift Z</kbd></button>}
      {target.kind==='open-skills'&&target.skills.map(id=>{const node=candidates.find(n=>n.data.skill.id===id);return node&&<button role="menuitem" key={id} onClick={()=>{setTarget(null);onNode?.(node.data.skill);}}><ArrowUpRight size={15}/>{node.data.title}</button>;})}
      {items.editable&&<>
        {selection.some(i=>i.kind==='node')&&<><button role="menuitem" disabled={busy} onClick={()=>action('copy')}><Copy size={15}/>复制<kbd>Ctrl C</kbd></button><button role="menuitem" disabled={busy} onClick={()=>action('duplicate')}><Copy size={15}/>创建副本<kbd>Ctrl D</kbd></button></>}
        <button role="menuitem" disabled={busy} onClick={()=>action('paste')}><Clipboard size={15}/>粘贴<kbd>Ctrl V</kbd></button>
      </>}
      {target.kind==='templates'?<>
        <button role="menuitem" onClick={()=>setTarget({...target,kind:'canvas'})}>返回</button>
        {diagramTemplates.map(t=><button role="menuitem" key={t.id} disabled={busy} onClick={()=>change({kind:'template',id:t.id})}>{t.title}</button>)}
      </>:target.kind==='skills'?<>
        <button role="menuitem" onClick={()=>setTarget({...target,kind:'canvas'})}>返回</button>
        <label className="canvas-menu-search"><Search size={15}/><input autoFocus aria-label="查找要添加的技能" placeholder="查找技能" value={query} onChange={e=>setQuery(e.target.value)}/></label>
          <div className="canvas-skill-options">{choices.map(node=><button role="menuitem" key={node.alias} disabled={busy} onClick={()=>change({kind:'add',id:node.alias,label:node.data.title,parent:target.parent},node.data.skill)}><Plus size={15}/><span>{node.data.title}</span></button>)}{!choices.length&&<p>{query?'没有匹配的技能':'技能已在画板中'}</p>}</div></>:null}
      {target.kind==='canvas'&&<>
        {onCreate&&<button role="menuitem" onClick={()=>setTarget({...target,kind:'templates'})}><Plus size={15}/>新建图表</button>}
        {(items.editable||structure.type&&canStructure)&&<>
          <button role="menuitem" disabled={busy} onClick={()=>addNode()}><Plus size={15}/>{structure.type==='sequenceDiagram'?'添加参与者':'添加节点'}</button>
          {!!candidates.length&&<button role="menuitem" onClick={()=>setTarget({...target,kind:'skills'})}><Search size={15}/>添加技能</button>}
        </>}
        {items.editable&&['LR','TD'].map((direction,i)=><button role="menuitem" key={direction} disabled={busy} onClick={()=>change({kind:'direction',direction})}>{['横向排列','纵向排列'][i]}</button>)}
        {from&&<button role="menuitem" onClick={()=>{setFrom('');setTarget(null);}}>取消连接</button>}
        {onSource&&<button role="menuitem" onClick={()=>{setTarget(null);onSource();}}><Code2 size={15}/>编辑原文</button>}
      </>}
      {!['canvas','templates','skills','open-skills'].includes(target.kind)&&<>
        {skill&&<button role="menuitem" onClick={()=>openSkill(target)}><ArrowUpRight size={15}/>查看技能</button>}
        <button role="menuitem" disabled={busy} onClick={()=>{setTarget(null);target.edit?.();}}><Pencil size={15}/>{['node','participant'].includes(target.kind)?'修改名称':'修改备注'}</button>
        {!structure.type&&target.kind==='node'&&<button role="menuitem" disabled={busy} onClick={()=>{setFrom({id:target.id});setTarget(null);}}><Link2 size={15}/>连接节点</button>}
        {structure.type==='sequenceDiagram'&&canStructure&&<>
          {target.kind==='participant'&&<>
            <button role="menuitem" onClick={()=>{setFrom({id:target.id});setTarget(null);}}><Link2 size={15}/>发送消息</button>
            <button role="menuitem" disabled={busy} onClick={()=>change({kind:'note',id:target.id})}>添加备注</button>
          </>}
          {target.kind==='message'&&<>
            <button role="menuitem" disabled={busy} onClick={()=>change({kind:'connect',key:target.key,from:target.to,to:target.from,label:'回复'})}>添加回复</button>
            {['from','to'].map((endpoint,i)=><button role="menuitem" key={endpoint} onClick={()=>{setFrom({key:target.key,endpoint});setTarget(null);}}>{['更换发送者','更换接收者'][i]}</button>)}
          </>}
          {['message','note'].includes(target.kind)&&['alt','loop','par'].map((block,i)=><button role="menuitem" key={block} disabled={busy} onClick={()=>change({kind:'wrap',key:target.key,block})}>{['添加条件','添加循环','添加并行'][i]}</button>)}
          {target.kind==='condition'&&['alt','par','critical'].includes(structure.items.find(i=>i.line===target.blockStart)?.block)&&<button role="menuitem" disabled={busy} onClick={()=>change({kind:'branch',key:target.key})}>添加分支</button>}
        </>}
        {structure.type==='mindmap'&&canStructure&&<>
          <button role="menuitem" disabled={busy} onClick={()=>addNode(target.key)}><Plus size={15}/>添加子节点</button>
          {!!candidates.length&&<button role="menuitem" onClick={()=>setTarget({...target,kind:'skills',parent:target.key})}><Plus size={15}/>添加子技能</button>}
        </>}
        {canMove&&[-1,1].map(step=>peers[peerIndex+step]&&<button role="menuitem" key={step} disabled={busy} onClick={()=>change({kind:'move',key:target.key,to:peers[peerIndex+step].key,placement:step<0?'before':'after'})}>{target.kind==='participant'?(step<0?'左移':'右移'):(step<0?'上移':'下移')}</button>)}
        {(!structure.type||canStructure&&!(structure.type==='mindmap'&&!target.parent))&&<button role="menuitem" className="destructive" disabled={busy} onClick={()=>action('delete',selection.length>1?selection:[target])}><Trash2 size={15}/>{structure.type==='mindmap'?'移除分支':target.kind==='participant'?'移除参与者及关联内容':target.kind==='condition'?(target.first?'移除分组及内容':'移除分支及内容'):target.kind==='node'?'移出画板':target.kind==='edge'?'删除连线':'移除'}</button>}
        {structure.type&&onSource&&<button role="menuitem" onClick={()=>{setTarget(null);onSource();}}><Code2 size={15}/>编辑原文</button>}
      </>}
    </div>,document.querySelector('.asl-ws,.asl-desktop')||document.body)}
    {error&&<p className="error-text" role="alert">{error}</p>}
  </div>;
}
