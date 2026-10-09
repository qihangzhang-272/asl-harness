// Match identities, never labels: renaming a node is still a change to the same node.
export function evolutionKey(element) {
  if(element.dataset.aslNode)return `node:${element.dataset.aslNode}`;
  const flow=element.id?.match(/^flowchart-(.+)-\d+$/);
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
  // Unknown diagram identities use a brief dissolve, never an invented node correspondence.
  root.querySelector('svg')?.animate([{opacity:.6},{opacity:1}],{duration:100});
  root.querySelectorAll('g.node,.actor').forEach(element=>{
    const key=evolutionKey(element);if(!key)return;
    const old=previous.get(key),rect=element.getBoundingClientRect(),matrix=element.parentElement.getScreenCTM?.();
    const transform=getComputedStyle(element).transform;
    const dx=old&&matrix?(old.rect.x-rect.x)/Math.hypot(matrix.a,matrix.b):0;
    const dy=old&&matrix?(old.rect.y-rect.y)/Math.hypot(matrix.c,matrix.d):0;
    element.animate([
      {transform:!reduced&&old?`translate(${dx}px,${dy}px) ${transform==='none'?'':transform}`:transform,opacity:old?1:.15},
      {transform,opacity:1},
    ],{duration:reduced?100:240,easing:'cubic-bezier(.16,1,.3,1)'});
    if(!old||old.label!==element.textContent)element.classList.add('evolution-changed');
  });
}
