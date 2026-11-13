import {flowchartItems,editFlowchart,readLayout} from './mermaid-document.mjs';

function modelOf(source){
  const model=flowchartItems(source);
  if(!model.editable)throw new Error('这里只粘贴可编辑的 Mermaid 流程图；其他内容请在原文中编辑');
  return model;
}
const declaration=(node,id)=>node.implicit?id:id+node.parts.slice(2).join('');
function bindings(source){
  return [...source.matchAll(/^\s*%% asl-bind ([\w-]+) (\[[^\r\n]*\])/gm)].flatMap(([,id,json])=>{
    const ids=JSON.parse(json);
    if(!Array.isArray(ids)||!ids.length||ids.length>2||ids.some(id=>typeof id!=='string'))throw new Error('技能关联无效');
    return [[id,ids]];
  });
}
export function copyFlowSelection(source,ids,layout,nodes=[]){
  const model=modelOf(source),selected=new Set(ids),copied=model.nodes.filter(n=>selected.has(n.id));
  if(!copied.length)throw new Error('请先选择节点');
  const lines=['flowchart LR',...copied.map(n=>declaration(n,n.id))];
  const edges=model.edges.filter(e=>selected.has(e.from)&&selected.has(e.to));
  lines.push(...edges.map(e=>e.from+model.lines[e.line].slice(e.start,e.end)+e.to));
  const bound=new Map(bindings(source));
  for(const n of copied){
    const data=nodes.find(item=>item.alias===n.id)?.data;
    const skills=bound.get(n.id)||data?.skills||(data?.skill?.id?[data.skill.id]:null);
    if(skills)lines.push(`%% asl-bind ${n.id} ${JSON.stringify(skills)}`);
  }
  const copiedModel=modelOf(lines.join('\n'));
  return editFlowchart(lines.join('\n'),{kind:'layout',layout:{
    nodes:Object.fromEntries(copied.filter(n=>layout.nodes[n.id]).map(n=>[n.id,layout.nodes[n.id]])),
    edges:Object.fromEntries(edges.flatMap((e,i)=>layout.edges[e.renderId]?[[copiedModel.edges[i].renderId,layout.edges[e.renderId]]]:[])),
  }});
}
export function pasteFlowSelection(source,clipboard,layout,offset=32){
  const original=modelOf(source),copied=modelOf(clipboard),positions=readLayout(clipboard);
  if(!copied.nodes.length)throw new Error('剪贴板没有节点');
  const used=new Set(original.nodes.map(n=>n.id)),mapping=new Map();
  for(const n of copied.nodes){let id=n.id+'_copy',i=2;while(used.has(id))id=n.id+'_copy'+i++;used.add(id);mapping.set(n.id,id);}
  const eol=source.includes('\r\n')?'\r\n':'\n';
  const lines=copied.nodes.map(n=>declaration(n,mapping.get(n.id)));
  lines.push(...copied.edges.map(e=>mapping.get(e.from)+copied.lines[e.line].slice(e.start,e.end)+mapping.get(e.to)));
  for(const [id,skills] of bindings(clipboard))if(mapping.has(id))lines.push(`%% asl-bind ${mapping.get(id)} ${JSON.stringify(skills)}`);
  const next=source+(source.endsWith('\n')?'':eol)+lines.join(eol)+eol;
  const model=modelOf(next),nextLayout={nodes:{...layout.nodes},edges:{...layout.edges}};
  copied.nodes.forEach((n,i)=>{const p=positions.nodes[n.id]||{x:i*220,y:0};nextLayout.nodes[mapping.get(n.id)]={x:p.x+offset,y:p.y+offset};});
  copied.edges.forEach((e,i)=>{if(positions.edges[e.renderId])nextLayout.edges[model.edges[original.edges.length+i].renderId]=positions.edges[e.renderId];});
  return {source:editFlowchart(next,{kind:'layout',layout:nextLayout}),ids:[...mapping.values()]};
}
export function deleteFlowSelection(source,selection){
  let next=source;
  for(const item of selection.filter(i=>i.kind==='edge').sort((a,b)=>b.index-a.index))next=editFlowchart(next,{...item,remove:true});
  for(const item of selection.filter(i=>i.kind==='node'))next=editFlowchart(next,{...item,remove:true});
  const removed=new Set(selection.filter(i=>i.kind==='node').map(i=>i.id));
  next=next.replace(/^[ \t]*%% asl-bind ([\w-]+) [^\r\n]*(?:\r?\n|$)/gm,(line,id)=>removed.has(id)?'':line);
  return next;
}
