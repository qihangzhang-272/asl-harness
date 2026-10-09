import {diagramsIn,diagramLabel,replaceDiagram,editFlowchart} from './mermaid-document.mjs';
import {diagramForMode} from './presentation.mjs';
import {normalizeArchitecture,memberIds,rootIds} from './graph-model.mjs';

export const skillAlias=id=>/^[a-z0-9][a-z0-9-]*$/.test(id)?`skill_${id.replaceAll('-','_')}`:`legacy_${Array.from(id,c=>c.codePointAt(0).toString(16)).join('_')}`;
export const skillNodes=(skills,labels=[])=>skills.map(skill=>({alias:skillAlias(skill.id),data:{skill,title:labels.find(node=>node.skill===skill.id)?.title||skill.title}}));
// Only remove syntax the existing lossless lens understands. Never rewrite a
// sequence/state/mindmap to make a membership edit appear to succeed.
export function withoutSkillNodes(document,ids) {
  for(const id of ids){
    const alias=skillAlias(id);
    for(const [index,diagram] of diagramsIn(document).entries()){
      if(!new RegExp(`\\b${alias}\\b`).test(diagram.source))continue;
      document=replaceDiagram(document,index,editFlowchart(diagram.source,{kind:'node',id:alias,remove:true}));
    }
  }
  return document;
}
export function sharedDiagram(mode,skills) {
  return ['flowchart LR',...skills.filter(s=>mode.architecture?.shared?.includes(s.id)).map(skill=>{
    const node=mode.architecture.nodes?.find(n=>n.skill===skill.id);
    return `${skillAlias(skill.id)}["${diagramLabel(node?.title||skill.title)}"]`;
  })].join('\n');
}
export const diagramBlock=(title,source)=>`\n\n## ${title}\n\n\`\`\`mermaid\n${source}\n\`\`\`\n`;
// Only materialize existing authored relations. Never infer a workflow from Skill descriptions.
export function modeDiagramDocument(mode,skills) {
  if(diagramsIn(mode.document).length)return mode.document;
  const members=memberIds(rootIds(mode),skills);
  const architecture=mode.architecture?.paradigms?mode.architecture:normalizeArchitecture(mode.architecture,members);
  if(!architecture.paradigms.length&&!architecture.shared.length)
    architecture.paradigms=[{id:'main',title:'技能协作',skills:members,edges:[]}];
  mode={...mode,architecture};
  let document=mode.document;
  for(const paradigm of mode.architecture?.paradigms||[]) {
    const graph=diagramForMode(mode,skills,paradigm.id);
    // An unauthored member collection must open as editable native nodes; authored
    // block/sequence/etc. documents returned above are never converted.
    let source=graph.source.replace(/^block-beta\ncolumns \d+/, 'flowchart LR');
    for(const node of graph.nodes)source=source.replace(new RegExp(`\\b${node.alias}\\b`,'g'),skillAlias(node.id));
    document+=diagramBlock(paradigm.title,source);
  }
  if(mode.architecture?.shared?.length)document+=diagramBlock('通用能力',sharedDiagram(mode,skills));
  return document;
}
