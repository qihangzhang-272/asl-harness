import {marked} from 'marked';

export const diagramTemplates=[
  {id:'flow',title:'流程图',source:'flowchart LR\n start["输入"]\n work["处理"]\n result["结果"]\n start --> work\n work --> result'},
  {id:'mindmap',title:'思维导图',source:'mindmap\n root((协作))\n  research[研究]\n   evidence[证据]\n  output[表达]'},
  {id:'sequence',title:'时序图',source:'sequenceDiagram\n participant A as 研究\n participant B as 复核\n A->>B: 提交材料\n alt 材料齐备\n B-->>A: 反馈\n else 需要补充\n Note over A,B: 补齐证据\n end'},
];

export function appendDiagramTemplate(document,type) {
  const template=diagramTemplates.find(t=>t.id===type);
  if(!template)throw new Error('未找到这个图型');
  const titles=new Set(diagramsIn(document).map(d=>d.title));
  let title=template.title,n=2;while(titles.has(title))title=`${template.title} ${n++}`;
  const eol=document.includes('\r\n')?'\r\n':'\n';
  return document+['','','## '+title,'','```mermaid',template.source,'```',''].join('\n').replace(/\n/g,eol);
}

export function diagramsIn(text='') {
  const result=[];let title='架构',offset=0;
  marked.walkTokens(marked.lexer(text),token=>{
    if(token.type==='heading')title=token.text;
    if(token.type==='code'&&token.lang?.trim().toLowerCase()==='mermaid') {
      // Marked normalizes CRLF; locate the literal block without normalizing the authored file.
      const pattern=new RegExp(token.raw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\n/g,'\\r?\\n'),'g');
      pattern.lastIndex=offset;
      const match=pattern.exec(text),start=match?.index??-1;if(match)offset=start+match[0].length;
      result.push({title,source:token.text,line:start<0?null:text.slice(0,start).split('\n').length,start,raw:match?.[0]||token.raw});
    }
  });
  return result;
}

