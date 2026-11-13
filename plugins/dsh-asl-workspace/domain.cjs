const path = require('node:path');
const id = value => { if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/.test(value)) throw new Error('标识无效'); return value; };
const text = value => { if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value)>1024*1024) throw new Error('内容不能为空或超过 1 MB'); return value; };

// The only copy of Mode/Skill truth and its write gate remains in the existing core.
class WorkspaceDomain {
  constructor({sourceRoot, environment, storage, python, coreExecutable, bindings = {}}, dependencies = {}) {
    this.environment = environment;
    this.storage = storage;
    this.bindings = bindings;
    this.root = sourceRoot;
    this.bridge = dependencies.bridge || require(path.join(sourceRoot, 'desktop/bridge.cjs'));
    this.market = dependencies.market || require(path.join(sourceRoot, 'desktop/market.cjs'));
    this.repository = dependencies.repository || require(path.join(sourceRoot, 'desktop/repository-import.cjs'));
    this.call = (action, values, signal) => this.bridge.runCore(action, values, {root:sourceRoot, python, executable:coreExecutable, signal});
    this.repositories = new Map();
    this.queue = Promise.resolve();
    this.revision=Date.now();
    this.views=new Map();
    this.viewRevision=0;
  }
  updateContext(sessionId,view) {
    if(typeof sessionId!=='string'||!sessionId||sessionId.length>200)throw new Error('会话标识无效');
    if(view===null){this.views.delete(sessionId);return null;}
    if(!view||!['mode','skill'].includes(view.kind))throw new Error('工作上下文无效');
    const value={mode:id(view.mode),kind:view.kind,identifier:id(view.identifier),file:view.kind==='mode'?'MODE.md':view.file,dirty:!!view.dirty,diagram:view.diagram||null,selection:view.selection||[],region:view.region||null};
    if(typeof value.file!=='string'||!value.file||value.file.length>1000||value.file.includes('..')||path.isAbsolute(value.file))throw new Error('文件路径无效');
    if(JSON.stringify(value).length>16000)throw new Error('工作上下文过大');
    const previous=this.views.get(sessionId),key=JSON.stringify(value);
    const entry={...value,contextRevision:previous?.key===key?previous.contextRevision:++this.viewRevision,key,seen:Date.now()};
    this.views.set(sessionId,entry);
    return this.context(sessionId);
  }
  context(sessionId) {
    const entry=this.views.get(sessionId);
    if(!entry||Date.now()-entry.seen>10000)return null;
    const {key,seen,...view}=entry;return view;
  }
  assertAgentWrite(sessionId,args,adopt=false) {
    const view=this.context(sessionId);
    if(!view)throw new Error('工作区未连接；请打开目标 Mode 后重新读取 context');
    if(view.dirty)throw new Error('界面有未保存修改，请先保存或放弃草稿，再让 DeepSeek 修改');
    if(args.contextRevision!==view.contextRevision)throw new Error('当前文件或选区已变化，请重新读取 context 和原文');
    if(adopt?args.mode!==view.mode:args.kind!==view.kind||args.identifier!==view.identifier||(args.file|| (args.kind==='mode'?'MODE.md':'SKILL.md'))!==view.file)throw new Error('修改目标不是当前工作内容，请先打开目标文件');
  }
  async catalog(signal) {
    const result = await this.call('catalog',{workspace:this.environment},signal);
    return {...result, protocol:'asl-dsh-workspace/v0.1', bindings:this.bindings};
  }
  async recommend(goal, signal) {
    text(goal);
    const catalog = await this.catalog(signal);
    const words = goal.toLowerCase().match(/[a-z0-9-]{2,}/g)||[];
    for(const phrase of goal.match(/[\u4e00-\u9fff]+/g)||[])for(let i=0;i<phrase.length-1;i++)words.push(phrase.slice(i,i+2));
    const ranked = await Promise.all(catalog.modes.map(async mode=>{
      const file=await this.call('modeFiles',{workspace:this.environment,mode:mode.id,file:'MODE.md'},signal);
      const description=file.document.split(/\n## /)[0];
      const haystack=`${mode.id} ${mode.title} ${description}`.toLowerCase();
      const matched=[...new Set(words)].filter(word=>haystack.includes(word));
      return {id:mode.id,title:mode.title,score:matched.length,matched};
    }));
    ranked.sort((a,b)=>b.score-a.score);
    // An ambiguous request stays a choice; it must not silently activate an unrelated Mode.
    const selected=ranked[0]?.score>0 && ranked[0].score>(ranked[1]?.score||0)?ranked[0].id:null;
    return {selected,ranked,reason:selected?'依据 Mode 名称与用途匹配；可手动切换':'用途未能唯一匹配，请选取 Mode'};
  }
  async read(kind, identifier, file, signal) {
    if(!['mode','skill'].includes(kind))throw new Error('文件类型无效');
    return this.call(kind==='mode'?'modeFiles':'files',{workspace:this.environment,[kind==='mode'?'mode':'skill']:id(identifier),file:file||(kind==='mode'?'MODE.md':'SKILL.md')},signal);
  }
  serialize(work) {
    const next=this.queue.then(work);this.queue=next.catch(()=>{});return next;
  }
  async save(args,signal,sessionId) {
    return this.serialize(async()=>{
      if(sessionId)this.assertAgentWrite(sessionId,args);
      const {kind,identifier,file,document,expected}=args;
      text(document);
      const current=await this.read(kind,identifier,file,signal);
      if(current.fingerprint!==expected)throw new Error('原文件已变化，请重新读取并合并修改');
      let request;
      if(kind==='mode'){
        if(current.file!=='MODE.md')throw new Error('这里只编辑 MODE.md');
        const catalog=await this.catalog(signal),mode=catalog.modes.find(m=>m.id===identifier);
        const skills=args.skills||[];if(!Array.isArray(skills)||skills.some(id=>!catalog.skills.some(s=>s.id===id)))throw new Error('引用了不存在的技能');
        request={operation:'mode.save',id:mode.id,expected,document,skills:[...new Set([...mode.roots,...skills])],placement:'shared'};
      }else request={operation:'skill.file.save',id:identifier,file:current.file,expected,document};
      if(sessionId)this.assertAgentWrite(sessionId,args);
      await this.call('edit',{workspace:this.environment,request,apply:true},signal);
      this.revision++;
      return this.read(kind,identifier,current.file,signal);
    });
  }
  async adopt(args,signal,sessionId){
    return this.serialize(async()=>{
      if(sessionId)this.assertAgentWrite(sessionId,args,true);
      const entry=this.repositories.get(args.snapshot),skill=entry?.report?.skills?.find(s=>s.source===args.source);
      if(!skill)throw new Error('请重新下载并检查技能包');
      const catalog=await this.catalog(signal);
      if(catalog.skills.some(s=>s.id===skill.id))throw new Error('同名技能已存在，请直接加入画板');
      if(!catalog.modes.some(m=>m.id===args.mode))throw new Error('请选择现有 Mode');
      const request={operation:'skill.import',id:skill.id,source:skill.source,sourceOrigin:entry.repo.url+'@'+entry.repo.commit,mode:args.mode,placement:'shared'};
      const preview=await this.call('edit',{workspace:this.environment,request},signal);
      if(sessionId)this.assertAgentWrite(sessionId,args,true);
      await this.call('edit',{workspace:this.environment,apply:true,request:{...request,expectedSource:preview.sourceFingerprint}},signal);
      this.revision++;
      return {id:skill.id,source:request.sourceOrigin,next:'read 当前 Mode 的 MODE.md，再 save 添加 Mermaid 节点和 %% asl-bind 注释。每次只加入一个技能，界面即时更新。'};
    });
  }
  async dispatch(action,args={}, {signal,sessionId}={}) {
    signal?.throwIfAborted();
    if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('工作区参数必须是对象');
    switch(action){
      case 'context':return this.context(sessionId);
      case 'changes':return {revision:this.revision};
      case 'catalog':return this.catalog(signal);
      case 'recommend':return this.recommend(args.goal,signal);
      case 'read':return this.read(args.kind,args.identifier,args.file,signal);
      case 'save':return this.save(args,signal,sessionId);
      case 'discover':return this.market.discover('github',args.query,fetch);
      case 'repository':return this.repository.readRepository(args.url,{fetch,core:(action,values,s)=>this.call(action,values,s),temp:path.join(this.storage,'downloads'),repositories:this.repositories,cacheRoot:path.join(this.storage,'cache')},signal);
      case 'adopt':return this.adopt(args,signal,sessionId);
      default:throw new Error('未知工作区操作');
    }
  }
}
module.exports={WorkspaceDomain};
