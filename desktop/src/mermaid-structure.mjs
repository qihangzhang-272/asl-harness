import {diagramLabel} from './mermaid-document.mjs';

const id='[A-Za-z_][A-Za-z0-9_]*';
const participant=new RegExp(`^(\\s*(?:participant|actor)\\s+)(${id})(\\s+as\\s+)?(.*)$`);
const message=new RegExp(`^(\\s*)(${id})\\s*((?:<<)?--?(?:>>|>|x|\\)|\\|[\\\\/])?)([+-]?)\\s*(${id})(\\s*:\\s*)(.*)$`);
const decoded=text=>text.replace(/#(\d+);/g,(raw,n)=>Number(n)<=0x10ffff?String.fromCodePoint(Number(n)):raw).replace(/<br\s*\/?\s*>/gi,'\n');
const quote=text=>diagramLabel(text).replace(/#10;|#13;/g,'<br/>').replaceAll(';','#59;').replace(/#(\d+)#59;/g,'#$1;');
const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

// Source-preserving lenses, not a second Mermaid parser. Only the official renderer accepts a write.
export function structureItems(source='') {
  const lines=source.match(/[^\n]*\n|[^\n]+$/g)||[],items=[],controls=[],stack=[];
  const header=lines.findIndex(line=>/^\s*(sequenceDiagram|mindmap|stateDiagram-v2)\s*$/.test(line));
  const type=header<0?null:lines[header].trim();
  const model={type,lines,items,controls,header,structural:true,activation:false};
  let noteBlock=false;
  if(!type)return model;
  function add(line,kind,prefix,label,suffix='',extra={}) {
    const item={key:`line-${line}`,line,kind,prefix,label:decoded(label),suffix,...extra};items.push(item);return item;
  }
  for(let line=header+1;line<lines.length;line++) {
    const text=lines[line].replace(/\r?\n$/,''),trim=text.trim();
    if(noteBlock){if(/^end note$/i.test(trim))noteBlock=false;continue;}
    if(!trim||trim.startsWith('%%'))continue;
    if(type==='stateDiagram-v2') {
      model.structural=false;
      const state=text.match(new RegExp(`^(\\s*state\\s+")([^"]*)("\\s+as\\s+(${id})\\s*)$`));
      if(state)add(line,'node',state[1],state[2],state[3],{id:state[4]});
      continue;
    }
    if(type==='mindmap') {
      if(trim.startsWith('::'))continue;
      const indent=text.match(/^\s*/)[0];let found=false;
      for(const [open,close] of [['((', '))'],['{{','}}'],['))','(('],['[',']'],['(',')'],[')', '(']]) {
        const m=trim.match(new RegExp(`^([^\\s()[\\]{}]*?)${escape(open)}(.*?)${escape(close)}$`));
        if(!m)continue;
        const quoted=m[2].startsWith('"')&&m[2].endsWith('"');
        add(line,'node',indent+m[1]+open+(quoted?'"':''),quoted?m[2].slice(1,-1):m[2],(quoted?'"':'')+close,{id:m[1]||m[2],indent:indent.length});found=true;break;
      }
      if(!found) {
        if(/[()[\]{}"`]/.test(trim)){model.structural=false;continue;}
        add(line,'node',indent+trim+'[',trim,']',{id:trim,indent:indent.length});
      }
      continue;
    }
    const scope=stack.map(s=>s.branch).join('/'),p=text.match(participant),m=text.match(message);
    if(p&&(!p[4]||p[3])){if(items.some(i=>i.id===p[2]))model.structural=false;add(line,'participant',p[1]+p[2]+(p[3]||' as '),p[4]||p[2],'',{id:p[2],scope});continue;}
    if(m){add(line,'message',text.slice(0,text.length-m[7].length),m[7],'',{from:m[2],to:m[5],scope});if(m[4])model.activation=true;continue;}
    const note=text.match(/^(\s*Note\s+(?:over|left of|right of)\s+[^:]+:\s*)(.*)$/i);
    if(note){add(line,'note',note[1],note[2],'',{scope});continue;}
    if(/^Note\s+(?:over|left of|right of)\s+[^:]+$/i.test(trim)){noteBlock=true;model.structural=false;continue;}
    const start=text.match(/^(\s*(?:alt|loop|opt|par(?: over)?|critical|break)\s+)(.*)$/);
    if(start){const item=add(line,'condition',start[1],start[2]);stack.push({branch:line,labels:[item]});continue;}
    const branch=text.match(/^(\s*(?:else|and|option)\s*)(.*)$/);
    if(branch&&stack.length){stack.at(-1).branch=line;stack.at(-1).labels.push(add(line,'condition',branch[1],branch[2]));continue;}
    if(trim==='end'){const block=stack.pop();if(block?.labels)controls.push(block.labels);continue;}
    if(/^(box|rect)\b/.test(trim)){stack.push({branch:line});continue;}
    if(/^(activate|deactivate|create|destroy)\b/.test(trim)){model.activation=true;continue;}
    if(/^(autonumber|title|accTitle|accDescr)\b/.test(trim))continue;
    model.structural=false;
  }
  if(type==='mindmap') {
    const parents=[];
    for(const item of items){while(parents.length&&parents.at(-1).indent>=item.indent)parents.pop();item.parent=parents.at(-1)?.key||null;parents.push(item);}
    for(const item of items)item.end=items.find(next=>next.line>item.line&&next.indent<=item.indent)?.line??lines.length;
  }
  return model;
}

export function editStructure(source,change) {
  const model=structureItems(source),lines=[...model.lines],eol=source.includes('\r\n')?'\r\n':'\n';
  const item=model.items.find(i=>i.key===change.key);
  if(!model.type)throw new Error('此图请在 Mermaid 原文中修改');
  if(change.kind==='add') {
    if(!model.structural||!new RegExp(`^${id}$`).test(change.id)||model.items.some(i=>i.id===change.id))throw new Error('无法安全添加，请检查原文中的节点标识');
    if(model.type==='sequenceDiagram')lines.splice(model.header+1,0,`participant ${change.id} as ${quote(change.label)}${eol}`);
    else {
      const parent=model.items.find(i=>i.key===change.parent)||model.items[0];
      if(!parent)throw new Error('请先定义根节点');
      if(parent.end===lines.length&&!lines.at(-1).endsWith('\n'))lines[lines.length-1]+=eol;
      lines.splice(parent.end,0,`${' '.repeat(parent.indent+2)}${change.id}["${quote(change.label)}"]${eol}`);
    }
    return lines.join('');
  }
  if(!item)throw new Error('图已改变，请重新选择');
  if(change.kind==='move'||change.remove) {
    if(!model.structural)throw new Error('此结构包含复杂语法，请在原文中调整');
    if(model.activation)throw new Error('此图包含激活或动态参与者，请在原文中调整顺序');
    if(item.kind==='condition')throw new Error('条件结构请在原文中调整');
    if(model.type==='mindmap'&&!item.parent)throw new Error('不能移动或删除根节点');
    const end=model.type==='mindmap'?item.end:item.line+1;
    if(change.remove) {
      lines.splice(item.line,end-item.line);
      if(item.kind==='participant')throw new Error('移除参与者涉及消息与备注，请在原文中修改');
      return lines.join('');
    }
    const to=model.items.find(i=>i.key===change.to);
    if(!to)throw new Error('目标已改变，请重新选择');
    if(to.key===item.key)return source;
    let at=to.line,indent;
    if(model.type==='mindmap') {
      if(to.line>=item.line&&to.line<item.end)throw new Error('不能移入自己的子节点');
      if(change.placement==='inside'){at=to.end;indent=to.indent+2;}
      else {if(!to.parent)throw new Error('根节点不能有同级节点');at=change.placement==='after'?to.end:to.line;indent=to.indent;}
    }else {
      if(item.kind!==to.kind||item.scope!==to.scope)throw new Error('只能在同一分支中调整同类内容');
      at=change.placement==='after'?to.line+1:to.line;
    }
    const moving=lines.slice(item.line,end).map(raw=>indent==null||!raw.trim()?raw:' '.repeat(Math.max(0,raw.match(/^\s*/)[0].length+indent-item.indent))+raw.trimStart());
    if(moving.length&&!moving.at(-1).endsWith('\n'))moving[moving.length-1]+=eol;
    if(at===lines.length&&!lines.at(-1).endsWith('\n'))lines[lines.length-1]+=eol;
    lines.splice(item.line,end-item.line);if(at>=end)at-=end-item.line;
    lines.splice(at,0,...moving);return lines.join('');
  }
  let label=quote(change.label);
  if(model.type==='mindmap')label=label.replace(/[()[\]{}]/g,c=>`#${c.charCodeAt(0)};`);
  lines[item.line]=item.prefix+label+item.suffix+(lines[item.line].endsWith('\n')?eol:'');
  return lines.join('');
}
