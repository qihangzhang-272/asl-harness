// Match identities, never labels: renaming a node is still a change to the same node.
export function evolutionKey(element) {
  if(element.dataset.aslNode)return `node:${element.dataset.aslNode}`;
  const namespace=element.closest?.('svg')?.id;
  const id=namespace&&element.id.startsWith(namespace+'-')?element.id.slice(namespace.length+1):element.id;
  const flow=id?.match(/^flowchart-(.+)-\d+$/);
  if(flow)return `node:${flow[1]}`;
  if(element.matches('.actor')&&element.dataset.id)return `actor:${element.dataset.id}:${element.getAttribute('y')||0}`;
  return null;
}

export function captureDiagram(root) {
  const positions=new Map();
  root?.querySelectorAll('g.node,.actor').forEach(element=>{
    const key=evolutionKey(element);
    if(key)positions.set(key,{rect:element.getBoundingClientRect(),label:element.textContent});
  });
  return positions;
}

export function animateDiagram(root,previous) {
  if(!root)return;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // A first view has no comparison; only later transitions can identify a change.
  if(!previous.size){root.querySelector('svg')?.animate([{opacity:.65},{opacity:1}],{duration:reduced?100:160});return;}
  const timing={duration:reduced?100:280,easing:'cubic-bezier(.16,1,.3,1)'};
  root.querySelectorAll('.edgePaths,.edgeLabels,.messageLine0,.messageLine1,.messageText').forEach(element=>{
    element.animate([{opacity:.2},{opacity:1}],{duration:reduced?100:200});
  });
  root.querySelectorAll('g.node,.actor').forEach(element=>{
    const key=evolutionKey(element);if(!key)return;
    const old=previous.get(key),rect=element.getBoundingClientRect(),matrix=element.parentElement.getScreenCTM?.();
    const transform=getComputedStyle(element).transform;
    const dx=old&&matrix?(old.rect.x-rect.x)/Math.hypot(matrix.a,matrix.b):0;
    const dy=old&&matrix?(old.rect.y-rect.y)/Math.hypot(matrix.c,matrix.d):0;
    element.animate([
      {transform:!reduced&&old?`translate(${dx}px,${dy}px) ${transform==='none'?'':transform}`:transform,opacity:old?1:.15},
      {transform,opacity:1},
    ],timing);
    if(!old||old.label!==element.textContent){element.classList.add('evolution-changed');element.classList.add(old?'evolution-updated':'evolution-added');}
  });
}
