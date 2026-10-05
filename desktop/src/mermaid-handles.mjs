const ns='http://www.w3.org/2000/svg';
import {connectionCurve,pointerPoint} from './mermaid-canvas.mjs';

// A generous pointer target without changing the visible line or its source identity.
export function edgeHit(element) {
  const hit=element.cloneNode(false);
  for(const attribute of [...hit.attributes])if(attribute.name==='id'||attribute.name==='style'||attribute.name.startsWith('data-')||attribute.name.startsWith('marker-'))hit.removeAttribute(attribute.name);
  hit.setAttribute('class','mermaid-edge-hit');element.after(hit);return hit;
}

// Handles are temporary SVG controls; Mermaid owns the layout and source.
export function attachHandles(svg,entries,onConnect,canvas) {
  let drag=null;
  const cleanups=[],ports=[],pending=new Set();
  const point=(x,y)=>pointerPoint(svg,x,y);
  function cancel(event){
    if(event?.pointerId!=null&&event.pointerId!==drag?.pointerId)return;
    if(!drag)return;
    drag.preview.remove();drag.port.classList.remove('is-connecting');drag.target?.port.classList.remove('is-snapped');drag=null;svg.classList.remove('is-connecting');
    window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);
    window.removeEventListener('pointercancel',cancel);window.removeEventListener('keydown',key);window.removeEventListener('blur',cancel);
  }
  function move(event){
    if(!drag||drag.pointerId!==event.pointerId)return;
    drag.target?.port.classList.remove('is-snapped');drag.target=null;
    let distance=18;
    for(const entry of ports){
      if(entry.port===drag.port)continue;
      const rect=entry.port.getBoundingClientRect(),d=Math.hypot(event.clientX-rect.x-rect.width/2,event.clientY-rect.y-rect.height/2);
      if(d<distance){distance=d;drag.target=entry;}
    }
    // Dropping on a node body chooses its nearest side; explicit ports always win.
    if(!drag.target){
      const id=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-canvas-node]')?.dataset.canvasNode;
      if(id&&id!==drag.id)drag.target=ports.filter(p=>p.id===id).sort((a,b)=>{
        const distance=p=>{const r=p.port.getBoundingClientRect();return Math.hypot(event.clientX-r.x-r.width/2,event.clientY-r.y-r.height/2);};return distance(a)-distance(b);
      })[0];
    }
    const target=drag.target,r=target?.port.getBoundingClientRect();target?.port.classList.add('is-snapped');
    const p=r?point(r.x+r.width/2,r.y+r.height/2):point(event.clientX,event.clientY);
    drag.preview.setAttribute('d',connectionCurve(drag.start,p,drag.side,target?.side||({top:'bottom',bottom:'top',left:'right',right:'left'}[drag.side])));
  }
  function key(event){if(event.key==='Escape'){event.preventDefault();cancel();}}
  function finish(event){
    if(!drag||drag.pointerId!==event.pointerId)return;move(event);
    const current=drag,target=current.target;
    cancel();
    if(target){
      // Keep the chosen connection visible while the real write gate runs.
      current.preview.classList.add('is-saving');svg.append(current.preview);pending.add(current.preview);
      const remove=()=>{current.preview.remove();pending.delete(current.preview);};
      Promise.resolve(onConnect(current.id,target.id,{fromPort:current.side,toPort:target.side,layout:canvas?.snapshot()})).then(accepted=>{if(accepted===false)remove();},remove);
    }
  }
  for(const {element,id} of entries){
    element.dataset.canvasNode=id;
    const bounds=element.getBBox();
    const positions=[[bounds.x+bounds.width/2,bounds.y,'上','top'],[bounds.x+bounds.width,bounds.y+bounds.height/2,'右','right'],[bounds.x+bounds.width/2,bounds.y+bounds.height,'下','bottom'],[bounds.x,bounds.y+bounds.height/2,'左','left']];
    for(const [x,y,title,side] of positions){
      const port=document.createElementNS(ns,'circle');
      port.setAttribute('class','mermaid-port');port.setAttribute('cx',x);port.setAttribute('cy',y);port.setAttribute('r','5');
      port.setAttribute('aria-label',`${title}连接点`);port.setAttribute('role','button');port.dataset.port=side;ports.push({port,id,side});
      port.onpointerdown=event=>{
        if(event.button!==0||drag)return;
        event.preventDefault();event.stopPropagation();cancel();
        const rect=port.getBoundingClientRect(),start=point(rect.x+rect.width/2,rect.y+rect.height/2);
        const preview=document.createElementNS(ns,'path');preview.setAttribute('class','mermaid-connection-preview');svg.append(preview);
        drag={port,id,side,start,preview,pointerId:event.pointerId};port.classList.add('is-connecting');svg.classList.add('is-connecting');move(event);
        window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish);
        window.addEventListener('pointercancel',cancel);window.addEventListener('keydown',key);window.addEventListener('blur',cancel);
      };
      port.onclick=event=>event.stopPropagation();port.ondblclick=event=>event.stopPropagation();
      element.append(port);cleanups.push(()=>port.remove());
    }
    cleanups.push(()=>delete element.dataset.canvasNode);
  }
  return ()=>{cancel();pending.forEach(element=>element.remove());cleanups.forEach(cleanup=>cleanup());};
}
