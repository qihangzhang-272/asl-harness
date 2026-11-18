const test=require('node:test');
const assert=require('node:assert/strict');
const {registerHooks}=require('node:module');
const {pathToFileURL}=require('node:url');
const {mkdtempSync,mkdirSync,writeFileSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {Readable}=require('node:stream');

async function loadHost(){
  const modules={
    '@deepseek-ai/cordis':'export class Service {constructor(ctx){ctx.service=this;}}',
    '@deepseek-ai/dsh-tools':'export const defineTool=value=>value;',
    '@deepseek-ai/schemastery':'const field=()=>({required(){this.isRequired=true;return this},description(){return this},default(){return this}});export default {string:field,array:field,dict:field,object:fields=>fields};',
  };
  const hooks=registerHooks({resolve(specifier,context,next){return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});
  try{return await import(pathToFileURL(path.join(__dirname,'../host.js')).href);}finally{hooks.deregister();}
}
const host=loadHost();

async function mount(config,services={}){
  const plugin=await host;
  let handler,tool,prompt;
  const ctx={get:name=>services[name]||null,connection:{requestRejection:()=>null},webServer:{register(value){handler=value.handler;}},tools:{register(value){tool=value;}},effect:fn=>fn(),inject(_services,fn){fn({systemPrompt:{context(value){prompt=value;}}});}};
  plugin.apply(ctx,config);
  return {plugin,ctx,tool,prompt,async api(action,args={}){
    const req=Readable.from([JSON.stringify({action,args})]);Object.assign(req,{url:'/asl-workspace/api',method:'POST',headers:{}});
    let status,body;
    await handler(req,{writeHead(value){status=value;},end(value){body=JSON.parse(value);}});
    return {status,...body};
  }};
}

test('market install mounts without ASL paths and guides API and Agent setup',async()=>{
  const app=await mount({});
  assert.ok(!app.plugin.Config.sourceRoot.isRequired);
  assert.ok(!app.plugin.Config.environment.isRequired);
  assert.equal(app.prompt.text({agent:{session:{id:'s'}}}),'');
  for(const action of ['catalog','changes','setContext']){
    const response=await app.api(action);
    assert.equal(response.status,400);assert.equal(response.code,'ASL_SETUP_REQUIRED');
    assert.match(response.error,/sourceRoot/);assert.match(response.error,/environment/);assert.match(response.error,/cordis.patch.yml/);
  }
  await assert.rejects(()=>app.tool.execute({action:'catalog'},{agent:{session:{id:'s'}}}),{code:'ASL_SETUP_REQUIRED'});
});

test('missing bridge in a non-recursive Git install cannot crash plugin activation',async()=>{
  const root=mkdtempSync(path.join(tmpdir(),'asl-host-missing-'));
  try{
    const app=await mount({sourceRoot:root,environment:root});
    assert.equal(app.prompt.text({}),'');
    const response=await app.api('catalog');
    assert.equal(response.code,'ASL_SETUP_INVALID');assert.match(response.error,/desktop\/bridge.cjs/);
    await assert.rejects(()=>app.tool.execute({action:'catalog'},{agent:{session:{id:'s'}}}),{code:'ASL_SETUP_INVALID'});
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('configured host still shares its domain between API, prompt and Agent',async()=>{
  const root=mkdtempSync(path.join(tmpdir(),'asl-host-ready-'));
  try{
    mkdirSync(path.join(root,'desktop'));
    writeFileSync(path.join(root,'desktop/bridge.cjs'),'exports.runCore=async()=>({modes:[],skills:[]});');
    for(const name of ['market','repository-import'])writeFileSync(path.join(root,'desktop',name+'.cjs'),'module.exports={};');
    const app=await mount({sourceRoot:root,environment:root});
    const response=await app.api('catalog');
    assert.equal(response.status,200);assert.deepEqual(response.result.modes,[]);assert.equal(response.result.cwd,root);
    await app.api('setContext',{sessionId:'s',view:{mode:'creator',kind:'skill',identifier:'writing',file:'SKILL.md'}});
    const context=JSON.parse(await app.tool.execute({action:'context'},{agent:{session:{id:'s'}}}));
    assert.equal(context.identifier,'writing');assert.match(app.prompt.text({agent:{session:{id:'s'}}}),/writing/);
  }finally{rmSync(root,{recursive:true,force:true});}
});


test('artifact receipts use the executing session directory and reject missing, secret and definition files',async()=>{
  const root=mkdtempSync(path.join(tmpdir(),'asl-artifact-'));
  try{
    mkdirSync(path.join(root,'desktop'));mkdirSync(path.join(root,'skills/writing'),{recursive:true});mkdirSync(path.join(root,'modes'));
    writeFileSync(path.join(root,'desktop/bridge.cjs'),'exports.runCore=async()=>({modes:[],skills:[{id:"writing",path:'+JSON.stringify(path.join(root,'skills/writing'))+'}]});');
    for(const name of ['market','repository-import'])writeFileSync(path.join(root,'desktop',name+'.cjs'),'module.exports={};');
    writeFileSync(path.join(root,'article.md'),'# 真实产物');writeFileSync(path.join(root,'.env'),'SECRET');writeFileSync(path.join(root,'skills/writing/SKILL.md'),'# 技能');
    const events=[];
    const sessions={get:id=>id==='session-a'?{header:{cwd:root},snapshotEvents:()=>events}:null};
    const app=await mount({sourceRoot:root,environment:root},{sessions,agents:{get:()=>({status:'idle'})}});
    const result=JSON.parse(await app.tool.execute({action:'artifact',args:{path:'article.md',sessionId:'spoofed'}},{agent:{session:{id:'session-a'}}}));
    assert.equal(result.artifact.path,path.join(root,'article.md'));
    events.push(
      {seq:1,type:'turn/start',data:{turn:1}},
      {seq:2,type:'tool/call',data:{turn:1,callId:'write-1',name:'write',arguments:'{"file_path":"article.md"}'}},
      {seq:3,type:'tool/result',data:{turn:1,message:{role:'tool',toolCallId:'write-1',content:[{type:'text',text:'Written'}],isError:false}}},
      {seq:4,type:'tool/call',data:{turn:1,callId:'artifact-1',name:'asl_workspace',arguments:'{"action":"artifact","args":{"path":"article.md"}}'}},
      {seq:5,type:'tool/result',data:{turn:1,message:{role:'tool',toolCallId:'artifact-1',content:[{type:'text',text:JSON.stringify(result)}],isError:false}}},
      {seq:6,type:'turn/end',data:{turn:1,reason:{kind:'completed'}}},
    );
    const activity=(await app.api('activity',{sessionId:'session-a'})).result;
    assert.deepEqual(activity.tools.map(tool=>tool.status),['completed','completed']);
    assert.equal(activity.status,'completed');
    assert.deepEqual(activity.artifacts.map(artifact=>artifact.path),[result.artifact.path]);
    const preview=await app.api('artifactPreview',{sessionId:'session-a',path:'article.md'});assert.equal(preview.result.document,'# 真实产物');
    for(const file of ['missing.md','.env','skills/writing/SKILL.md'])assert.equal((await app.api('artifact',{sessionId:'session-a',path:file})).status,400);
    assert.equal((await app.api('activity',{sessionId:'unknown'})).status,400);
    await assert.rejects(()=>app.tool.execute({action:'artifactPreview',args:{path:'article.md'}},{agent:{session:{id:'session-a'}}}),/仅用于界面/);
  }finally{rmSync(root,{recursive:true,force:true});}
});
