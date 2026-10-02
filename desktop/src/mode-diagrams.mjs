import {diagramsIn,diagramLabel} from './mermaid-document.mjs';
import {diagramForMode} from './presentation.mjs';

export const skillNodes=(skills,labels=[])=>skills.map(skill=>({alias:`skill_${skill.id.replaceAll('-','_')}`,data:{skill,title:labels.find(node=>node.skill===skill.id)?.title||skill.title}}));
export const modeEditorKind=mode=>diagramsIn(mode?.document||'').length?'diagram-editor':'mode-workspace';
export function sharedDiagram(mode,skills) {
  return ['flowchart LR',...skills.filter(s=>mode.architecture?.shared?.includes(s.id)).map(skill=>{
    const node=mode.architecture.nodes?.find(n=>n.skill===skill.id);
    return `skill_${skill.id.replaceAll('-','_')}["${diagramLabel(node?.title||skill.title)}"]`;
  })].join('\n');
}
export const diagramBlock=(title,source)=>`\n\n## ${title}\n\n\`\`\`mermaid\n${source}\n\`\`\`\n`;
// Only materialize existing authored relations. Never infer a workflow from Skill descriptions.
export function modeDiagramDocument(mode,skills) {
  if(diagramsIn(mode.document).length)return mode.document;
  let document=mode.document;
  for(const paradigm of mode.architecture?.paradigms||[]) {
    const graph=diagramForMode(mode,skills,paradigm.id);
    let source=graph.source;
    for(const node of graph.nodes)source=source.replace(new RegExp(`\\b${node.alias}\\b`,'g'),`skill_${node.id.replaceAll('-','_')}`);
    document+=diagramBlock(paradigm.title,source);
  }
  if(mode.architecture?.shared?.length)document+=diagramBlock('通用能力',sharedDiagram(mode,skills));
  return document;
}
