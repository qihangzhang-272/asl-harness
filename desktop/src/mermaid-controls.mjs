import {canvasShortcut} from './mermaid-shortcuts.mjs';

export const selectionKey=item=>['node','participant'].includes(item.kind)&&item.id?`${item.kind}:${item.id}`:item.key||`${item.kind}:${item.index}`;

// Highlight one-hop relationships only. Selection never changes the authored graph.
export function relatedSelection(selection,edges){
  const selectedNodes=new Set(selection.filter(item=>item.kind==='node').map(item=>item.id));
  const selectedEdges=new Set(selection.filter(item=>item.kind==='edge').map(item=>item.index));
  const nodes=new Set(selectedNodes),relatedEdges=new Set();
  for(const edge of edges)if(selectedNodes.has(edge.from)||selectedNodes.has(edge.to)||selectedEdges.has(edge.index)){
    nodes.add(edge.from);nodes.add(edge.to);relatedEdges.add(edge.index);
  }
  return {nodes,edges:relatedEdges};
}

// Transient selection and camera only; document changes still pass through MermaidEdit.
export function attachCanvasControls(viewport,entries,canvas,state,options){
  const section=viewport.closest('.mermaid-view'),byKey=new Map(entries.map(entry=>[selectionKey(entry.item),entry]));
  let gesture=null,space=false,nudging=false,suppress=false;
  const selection=()=>state.keys.map(key=>byKey.get(key)?.item).filter(Boolean);
  const nodeIds=()=>selection().filter(item=>item.kind==='node').map(item=>item.id);
  const open=document.createElement('button');open.className='mermaid-open-skill';open.textContent='打开技能 ↗';open.hidden=true;
  open.onclick=()=>options.onAction('open',selection());viewport.appendChild(open);
  const marquee=document.createElement('div');marquee.className='mermaid-marquee';marquee.hidden=true;viewport.appendChild(marquee);
  function paint(){
    const related=relatedSelection(selection(),options.edges||[]),highlight=state.keys.length>0&&!!options.edges?.length;
    for(const {element,item} of entries){
      const selected=state.keys.includes(selectionKey(item)),connected=item.kind==='node'?related.nodes.has(item.id):item.kind==='edge'?related.edges.has(item.index):false;
      element.classList.toggle('is-selected',selected);element.setAttribute('aria-pressed',String(selected));
      element.classList.toggle('is-related',highlight&&connected&&!selected);
      element.classList.toggle('is-muted',highlight&&!connected&&!selected&&['node','edge'].includes(item.kind));
    }
    const item=selection()[0],entry=item&&byKey.get(selectionKey(item));
    open.hidden=state.keys.length!==1||!options.canOpen(item)||!!gesture||space||state.tool==='hand';
    if(!open.hidden){const rect=entry.element.getBoundingClientRect(),box=viewport.getBoundingClientRect();open.style.left=`${Math.max(8,Math.min(box.width-120,rect.right-box.left-110))}px`;open.style.top=`${Math.max(8,Math.min(box.height-36,rect.top-box.top-34))}px`;}
    viewport.dataset.tool=space?'hand':state.tool;
  }
  function select(keys){state.keys=[...new Set(keys)].filter(key=>byKey.has(key));paint();options.onSelection(selection());}
  function choose(item,event={}){
    const key=selectionKey(item);
    select(event.shiftKey?(state.keys.includes(key)?state.keys.filter(k=>k!==key):[...state.keys,key]):[key]);
  }
  function finishNudge(cancel=false){
    if(!nudging)return;nudging=false;
    if(cancel)canvas.restore();else Promise.resolve(options.commit({kind:'layout',layout:canvas.snapshot()})).then(accepted=>{if(accepted===false){canvas.restore();paint();}});
    paint();
  }
  function keydown(event){
    if(viewport.inert||event.target.closest('.mermaid-shortcut-panel'))return;
    const action=canvasShortcut(event);if(!action)return;
    if(event.target.closest('.mermaid-tools button')&&['nudge','pan-hold','edit'].includes(action))return;
    if(['copy','cut','paste'].includes(action))return;
    event.preventDefault();event.stopPropagation();
    if(action==='pan-hold'){space=true;paint();return;}
    if(action==='escape'){const previous=selection();cancel();finishNudge(true);select([]);options.onAction('escape',previous);return;}
    if(action==='nudge'){
      if(!canvas||!nodeIds().length)return;
      const step=event.shiftKey?10:1,delta={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[event.key];
      if(!delta)return;nudging=true;
      for(const id of nodeIds()){const n=canvas.nodes.get(id);if(n)canvas.place(id,{x:n.position.x+delta[0],y:n.position.y+delta[1]});}
      canvas.route();paint();return;
    }
    if(event.repeat)return;
    if(action==='all')select([...byKey].filter(([,entry])=>['node','participant'].includes(entry.item.kind)).map(([key])=>key));
    else if(action==='select-tool'||action==='hand-tool'){state.tool=action==='hand-tool'?'hand':'select';options.onTool(state.tool);paint();}
    else if(action==='edit')selection()[0]?.edit?.();
    else if(['fit','actual','zoom-in','zoom-out'].includes(action))options.zoom(action);
    else options.onAction(action,selection());
  }
  function keyup(event){if(event.code==='Space'){space=false;paint();}if(event.key.startsWith('Arrow'))finishNudge();}
  function move(event){
    if(!gesture||gesture.id!==event.pointerId)return;
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
    if(Math.hypot(dx,dy)>4)gesture.moved=true;
    if(gesture.pan){options.pan({x:gesture.origin.x+dx,y:gesture.origin.y+dy});return;}
    const box=viewport.getBoundingClientRect(),left=Math.min(event.clientX,gesture.x),top=Math.min(event.clientY,gesture.y),right=Math.max(event.clientX,gesture.x),bottom=Math.max(event.clientY,gesture.y);
    Object.assign(marquee.style,{left:`${left-box.left}px`,top:`${top-box.top}px`,width:`${right-left}px`,height:`${bottom-top}px`});marquee.hidden=!gesture.moved;
    if(gesture.moved){const hit=[...byKey].filter(([,entry])=>{if(!['node','participant'].includes(entry.item.kind))return false;const r=entry.element.getBoundingClientRect();return r.right>=left&&r.left<=right&&r.bottom>=top&&r.top<=bottom;}).map(([key])=>key);select([...(gesture.add?gesture.previous:[]),...hit]);}
  }
  function stop(){gesture=null;marquee.hidden=true;delete viewport.dataset.dragging;window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',cancel);paint();}
  function finish(event){if(gesture?.id!==event.pointerId)return;suppress=gesture.moved;if(!gesture.pan&&!gesture.moved&&!gesture.add)select([]);stop();}
  function cancel(event){if(!gesture||event?.pointerId!=null&&gesture.id!==event.pointerId)return;if(gesture.pan)options.pan(gesture.origin);else select(gesture.previous);suppress=gesture.moved;stop();}
  function blur(){cancel();finishNudge(true);space=false;paint();}
  function down(event){
    if(viewport.inert||event.target.closest('button,input,textarea,[contenteditable],.mermaid-label-editor'))return;
    viewport.focus({preventScroll:true});
    const pan=event.button===1||event.button===0&&(space||state.tool==='hand');
    if(!pan&&(event.button!==0||event.target.closest('[data-select-key],.mermaid-port')))return;
    event.preventDefault();event.stopPropagation();
    gesture={id:event.pointerId,x:event.clientX,y:event.clientY,pan,origin:options.getPan(),previous:[...state.keys],add:event.shiftKey,moved:false};
    viewport.dataset.dragging=pan?'pan':'marquee';open.hidden=true;
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',cancel);
  }
  function click(event){if(suppress||space||state.tool==='hand'){suppress=false;event.preventDefault();event.stopImmediatePropagation();}}
  function wheel(event){if(event.ctrlKey||event.metaKey){event.preventDefault();options.zoom(event.deltaY<0?'zoom-in':'zoom-out',event);}else{event.preventDefault();const old=options.getPan();options.pan({x:old.x-(event.shiftKey?event.deltaY:event.deltaX),y:old.y-(event.shiftKey?event.deltaX:event.deltaY)});}}
  function clipboard(event){
    if(viewport.inert||event.target.closest('input,textarea,[contenteditable]')||event.type!=='paste'&&!nodeIds().length)return;
    event.preventDefault();event.stopPropagation();options.onAction(event.type,selection(),event);
  }
  for(const {element,item} of entries)element.dataset.selectKey=selectionKey(item);
  select(state.pendingIds?state.pendingIds.map(id=>'node:'+id):state.keys);delete state.pendingIds;
  viewport.addEventListener('pointerdown',down,true);viewport.addEventListener('click',click,true);viewport.addEventListener('dblclick',click,true);viewport.addEventListener('wheel',wheel,{passive:false});
  section.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',blur);
  for(const type of ['copy','cut','paste'])section.addEventListener(type,clipboard);
  return {
    choose,selection,nodeIds,paint,focus:()=>viewport.focus({preventScroll:true}),
    setTool(tool){state.tool=tool;options.onTool(tool);paint();viewport.focus({preventScroll:true});},
    layout:()=>canvas?.snapshot(),
    selectIds(ids){state.pendingIds=ids;},
    destroy(){blur();open.remove();marquee.remove();for(const {element} of entries){delete element.dataset.selectKey;element.classList.remove('is-related','is-muted');}viewport.removeEventListener('pointerdown',down,true);viewport.removeEventListener('click',click,true);viewport.removeEventListener('dblclick',click,true);viewport.removeEventListener('wheel',wheel);section.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',blur);for(const type of ['copy','cut','paste'])section.removeEventListener(type,clipboard);},
  };
}
