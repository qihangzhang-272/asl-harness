const ns='http://www.w3.org/2000/svg';

// A generous pointer target without changing the visible line or its source identity.
export function edgeHit(element) {
  const hit=element.cloneNode(false);
  for(const attribute of [...hit.attributes])if(attribute.name==='id'||attribute.name==='style'||attribute.name.startsWith('data-')||attribute.name.startsWith('marker-'))hit.removeAttribute(attribute.name);
  hit.setAttribute('class','mermaid-edge-hit');element.after(hit);return hit;
}

// Handles are temporary SVG controls; Mermaid owns the layout and source.
export function attachHandles(svg,entries,onConnect) {
  let drag=null;
  const cleanups=[];
  const point=(x,y)=>{const p=svg.createSVGPoint();p.x=x;p.y=y;return p.matrixTransform(svg.getScreenCTM().inverse());};
  function cancel(){
    if(!drag)return;
    drag.preview.remove();drag.port.classList.remove('is-connecting');drag=null;
    window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);
    window.removeEventListener('pointercancel',cancel);window.removeEventListener('keydown',key);
  }
  function move(event){
    if(!drag)return;
    const p=point(event.clientX,event.clientY);
    drag.preview.setAttribute('d',`M ${drag.start.x} ${drag.start.y} L ${p.x} ${p.y}`);
  }
  function key(event){if(event.key==='Escape'){event.preventDefault();cancel();}}
  function finish(event){
    const current=drag;if(!current)return;
    const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-canvas-node]');
    cancel();
    if(target&&svg.contains(target))onConnect(current.id,target.dataset.canvasNode);
  }
  for(const {element,id} of entries){
    element.dataset.canvasNode=id;
    const bounds=element.getBBox();
    const positions=[[bounds.x+bounds.width/2,bounds.y,'上'],[bounds.x+bounds.width,bounds.y+bounds.height/2,'右'],[bounds.x+bounds.width/2,bounds.y+bounds.height,'下'],[bounds.x,bounds.y+bounds.height/2,'左']];
    for(const [x,y,side] of positions){
      const port=document.createElementNS(ns,'circle');
      port.setAttribute('class','mermaid-port');port.setAttribute('cx',x);port.setAttribute('cy',y);port.setAttribute('r','5');
      port.setAttribute('aria-label',`${side}连接点`);port.setAttribute('role','button');
      port.onpointerdown=event=>{
        if(event.button!==0)return;
        event.preventDefault();event.stopPropagation();cancel();
        const rect=port.getBoundingClientRect(),start=point(rect.x+rect.width/2,rect.y+rect.height/2);
        const preview=document.createElementNS(ns,'path');preview.setAttribute('class','mermaid-connection-preview');svg.append(preview);
        drag={port,id,start,preview};port.classList.add('is-connecting');move(event);
        window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish);
        window.addEventListener('pointercancel',cancel);window.addEventListener('keydown',key);
      };
      port.onclick=event=>event.stopPropagation();port.ondblclick=event=>event.stopPropagation();
      element.append(port);cleanups.push(()=>port.remove());
    }
    cleanups.push(()=>delete element.dataset.canvasNode);
  }
  return ()=>{cancel();cleanups.forEach(cleanup=>cleanup());};
}
