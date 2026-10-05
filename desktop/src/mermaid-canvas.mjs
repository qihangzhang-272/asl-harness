export function diagramNodes(svg,alias) {
  const escaped=alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const rendererId=(svg.querySelector('svg')||svg).id;
  return [...svg.querySelectorAll('g.node,g[data-et="participant"]')].filter(el=>
    el.getAttribute('data-id')===alias||el.getAttribute('data-asl-node')===alias||el.id===alias||
    (rendererId&&el.id===`${rendererId}-${alias}`)||
    new RegExp(`(?:^|-)(?:flowchart|state)-${escaped}-[0-9]+$`).test(el.id));
}

const normals={top:[0,-1],right:[1,0],bottom:[0,1],left:[-1,0]};
export function connectionCurve(a,b,from,to,offset=0) {
  const length=Math.max(36,Math.min(180,(Math.abs(a.x-b.x)+Math.abs(a.y-b.y))*.4));
  const u=normals[from],v=normals[to];
  const c={x:a.x+u[0]*length,y:a.y+u[1]*length},d={x:b.x+v[0]*length,y:b.y+v[1]*length};
  if(!offset)return `M ${a.x} ${a.y} C ${c.x} ${c.y}, ${d.x} ${d.y}, ${b.x} ${b.y}`;
  // Separate parallel edges even on a straight row, retaining endpoint tangents.
  const span=Math.hypot(b.x-a.x,b.y-a.y)||1,dx=(b.y-a.y)/span*offset,dy=-(b.x-a.x)/span*offset;
  const middle={x:(a.x+3*c.x+3*d.x+b.x)/8+dx,y:(a.y+3*c.y+3*d.y+b.y)/8+dy};
  return `M ${a.x} ${a.y} C ${(a.x+c.x)/2} ${(a.y+c.y)/2}, ${(a.x+2*c.x+d.x)/4+dx} ${(a.y+2*c.y+d.y)/4+dy}, ${middle.x} ${middle.y} C ${(c.x+2*d.x+b.x)/4+dx} ${(c.y+2*d.y+b.y)/4+dy}, ${(d.x+b.x)/2} ${(d.y+b.y)/2}, ${b.x} ${b.y}`;
}
export function pointerPoint(svg,x,y) {return new DOMPoint(x,y).matrixTransform(svg.getScreenCTM().inverse());}

// A geometry adapter over Mermaid's SVG, not a second graph or rendering engine.
export function flowCanvas(svg,model,layout={nodes:{},edges:{}},apply=true) {
  const original=svg.getAttribute('viewBox'),nodes=new Map();
  const matrix=element=>svg.getCTM().inverse().multiply(element.getCTM());
  for(const item of model.nodes){
    const element=diagramNodes(svg,item.id)[0];if(!element)continue;
    const shape=element.querySelector(':scope > .label-container,:scope > rect,:scope > polygon,:scope > circle,:scope > path')||element;
    const bounds=shape.getBBox(),m=matrix(shape);
    const a=new DOMPoint(bounds.x,bounds.y).matrixTransform(m),b=new DOMPoint(bounds.x+bounds.width,bounds.y+bounds.height).matrixTransform(m);
    const center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    nodes.set(item.id,{element,center,position:{...center},width:Math.abs(b.x-a.x),height:Math.abs(b.y-a.y),transform:element.getAttribute('transform')||''});
  }
  const edgeElements=model.edges.map(edge=>{
    const path=[...svg.querySelectorAll('path.flowchart-link')].find(p=>p.dataset.id===edge.renderId);
    const label=[...svg.querySelectorAll('g.edgeLabels g.label[data-id]')].find(p=>p.dataset.id===edge.renderId)?.parentElement;
    return {...edge,path,label,d:path?.getAttribute('d'),transform:label?.getAttribute('transform')};
  });
  function port(id,side) {
    const n=nodes.get(id),normal=normals[side];
    return {x:n.position.x+normal[0]*n.width/2,y:n.position.y+normal[1]*n.height/2};
  }
  function snapshot(){return {nodes:Object.fromEntries([...nodes].map(([id,n])=>[id,{x:Math.round(n.position.x*100)/100,y:Math.round(n.position.y*100)/100}])),edges:{...layout.edges}};}
  function place(id,position){
    const n=nodes.get(id);if(!n)return;
    n.position={...position};
    const inverse=matrix(n.element.parentElement).inverse();
    const a=new DOMPoint(position.x,position.y).matrixTransform(inverse),b=new DOMPoint(n.center.x,n.center.y).matrixTransform(inverse);
    n.element.setAttribute('transform',`translate(${a.x-b.x},${a.y-b.y}) ${n.transform}`);
  }
  function route(){
    for(const edge of edgeElements){
      if(!edge.path)continue;
      const a=nodes.get(edge.from),b=nodes.get(edge.to);if(!a||!b)continue;
      const horizontal=Math.abs(b.position.x-a.position.x)>=Math.abs(b.position.y-a.position.y);
      const from=horizontal?(b.position.x>=a.position.x?'right':'left'):(b.position.y>=a.position.y?'bottom':'top');
      const sides=layout.edges[edge.renderId]||{from,to:{top:'bottom',bottom:'top',left:'right',right:'left'}[from]};
      const p=port(edge.from,sides.from),q=port(edge.to,sides.to);
      // Paths and labels can have different parents; translate each from root SVG coordinates.
      const inverse=matrix(edge.path.parentElement).inverse();
      const start=new DOMPoint(p.x,p.y).matrixTransform(inverse),end=new DOMPoint(q.x,q.y).matrixTransform(inverse);
      const parallel=model.edges.filter(e=>e.index<edge.index&&((e.from===edge.from&&e.to===edge.to)||(e.from===edge.to&&e.to===edge.from))).length;
      const d=connectionCurve(start,end,sides.from,sides.to,parallel*22);
      edge.path.setAttribute('d',d);
      if(edge.path.nextElementSibling?.classList.contains('mermaid-edge-hit'))edge.path.nextElementSibling.setAttribute('d',d);
      if(edge.label){
        const midpoint=edge.path.getPointAtLength(edge.path.getTotalLength()/2).matrixTransform(matrix(edge.path));
        const at=midpoint.matrixTransform(matrix(edge.label.parentElement).inverse());
        edge.label.setAttribute('transform',`translate(${at.x},${at.y})`);
      }
    }
  }
  function restore(){
    for(const n of nodes.values()){n.position={...n.center};n.element.setAttribute('transform',n.transform);}
    for(const e of edgeElements){e.path?.setAttribute('d',e.d);if(e.label&&e.transform)e.label.setAttribute('transform',e.transform);if(e.path?.nextElementSibling?.classList.contains('mermaid-edge-hit'))e.path.nextElementSibling.setAttribute('d',e.d);}
    svg.setAttribute('viewBox',original);
  }
  function fit(){
    const box=svg.getBBox();svg.setAttribute('viewBox',`${box.x-40} ${box.y-40} ${box.width+80} ${box.height+80}`);
  }
  if(apply){
    for(const [id,p] of Object.entries(layout.nodes))place(id,p);
    if(Object.keys(layout.nodes).length||Object.keys(layout.edges).length){route();fit();}
  }
  return {nodes,port,snapshot,place,route,restore,fit};
}

