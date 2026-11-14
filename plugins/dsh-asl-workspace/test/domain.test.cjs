const test=require('node:test');
const assert=require('node:assert/strict');
const {WorkspaceDomain}=require('../domain.cjs');
function fixture(){
  let document='# 投研工作\n\n研究资料。',fingerprint='before',version=0;
  const calls=[];
  const mode={id:'investment',title:'投研工作',skills:['research'],roots:['research'],architecture:{shared:['research'],paradigms:[]},capabilities:null};
  const domain=new WorkspaceDomain({sourceRoot:'.',environment:'test',storage:'.'},{market:{},repository:{},bridge:{async runCore(action,values){
    calls.push({action,values});
    if(action==='catalog')return {modes:[mode,{id:'creator',title:'公众号创作',skills:[]}],skills:[{id:'research',title:'研究'},{id:'writing',title:'写作'}]};
    if(action==='modeFiles'||action==='files')return {document:values.mode==='creator'?'# 公众号创作\n\n公众号文章与卡片。':document,fingerprint,file:values.file,files:[]};
    if(action==='edit'){assert.equal(values.request.expected,fingerprint);document=values.request.document;fingerprint='v'+(++version);return{ok:true};}
  }}});
  return{domain,calls,change(){fingerprint='external';},document:()=>document};
}
test('UI and Agent save directly through the same core and notify observers',async()=>{
  const {domain,calls,document}=fixture();const before=await domain.dispatch('changes');
  await domain.dispatch('save',{kind:'skill',identifier:'research',file:'SKILL.md',document:'# 修改',expected:'before'});
  assert.equal(document(),'# 修改');assert.equal(calls.filter(c=>c.action==='edit').length,1);
  assert.ok((await domain.dispatch('changes')).revision>before.revision);
});
test('concurrent and stale file writes cannot overwrite newer content',async()=>{
  const {domain,change}=fixture();
  const args={kind:'skill',identifier:'research',file:'SKILL.md',document:'# 修改',expected:'before'};
  const results=await Promise.allSettled([domain.dispatch('save',args),domain.dispatch('save',args)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  change();await assert.rejects(()=>domain.dispatch('save',args),/原文件已变化/);
  await assert.rejects(()=>domain.dispatch('read',{kind:'skill',identifier:'../outside'}),/标识无效/);
});
test('recommendation uses authored purpose and leaves ambiguity open',async()=>{
  const {domain}=fixture();assert.equal((await domain.recommend('公众号文章')).selected,'creator');assert.equal((await domain.recommend('xyz-unknown')).selected,null);
});

test('Agent writes follow the calling session, latest view and editor draft state',async()=>{
  const {domain,document}=fixture();
  const view={mode:'investment',kind:'skill',identifier:'research',file:'SKILL.md',dirty:false};
  const a=domain.updateContext('session-a',view);
  const b=domain.updateContext('session-b',{...view,identifier:'writing'});
  assert.equal(domain.updateContext('session-a',view).contextRevision,a.contextRevision,'heartbeat must not invalidate an in-flight edit');
  assert.equal((await domain.dispatch('context',{}, {sessionId:'session-b'})).identifier,'writing');
  const args={...view,document:'# DeepSeek 修改',expected:'before',contextRevision:a.contextRevision};
  await assert.rejects(()=>domain.dispatch('save',args,{sessionId:'unknown'}),/工作区未连接/);
  await assert.rejects(()=>domain.dispatch('save',{...args,contextRevision:b.contextRevision},{sessionId:'session-b'}),/不是当前工作内容/);
  domain.updateContext('session-a',{...view,dirty:true});
  await assert.rejects(()=>domain.dispatch('save',args,{sessionId:'session-a'}),/未保存修改/);
  const next=domain.updateContext('session-a',view);
  await assert.rejects(()=>domain.dispatch('save',args,{sessionId:'session-a'}),/选区已变化/);
  const revision=(await domain.dispatch('changes')).revision;
  const saved=await domain.dispatch('save',{...args,contextRevision:next.contextRevision},{sessionId:'session-a'});
  assert.equal(document(),'# DeepSeek 修改');assert.equal(saved.document,document());
  assert.notEqual(saved.fingerprint,'before');assert.ok((await domain.dispatch('changes')).revision>revision);
  domain.updateContext('session-a',null);
  assert.equal(domain.context('session-a'),null);assert.ok(domain.context('session-b'));
});

test('queued Agent writes recheck the view after another operation finishes',async()=>{
  const {domain,document}=fixture();
  const view={mode:'investment',kind:'skill',identifier:'research',file:'SKILL.md'};
  const before=domain.updateContext('session',view);let release;
  domain.queue=new Promise(resolve=>{release=resolve;});
  const saving=domain.dispatch('save',{...view,document:'# 不应写入',expected:'before',contextRevision:before.contextRevision},{sessionId:'session'});
  domain.updateContext('session',{...view,identifier:'writing'});release();
  await assert.rejects(()=>saving,/选区已变化/);assert.equal(document(),'# 投研工作\n\n研究资料。');
});

test('closed or unresponsive workspaces cannot leave an editable stale target',()=>{
  const {domain}=fixture();
  domain.updateContext('session',{mode:'investment',kind:'mode',identifier:'investment'});
  domain.views.get('session').seen-=10001;
  assert.equal(domain.context('session'),null);
  assert.throws(()=>domain.assertAgentWrite('session',{}),/工作区未连接/);
});


test('inspection does not authorize skill writes; inline editing uses the same draft gate',async()=>{
  const {domain}=fixture();
  const mode={mode:'investment',kind:'mode',identifier:'investment',inspection:{kind:'skill',identifier:'research',file:'SKILL.md'}};
  const preview=domain.updateContext('session',mode);
  const args={kind:'skill',identifier:'research',file:'SKILL.md',document:'# 修改',expected:'before',contextRevision:preview.contextRevision};
  await assert.rejects(()=>domain.dispatch('save',args,{sessionId:'session'}),/不是当前工作内容/);
  domain.updateContext('session',{...mode,kind:'skill',identifier:'research',file:'SKILL.md',dirty:true});
  await assert.rejects(()=>domain.dispatch('save',args,{sessionId:'session'}),/未保存修改/);
  const editing=domain.updateContext('session',{...mode,kind:'skill',identifier:'research',file:'SKILL.md',dirty:false});
  const saved=await domain.dispatch('save',{...args,contextRevision:editing.contextRevision},{sessionId:'session'});
  assert.equal(saved.document,'# 修改');
});

test('file locations are limited to files and folders listed by the core',async()=>{
  const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'asl-skill-location-'));
  try{
    await fs.mkdir(path.join(root,'references'));await fs.writeFile(path.join(root,'SKILL.md'),'# skill');await fs.writeFile(path.join(root,'references/guide.md'),'guide');await fs.writeFile(path.join(root,'hidden.md'),'hidden');
    const {domain}=fixture();domain.catalog=async()=>({skills:[{id:'research',path:root}]});domain.read=async()=>({files:[{path:'SKILL.md'},{path:'references/guide.md'}]});
    assert.equal((await domain.fileLocation('research','references')).directory,true);
    assert.equal((await domain.fileLocation('research','SKILL.md')).path,path.join(root,'SKILL.md'));
    await assert.rejects(()=>domain.fileLocation('research','hidden.md'),/不在当前技能/);
    await assert.rejects(()=>domain.fileLocation('research','../outside'),/不在当前技能/);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
