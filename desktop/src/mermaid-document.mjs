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
      const start=text.indexOf(token.raw,offset);if(start>=0)offset=start+token.raw.length;
      result.push({title,source:token.text,line:start<0?null:text.slice(0,start).split('\n').length,start,raw:token.raw});
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
const nodeLine=new RegExp(`^(\\s*)(${identifier})\\s*(\\[\\[|\\(\\(|\\[|\\(|\\{)("[^"\\r\\n]*"|[^"\\[\\](){}\\r\\n]*?)(\\]\\]|\\)\\)|\\]|\\)|\\})([ \\t]*;?[ \\t]*)$`);
const edgeLine=new RegExp(`^(\\s*)(${identifier})\\s*(-->|---|-\\.->|==>)\\s*(?:\\|("[^"\\r\\n]*"|[^|\\r\\n]*)\\|\\s*)?(${identifier})([ \\t]*;?[ \\t]*)$`);
const unquote=text=>text?.replace(/^"|"$/g,'').replace(/#(\d+);/g,(raw,code)=>Number(code)<=0x10ffff?String.fromCodePoint(Number(code)):raw)||'';
const editLabel=text=>diagramLabel(text).replaceAll('|','#124;');
export function flowchartItems(source='') {
  const nodes=[],edges=[],lines=source.match(/[^\n]*\n|[^\n]+$/g)||[];
  let header=false,editable=true;
  lines.forEach((raw,line)=>{
    const text=raw.replace(/\r?\n$/,'');
    if(!text.trim()||/^\s*%%(?!\{)/.test(text))return;
    if(!header&&/^\s*(?:flowchart|graph)\s+(?:LR|RL|TD|TB|BT)\s*;?\s*$/.test(text)){header=true;return;}
    const node=text.match(nodeLine),edge=text.match(edgeLine);
    if(node&&({'[':']','[[':']]','(':')','((':'))','{':'}'}[node[3]]===node[5])){
      if(nodes.some(n=>n.id===node[2]&&!n.implicit)){editable=false;return;}
      const previous=nodes.findIndex(n=>n.id===node[2]);
      if(previous>=0)nodes.splice(previous,1);
      nodes.push({id:node[2],label:unquote(node[4]),line,parts:node});
    }else if(edge){
      const parallel=edges.filter(e=>e.from===edge[2]&&e.to===edge[5]).length;
      // Mermaid 12 FlowDB uses 0 for the first edge, then 2, 3… for parallel edges.
      edges.push({from:edge[2],to:edge[5],renderId:`L_${edge[2]}_${edge[5]}_${parallel?parallel+1:0}`,label:unquote(edge[4]),index:edges.length,line,parts:edge});
      for(const id of [edge[2],edge[5]])if(!nodes.some(n=>n.id===id))nodes.push({id,label:id,implicit:true});
    }else editable=false;
  });
  return {editable:header&&editable,lines,nodes,edges};
}
export function editFlowchart(source,change) {
  const model=flowchartItems(source),lines=[...model.lines],eol=source.includes('\r\n')?'\r\n':'\n';
  if(!model.editable)throw new Error('此图的语法请在原文中修改；不会转换或丢弃原有内容');
  const append=text=>{if(lines.length&&!lines.at(-1).endsWith('\n'))lines[lines.length-1]+=eol;lines.push(text+eol);};
  if(change.kind==='direction'){
    if(!['LR','RL','TD','TB','BT'].includes(change.direction))throw new Error('图的方向无效');
    const line=lines.findIndex(line=>/^\s*(?:flowchart|graph)\s+/.test(line));
    lines[line]=lines[line].replace(/\b(LR|RL|TD|TB|BT)\b/,change.direction);
  }else if(change.kind==='move'){
    const from=model.nodes.find(n=>n.id===change.key),to=model.nodes.find(n=>n.id===change.to);
    if(!from||!to||from.implicit||to.implicit)throw new Error('请先明确这两个节点的名称');
    if(from.id===to.id)return source;
    const moving=lines[from.line].replace(/\r?\n$/,'')+eol;
    let at=to.line+(change.placement==='after'?1:0);
    if(at===lines.length&&!lines.at(-1).endsWith('\n'))lines[lines.length-1]+=eol;
    lines.splice(from.line,1);if(at>from.line)at--;
    lines.splice(at,0,moving);
  }else if(change.kind==='node'){
    const node=model.nodes.find(n=>n.id===change.id);
    if(!node)throw new Error('节点已改变，请重新选择');
    if(change.remove){
      if(node.line!=null)lines[node.line]='';
      for(const edge of model.edges)if(edge.from===node.id||edge.to===node.id)lines[edge.line]='';
    }else if(node.implicit)append(`${node.id}["${editLabel(change.label)}"]`);
    else {const p=node.parts;lines[node.line]=`${p[1]}${p[2]}${p[3]}"${editLabel(change.label)}"${p[5]}${p[6]}${lines[node.line].endsWith('\n')?eol:''}`;}
  }else if(change.kind==='edge'){
    const edge=model.edges[change.index];
    if(!edge)throw new Error('连线已改变，请重新选择');
    const p=edge.parts;
    lines[edge.line]=change.remove?'':`${p[1]}${p[2]} ${p[3]}${change.label?`|"${editLabel(change.label)}"|`:''} ${p[5]}${p[6]}${lines[edge.line].endsWith('\n')?eol:''}`;
  }else if(change.kind==='connect'){
    if(![change.from,change.to].every(id=>model.nodes.some(n=>n.id===id)))throw new Error('请先选择已有节点');
    append(`${change.from} -->${change.label?`|"${editLabel(change.label)}"|`:''} ${change.to}`);
  }else if(change.kind==='add'){
    if(!new RegExp(`^${identifier}$`).test(change.id)||model.nodes.some(n=>n.id===change.id))throw new Error('节点标识无效或已经存在');
    append(`${change.id}["${editLabel(change.label)}"]`);
  }else throw new Error('不支持的图修改');
  return lines.join('');
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
