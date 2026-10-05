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
    const note=text.match(/^(\s*Note\s+(?:over|left of|right of)\s+([^:]+):\s*)(.*)$/i);
    if(note){add(line,'note',note[1],note[3],'',{scope,participants:note[2].split(',').map(s=>s.trim())});continue;}
    if(/^Note\s+(?:over|left of|right of)\s+[^:]+$/i.test(trim)){noteBlock=true;model.structural=false;continue;}
    const start=text.match(/^(\s*(?:alt|loop|opt|par(?: over)?|critical|break)\s+)(.*)$/);
    if(start){const item=add(line,'condition',start[1],start[2],'',{scope,block:start[1].trim(),first:true});stack.push({branch:line,labels:[item]});continue;}
    const branch=text.match(/^(\s*(?:else|and|option)\s*)(.*)$/);
    if(branch&&stack.at(-1)?.labels){const group=stack.at(-1);group.branch=line;group.labels.push(add(line,'condition',branch[1],branch[2],'',{scope:group.labels[0].scope}));continue;}
    if(trim==='end'){
      const block=stack.pop();
      if(block?.labels){block.labels.forEach((item,i)=>{item.end=i===0?line+1:block.labels[i+1]?.line??line;item.blockStart=block.labels[0].line;item.blockEnd=line;});controls.push(block.labels);}
      continue;
    }
    if(/^(box|rect)\b/.test(trim)){stack.push({branch:line});continue;}
    if(/^(activate|deactivate|create|destroy)\b/.test(trim)){model.activation=true;continue;}
    if(/^(autonumber|title|accTitle|accDescr)\b/.test(trim))continue;
    model.structural=false;
  }
  if(stack.length)model.structural=false;
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
  const childIndent=parent=>model.items.find(i=>i.parent===parent.key)?.indent??parent.indent+2;
  if(!model.type)throw new Error('此图请在 Mermaid 原文中修改');
  const insert=(at,text)=>{
    if(at===lines.length&&lines.length&&!lines.at(-1).endsWith('\n'))lines[lines.length-1]+=eol;
    lines.splice(at,0,text+eol);
  };
  if(model.type==='sequenceDiagram'&&(['connect','wrap','branch','retarget'].includes(change.kind)||change.kind==='note'&&!change.key)) {
    if(!model.structural||model.activation)throw new Error('此结构含生命期或复杂语法，不能安全调整');
    const participants=model.items.filter(i=>i.kind==='participant');
    if(change.kind==='retarget') {
      if(item?.kind!=='message'||!['from','to'].includes(change.endpoint))throw new Error('请选择需要调整的消息');
      if(!participants.some(p=>p.id===change.id))throw new Error('请先选择已有参与者');
      const pattern=change.endpoint==='from'?new RegExp(`^(\\s*)${escape(item.from)}(?=\\s*[-<])`):new RegExp(`${escape(item.to)}(?=\\s*:)`);
      const prefix=item.prefix.replace(pattern,change.endpoint==='from'?`$1${change.id}`:change.id);
      lines[item.line]=prefix+lines[item.line].slice(item.prefix.length);
    }else if(change.kind==='connect'||change.kind==='note') {
      const ids=change.kind==='connect'?[change.from,change.to]:[change.id];
      if(!ids.every(id=>participants.some(p=>p.id===id)))throw new Error('请先选择已有参与者');
      if(change.key&&!item)throw new Error('图已改变，请重新选择');
      const at=item&&['message','note'].includes(item.kind)?item.line+1:lines.length;
      insert(at,change.kind==='connect'?`${change.from}->>${change.to}: ${quote(change.label||'消息')}`:`Note over ${change.id}: ${quote(change.label||'备注')}`);
    }else {
      if(!item)throw new Error('图已改变，请重新选择');
      if(change.kind==='wrap') {
        if(!['message','note'].includes(item.kind)||!['alt','loop','par'].includes(change.block))throw new Error('请选择消息或备注添加条件');
        if(!lines[item.line].endsWith('\n'))lines[item.line]+=eol;
        lines.splice(item.line+1,0,`end${eol}`);
        lines.splice(item.line,0,`${change.block} ${change.block==='loop'?'重复处理':change.block==='par'?'并行处理':'条件成立'}${eol}`);
      }else {
        const first=model.items.find(i=>i.line===item.blockStart);
        if(!first||!['alt','par','critical'].includes(first.block)||!participants.length)throw new Error('此分组不能添加分支');
        insert(item.blockEnd,`${first.block==='alt'?'else':first.block==='par'?'and':'option'} 其他情况${eol}Note over ${participants[0].id}: 新分支`);
      }
    }
    return lines.join('');
  }
  if(change.kind==='add') {
    if(!model.structural||!new RegExp(`^${id}$`).test(change.id)||model.items.some(i=>i.id===change.id))throw new Error('无法安全添加，请检查原文中的节点标识');
    if(model.type==='sequenceDiagram')lines.splice(model.header+1,0,`participant ${change.id} as ${quote(change.label)}${eol}`);
    else {
      const parent=model.items.find(i=>i.key===change.parent)||model.items[0];
      if(!parent)throw new Error('请先定义根节点');
      if(parent.end===lines.length&&!lines.at(-1).endsWith('\n'))lines[lines.length-1]+=eol;
      lines.splice(parent.end,0,`${' '.repeat(childIndent(parent))}${change.id}["${quote(change.label)}"]${eol}`);
    }
    return lines.join('');
  }
  if(!item)throw new Error('图已改变，请重新选择');
  if(change.kind==='move'||change.remove) {
    if(!model.structural)throw new Error('此结构包含复杂语法，请在原文中调整');
    if(model.activation)throw new Error('此图包含激活或动态参与者，请在原文中调整顺序');
    if(item.kind==='condition'&&!item.end)throw new Error('条件结构尚未闭合');
    if(model.type==='mindmap'&&!item.parent)throw new Error('不能移动或删除根节点');
    const end=model.type==='mindmap'||item.kind==='condition'?item.end:item.line+1;
    if(change.remove) {
      if(item.kind==='participant'){
        if(model.items.filter(i=>i.kind==='participant').length<2)throw new Error('至少保留一个参与者');
        for(const related of model.items)if(related.from===item.id||related.to===item.id||related.participants?.includes(item.id))lines[related.line]='';
      }
      lines.splice(item.line,end-item.line);
      return lines.join('');
    }
    const to=model.items.find(i=>i.key===change.to);
    if(!to)throw new Error('目标已改变，请重新选择');
    if(to.key===item.key)return source;
    let at=to.line,indent;
    if(model.type==='mindmap') {
      if(to.line>=item.line&&to.line<item.end)throw new Error('不能移入自己的子节点');
      if(change.placement==='inside'){at=to.end;indent=childIndent(to);}
      else {if(!to.parent)throw new Error('根节点不能有同级节点');at=change.placement==='after'?to.end:to.line;indent=to.indent;}
    }else {
      if((item.kind==='participant')!==(to.kind==='participant')||item.scope!==to.scope||item.kind==='condition'&&!item.first||to.kind==='condition'&&!to.first)throw new Error('只能在同一分支中调整内容');
      if(to.line>item.line&&to.line<end)throw new Error('不能将分组移入自身');
      at=change.placement==='after'?(to.kind==='condition'?to.end:to.line+1):to.line;
    }
    const moving=lines.slice(item.line,end).map(raw=>indent==null||!raw.trim()?raw:' '.repeat(Math.max(0,raw.match(/^\s*/)[0].length+indent-item.indent))+raw.trimStart());
    if(moving.length&&!moving.at(-1).endsWith('\n'))moving[moving.length-1]+=eol;
    if(at===lines.length&&!lines.at(-1).endsWith('\n'))lines[lines.length-1]+=eol;
    lines.splice(item.line,end-item.line);if(at>=end)at-=end-item.line;
    lines.splice(at,0,...moving);return lines.join('');
  }
  if(typeof change.label!=='string')throw new Error('不支持的结构修改');
  let label=quote(change.label);
  if(model.type==='mindmap')label=label.replace(/[()[\]{}]/g,c=>`#${c.charCodeAt(0)};`);
  lines[item.line]=item.prefix+label+item.suffix+(lines[item.line].endsWith('\n')?eol:'');
  return lines.join('');
}
