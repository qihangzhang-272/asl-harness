const fs=require('node:fs/promises');
const path=require('node:path');
const parse=value=>{if(value&&typeof value==='object')return value;try{return JSON.parse(value);}catch{return {};}};

// Read the host's durable tool pairs; canvas selection never enters this projection.
function executionSnapshot(events,status,skills){
  const calls=new Map(),artifacts=new Map();let turn=0;
  for(const event of events){
    const data=event.data||{};
    if(event.type==='turn/start'){
      turn=data.turn;
      for(const call of calls.values())if(call.status==='running')call.status='interrupted';
    }
    if(event.type==='turn/end')for(const call of calls.values())if(call.status==='running')call.status='interrupted';
    if(event.type==='tool/call')calls.set(data.callId,{id:data.callId,name:data.name,args:parse(data.arguments),seq:event.seq,turn:data.turn,status:'running'});
    if(event.type!=='tool/result')continue;
    const message=data.message||{},call=calls.get(message.callId);if(!call)continue;
    call.status=message.isError?'failed':'completed';
    if(message.isError)continue;
    const args=call.args;
    let artifact;
    if(call.name==='asl_workspace'&&args.action==='artifact'){
      const text=(message.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('');
      artifact=parse(text).artifact;
    }else if(['write','edit','write_file','edit_file','create_file','apply_patch'].includes(call.name)){
      const file=args.file_path||args.path||args.filePath||args.filename;
      if(typeof file==='string')artifact={path:file};
    }
    if(typeof artifact?.path==='string')artifacts.set(artifact.path,{...artifact,callId:call.id,seq:event.seq});
  }
  const tools=[...calls.values()];
  const active=tools.filter(call=>call.status==='running');
  if(status!=='running')for(const call of active)call.status='interrupted';
  let activeSkill=null,recentSkill=null;
  for(const call of tools){
    const args=call.args,name=call.name==='asl_workspace'&&args.action==='read'?parse(args.args).identifier:call.name==='skill'?(args.name||args.skill):null;
    const skill=skills.find(s=>s.id===name);if(skill&&['running','completed'].includes(call.status)){recentSkill={id:skill.id,title:skill.title};if(status==='running'&&call.status==='running')activeSkill=recentSkill;}
  }
  return {status,turn,activeSkill,recentSkill,tools:tools.slice(-16).map(({args,...call})=>call),artifacts:[...artifacts.values()].slice(-30)};
}

async function checkedPath(root,value){
  if(typeof value!=='string'||value.includes('\0'))throw new Error('文件路径无效');
  const base=await fs.realpath(root),target=await fs.realpath(path.resolve(base,value));
  const relative=path.relative(base,target);
  if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('文件超出当前工作目录');
  if(relative.toLowerCase().split(path.sep).some(part=>['.git','.ssh','.aws','.env','credentials.json','id_rsa','id_ed25519'].includes(part)||part.startsWith('.env.')&&part!=='.env.example')||/\.(pem|key|pfx|p12)$/i.test(relative))throw new Error('不预览账号或环境秘密文件');
  return {path:target,relative:relative.split(path.sep).join('/'),directory:(await fs.stat(target)).isDirectory()};
}
module.exports={executionSnapshot,checkedPath};
