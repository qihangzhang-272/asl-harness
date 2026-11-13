import {modeDiagramDocument,skillNodes} from '../../../desktop/src/mode-diagrams.mjs';
import {diagramsIn,flowchartItems} from '../../../desktop/src/mermaid-document.mjs';
import {structureItems} from '../../../desktop/src/mermaid-structure.mjs';

export function bindingsFor(source,skills){
  const lookup=new Map(skillNodes(skills).map(n=>[n.alias,[n.data.skill.id]]));
  for(const match of source.matchAll(/^%% asl-bind ([\w-]+) (.+)$/gm)){
    try{const ids=JSON.parse(match[2]);if(Array.isArray(ids)&&ids.length>0&&ids.length<=2&&ids.every(id=>skills.some(s=>s.id===id)))lookup.set(match[1],ids);}catch{/* Unrelated comments stay inert. */}
  }
  for(const match of source.matchAll(/^%% asl-node (.+)$/gm)){
    try{const node=JSON.parse(match[1]);if(Array.isArray(node.skills)&&node.skills.length>0&&node.skills.length<=2&&node.skills.every(id=>skills.some(s=>s.id===id)))lookup.set(node.id,node.skills);}catch{/* Preserve previous canvas metadata. */}
  }
  return lookup;
}
export function diagramsFor(document,mode,skills){
  return diagramsIn(modeDiagramDocument({...mode,document},skills));
}
export function referencedSkills(source,skills){
  const aliases=new Set([...flowchartItems(source).nodes,...structureItems(source).items].map(n=>n.id));
  return [...new Set([...bindingsFor(source,skills)].filter(([alias])=>aliases.has(alias)).flatMap(([,ids])=>ids))];
}
