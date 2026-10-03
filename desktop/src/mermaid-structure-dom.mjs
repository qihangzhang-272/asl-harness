export function diagramNodes(svg,alias) {
  const escaped=alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return [...svg.querySelectorAll('g.node,g[data-et="participant"]')].filter(el=>
    el.getAttribute('data-id')===alias||el.getAttribute('data-asl-node')===alias||el.id===alias||
    new RegExp(`(?:^|-)(?:flowchart|state)-${escaped}-[0-9]+$`).test(el.id));
}

// Match renderer identities, never visible text (two elements can have the same label).
export function structureElements(svg,model) {
  const entries=[];
  const add=(element,item,label=element)=>{if(element&&item)entries.push({element,item,label});};
  if(model.type==='mindmap'||model.type==='stateDiagram-v2') {
    for(const item of model.items) {
      if(model.items.filter(i=>i.id===item.id).length!==1)continue;
      const element=diagramNodes(svg,item.id)[0];
      add(element,item,element?.querySelector('g.label')||element);
    }
  }else if(model.type==='sequenceDiagram') {
    for(const element of svg.querySelectorAll('g[data-et="participant"]')){
      const matches=model.items.filter(i=>i.kind==='participant'&&i.id===element.dataset.id);
      if(matches.length===1)add(element,matches[0],element.querySelector('text'));
    }
    const messages=model.items.filter(i=>i.kind==='message'),paths=[...svg.querySelectorAll('[data-et="message"]')],labels=[...svg.querySelectorAll('text.messageText')];
    if(messages.length===paths.length&&labels.length===paths.length&&paths.every((p,i)=>p.dataset.from===messages[i].from&&p.dataset.to===messages[i].to)){
      paths.forEach((p,i)=>{add(p,messages[i],labels[i]);add(labels[i],messages[i]);});
    }
    const notes=model.items.filter(i=>i.kind==='note'),renderedNotes=[...svg.querySelectorAll('g[data-et="note"]')];
    if(notes.length===renderedNotes.length)renderedNotes.forEach((el,i)=>add(el,notes[i],el.querySelector('text.noteText')));
    const groups=[...svg.querySelectorAll('g[data-et="control-structure"]')];
    if(groups.length===model.controls.length)groups.forEach((g,i)=>{
      const texts=[...g.querySelectorAll('text.loopText,text.sectionTitle')];
      if(texts.length===model.controls[i].length)texts.forEach((el,j)=>add(el,model.controls[i][j]));
    });
  }
  return entries;
}

// Drag changes order/parentage, not SVG coordinates. Mermaid performs the next layout.
export function attachStructureDrag(svg,entries,model,onMove) {
  let drag=null,suppressClick=false;
  function stop(){
    if(drag){drag.element.classList.remove('is-dragging');drag.target?.classList.remove('is-drop-target');drag=null;}
    window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);
    window.removeEventListener('pointercancel',cancel);window.removeEventListener('keydown',key);
  }
  function cancel(){suppressClick=!!drag?.started;stop();}
  function key(event){if(event.key==='Escape'){event.preventDefault();cancel();}}
  function move(event){
    if(!drag)return;
    if(!drag.started&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<6)return;
    event.preventDefault();drag.started=true;drag.element.classList.add('is-dragging');
    const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-asl-edit]');
    drag.target?.classList.remove('is-drop-target');drag.target=target&&svg.contains(target)?target:null;
    drag.target?.classList.add('is-drop-target');
  }
  function finish(event){
    const current=drag;if(!current)return;
    suppressClick=current.started;
    const target=current.target,to=entries.find(entry=>entry.element===target)?.item;
    stop();
    if(!current.started||!to||to.key===current.item.key)return;
    const rect=target.getBoundingClientRect();
    const placement=model.type==='mindmap'?(event.shiftKey?(event.clientY<rect.y+rect.height/2?'before':'after'):'inside'):
      (current.item.kind==='participant'?event.clientX<rect.x+rect.width/2:event.clientY<rect.y+rect.height/2)?'before':'after';
    onMove({kind:'move',key:current.item.key,to:to.key,placement});
  }
  function click(event){if(suppressClick){event.preventDefault();event.stopImmediatePropagation();suppressClick=false;}}
  svg.addEventListener('click',click,true);
  for(const {element,item} of entries) {
    element.dataset.aslEdit=item.key;
    if(!model.structural||model.activation||item.kind==='condition')continue;
    element.onpointerdown=event=>{
      if(event.button!==0||event.target.closest('.mermaid-label-editor'))return;
      event.preventDefault();
      stop();suppressClick=false;drag={element,item,x:event.clientX,y:event.clientY,started:false};
      window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish);
      window.addEventListener('pointercancel',cancel);window.addEventListener('keydown',key);
    };
  }
  return ()=>{stop();svg.removeEventListener('click',click,true);entries.forEach(({element})=>{delete element.dataset.aslEdit;element.onpointerdown=null;});};
}