export function attachFlowDrag(svg,canvas,onCommit) {
  let drag=null,suppress=false;
  function stop(){
    if(drag)drag.node.element.classList.remove('is-moving');drag=null;
    window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);
    window.removeEventListener('pointercancel',cancel);window.removeEventListener('blur',cancel);window.removeEventListener('keydown',key);
  }
  function cancel(event){if(event?.pointerId!=null&&event.pointerId!==drag?.pointerId)return;const current=drag;suppress=!!current?.started;stop();if(current?.started)canvas.restore();}
  function key(event){if(event.key==='Escape')cancel();}
  function move(event){
    if(!drag||event.pointerId!==drag.pointerId)return;
    const p=pointerPoint(svg,event.clientX,event.clientY);
    if(!drag.started&&Math.hypot(event.clientX-drag.clientX,event.clientY-drag.clientY)<4)return;
    event.preventDefault();if(!drag.started)drag.node.element.parentElement.appendChild(drag.node.element);
    drag.started=true;drag.node.element.classList.add('is-moving');
    canvas.place(drag.id,{x:drag.position.x+p.x-drag.start.x,y:drag.position.y+p.y-drag.start.y});canvas.route();
  }
  async function finish(event){
    if(!drag||event.pointerId!==drag.pointerId)return;
    move(event);const current=drag,layout=canvas.snapshot();suppress=current.started;stop();
    if(current.started&&await onCommit({kind:'layout',layout})===false)canvas.restore();
  }
  function click(event){if(suppress){suppress=false;event.preventDefault();event.stopImmediatePropagation();}}
  svg.addEventListener('click',click,true);
  for(const [id,node] of canvas.nodes){
    node.element.onpointerdown=event=>{
      if(event.button!==0||event.target.closest('.mermaid-label-editor,.mermaid-port')||drag)return;
      event.preventDefault();suppress=false;
      drag={id,node,pointerId:event.pointerId,clientX:event.clientX,clientY:event.clientY,start:pointerPoint(svg,event.clientX,event.clientY),position:{...node.position},started:false};
      window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',finish);
      window.addEventListener('pointercancel',cancel);window.addEventListener('blur',cancel);window.addEventListener('keydown',key);
    };
  }
  return ()=>{cancel();svg.removeEventListener('click',click,true);for(const n of canvas.nodes.values())n.element.onpointerdown=null;};
}