export function replaceDiagram(document,index,source) {
  const block=diagramsIn(document)[index];
  if(!block||block.start<0)throw new Error('图原文已改变，请重新打开');
  const opening=block.raw.match(/^([^\r\n]*)(\r?\n)/);
  const closing=block.raw.match(/(?:\r?\n)([ \t]*(?:`{3,}|~{3,})[^\r\n]*(?:\r?\n)?)$/);
  if(!opening||!closing)throw new Error('请先补齐 Mermaid 代码块');
  const replacement=opening[0]+source.replace(/\r?\n/g,opening[2])+opening[2]+closing[1];
  return document.slice(0,block.start)+replacement+document.slice(block.start+block.raw.length);
}

// This is a lossless edit lens for simple flowcharts, not another Mermaid parser.
// Unsupported statements stay readable with the official renderer and editable as source.
const identifier='[A-Za-z_][A-Za-z0-9_-]*';
const nodeAtom=new RegExp(`^(${identifier})(\\s*)(\\[\\[|\\(\\(|\\[|\\(|\\{)("[^"\\r\\n]*"|[^"\\[\\](){}\\r\\n]*?)(\\]\\]|\\)\\)|\\]|\\)|\\})`);
const bareAtom=new RegExp(`^(${identifier}?)(?=\\s*(?:-->|---|-\\.->|==>|;?\\s*$))`);
const edgeAtom=/^(\s*)(-->|---|-\.->|==>)(\s*)(?:\|("[^"\r\n]*"|[^|\r\n]*)\|)?(\s*)/;
const unquote=text=>text?.replace(/^"|"$/g,'').replace(/#(\d+);/g,(raw,code)=>Number(code)<=0x10ffff?String.fromCodePoint(Number(code)):raw)||'';
const editLabel=text=>diagramLabel(text).replaceAll('|','#124;');
function flowRow(text,line) {
  const nodes=[],edges=[],indent=text.match(/^\s*/)[0];let cursor=indent.length;
  while(cursor<text.length){
    const part=text.slice(cursor),match=part.match(nodeAtom)||part.match(bareAtom);
    if(!match||match[3]&&({'[':']','[[':']]','(':')','((':'))','{':'}'}[match[3]]!==match[5]))return null;
    const node={id:match[1],label:match[3]?unquote(match[4]):match[1],implicit:!match[3],line,start:cursor,end:cursor+match[0].length,parts:match};
    nodes.push(node);cursor=node.end;
    if(/^\s*;?\s*$/.test(text.slice(cursor)))return {line,nodes,edges,indent};
    const edge=text.slice(cursor).match(edgeAtom);if(!edge||node.implicit&&node.id.endsWith('-')&&!edge[1]&&edge[2].startsWith('-'))return null;
    edges.push({from:node.id,label:unquote(edge[4]),line,start:cursor,end:cursor+edge[0].length,parts:edge});
    cursor+=edge[0].length;
  }
  return null;
}
export function flowchartItems(source='') {
  const nodes=[],edges=[],rows=[],lines=source.match(/[^\n]*\n|[^\n]+$/g)||[];
  let header=false,editable=true;
  lines.forEach((raw,line)=>{
    const text=raw.replace(/\r?\n$/,'');
    if(!text.trim()||/^\s*%%(?!\{)/.test(text))return;
    if(!header&&/^\s*(?:flowchart|graph)\s+(?:LR|RL|TD|TB|BT)\s*;?\s*$/.test(text)){header=true;return;}
    const row=flowRow(text,line);if(!row){editable=false;return;}rows.push(row);
    for(const node of row.nodes){
      const previous=nodes.findIndex(n=>n.id===node.id);
      if(previous<0)nodes.push(node);
      else if(!node.implicit){if(!nodes[previous].implicit)editable=false;else nodes[previous]=node;}
    }
    row.edges.forEach((edge,i)=>{
      edge.to=row.nodes[i+1].id;
      const parallel=edges.filter(e=>e.from===edge.from&&e.to===edge.to).length;
      // Mermaid 12 FlowDB uses 0 for the first edge, then 2, 3… for parallel edges.
      Object.assign(edge,{renderId:`L_${edge.from}_${edge.to}_${parallel?parallel+1:0}`,index:edges.length});edges.push(edge);
    });
  });
  return {editable:header&&editable,lines,rows,nodes,edges};
}
export function editFlowchart(source,change) {
  const model=flowchartItems(source),lines=[...model.lines],eol=source.includes('\r\n')?'\r\n':'\n';
  if(!model.editable)throw new Error('此图的语法请在原文中修改；不会转换或丢弃原有内容');
  let layout=change.layout||readLayout(source),remaining=model.edges;
  const append=text=>{if(lines.length&&!lines.at(-1).endsWith('\n'))lines[lines.length-1]+=eol;lines.push(text+eol);};
  const replace=(item,text)=>{lines[item.line]=lines[item.line].slice(0,item.start)+text+lines[item.line].slice(item.end);};
  const remove=(removedNode,removedEdge)=>{
    remaining=remaining.filter(edge=>edge!==removedEdge&&edge.from!==removedNode&&edge.to!==removedNode);
    for(const row of model.rows){
      if(!row.nodes.some(n=>n.id===removedNode)&&!row.edges.includes(removedEdge))continue;
      // Split only the affected statement; declarations and unrelated source retain their meaning.
      const statements=row.nodes.filter(n=>!n.implicit&&n.id!==removedNode).map(n=>model.lines[row.line].slice(n.start,n.end));
      statements.push(...row.edges.filter(edge=>remaining.includes(edge)).map(edge=>`${edge.from}${model.lines[row.line].slice(edge.start,edge.end)}${edge.to}`));
      lines[row.line]=statements.length?statements.map(s=>row.indent+s).join(eol)+(model.lines[row.line].endsWith('\n')?eol:''):'';
    }
    const present=new Set(flowchartItems(lines.join('')).nodes.map(n=>n.id));
    for(const node of model.nodes)if(node.id!==removedNode&&!present.has(node.id))append(node.id);
  };
  if(change.kind==='direction'){
    if(!['LR','RL','TD','TB','BT'].includes(change.direction))throw new Error('图的方向无效');
    const line=lines.findIndex(line=>/^\s*(?:flowchart|graph)\s+/.test(line));
    lines[line]=lines[line].replace(/\b(LR|RL|TD|TB|BT)\b/,change.direction);
    layout={nodes:{},edges:{}};
  }else if(change.kind==='layout'){
    // Geometry travels inside this Mermaid document, never in App preferences.
  }else if(change.kind==='node'){
    const node=model.nodes.find(n=>n.id===change.id);
    if(!node)throw new Error('节点已改变，请重新选择');
    if(change.remove){
      remove(node.id);
    }else if(node.implicit)append(`${node.id}["${editLabel(change.label)}"]`);
    else {const p=node.parts;replace(node,`${p[1]}${p[2]}${p[3]}"${editLabel(change.label)}"${p[5]}`);}
  }else if(change.kind==='edge'){
    const edge=model.edges[change.index];
    if(!edge)throw new Error('连线已改变，请重新选择');
    const p=edge.parts;
    if(change.remove)remove(undefined,edge);
    else replace(edge,`${p[1]}${p[2]}${p[3]}${change.label?`|"${editLabel(change.label)}"|`:''}${p[5]}`);
  }else if(change.kind==='connect'){
    if(![change.from,change.to].every(id=>model.nodes.some(n=>n.id===id)))throw new Error('请先选择已有节点');
    append(`${change.from} -->${change.label?`|"${editLabel(change.label)}"|`:''} ${change.to}`);
  }else if(change.kind==='add'){
    if(!new RegExp(`^${identifier}$`).test(change.id)||model.nodes.some(n=>n.id===change.id))throw new Error('节点标识无效或已经存在');
    append(`${change.id}["${editLabel(change.label)}"]`);
  }else throw new Error('不支持的图修改');
  const result=lines.join(''),next=flowchartItems(result);
  const edges=Object.fromEntries(remaining.flatMap((edge,i)=>layout.edges[edge.renderId]?[[next.edges[i].renderId,layout.edges[edge.renderId]]]:[]));
  if(change.kind==='connect'&&change.fromPort&&change.toPort)edges[next.edges.at(-1).renderId]={from:change.fromPort,to:change.toPort};
  layout={nodes:Object.fromEntries(Object.entries(layout.nodes).filter(([id])=>next.nodes.some(n=>n.id===id))),edges};
  return writeLayout(result,layout);
}

const layoutLine=/^[ \t]*%% asl-layout(?:[ \t]+([^\r\n]*))?[ \t]*(?:\r?\n|$)/gm;
export function readLayout(source='') {
  const matches=[...source.matchAll(layoutLine)];
  if(!matches.length)return {nodes:{},edges:{}};
  try {
    if(matches.length!==1)throw Error();
    const value=JSON.parse(matches[0][1]),model=flowchartItems(source);
    const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
    if(!model.editable||!object(value)||Object.keys(value).sort().join()!=='edges,nodes'||!object(value.nodes)||!object(value.edges))throw Error();
    for(const [id,p] of Object.entries(value.nodes)){
      if(!model.nodes.some(n=>n.id===id)||!object(p)||Object.keys(p).sort().join()!=='x,y'||![p.x,p.y].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000))throw Error();
    }
    for(const [id,p] of Object.entries(value.edges)){
      if(!model.edges.some(e=>e.renderId===id)||!object(p)||Object.keys(p).sort().join()!=='from,to'||![p.from,p.to].every(s=>['top','right','bottom','left'].includes(s)))throw Error();
    }
    return value;
  }catch{throw new Error('画板布局无效：请检查节点、连线、坐标和连接点');}
}
function writeLayout(source,layout) {
  const eol=source.includes('\r\n')?'\r\n':'\n',line=`%% asl-layout ${JSON.stringify(layout)}${eol}`;
  const populated=Object.keys(layout.nodes).length||Object.keys(layout.edges).length;
  const next=[...source.matchAll(layoutLine)].length?source.replace(layoutLine,populated?line:''):populated?source+(source.endsWith('\n')?'':eol)+line:source;
  readLayout(next);return next;
}
export const diagramLabel=text=>String(text).replace(/["<>#`\r\n\u2028\u2029]/g,c=>`#${c.codePointAt(0)};`);

// A literal heading outline. Semantic work patterns must be authored, never guessed.
export function outlineFor(text='') {
  const body=text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,'');
  const headings=marked.lexer(body).filter(t=>t.type==='heading').slice(0,28);
  if(headings.length<2)return '';
  const stack=[{depth:headings[0].depth,level:1}];
  return ['mindmap',`  root(("${diagramLabel(headings[0].text)}"))`,...headings.slice(1).map((h,i)=>{
    while(stack.length>1&&stack.at(-1).depth>=h.depth)stack.pop();
    const level=stack.at(-1).level+1;stack.push({depth:h.depth,level});
    return `${'  '.repeat(level)}s${i}["${diagramLabel(h.text)}"]`;
  })].join('\n');
}
