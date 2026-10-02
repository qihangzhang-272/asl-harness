const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');

test('repository language links remain local without accepting another repository or unsafe paths',async()=>{
  const {repositoryFileLink}=await import('../src/repository-links.mjs');
  const base='https://github.com/owner/repo/blob/main/README.md';
  assert.equal(repositoryFileLink('./README.zh-CN.md',base),'README.zh-CN.md');
  assert.equal(repositoryFileLink('./docs/中文.md',base),'docs/中文.md');
  assert.equal(repositoryFileLink('https://raw.githubusercontent.com/owner/repo/main/README_CN.md',base),'README_CN.md');
  assert.equal(repositoryFileLink('./SKILL.zh.md','https://github.com/owner/repo/blob/main/skills/writer/SKILL.md'),'skills/writer/SKILL.zh.md');
  for(const link of ['https://github.com/other/repo/blob/main/README.md','javascript:alert(1)','https://example.com/README.md','https://github.com/owner/repo/issues/1'])assert.equal(repositoryFileLink(link,base),null);
});

test('DeepSeek runtime checks do not discover or select a different configuration agent',async()=>{
  const app=await fs.readFile(path.join(__dirname,'../src/AgentDialogs.jsx'),'utf8');
  const setup=app.slice(app.indexOf('function SetupDialog('),app.indexOf('function ConnectDialog('));
  const start=setup.indexOf('  useEffect(() => {'),end=setup.indexOf('  const labels',start);
  const calls=[];
  vm.runInNewContext(setup.slice(start,end),{useEffect:fn=>fn(),task:fn=>calls.push(fn()),check:async()=>calls.push('readiness'),values:{host:'deepseek-harness'},api:async()=>{throw new Error('DeepSeek 不应扫描其他 Agent');},setAssistant:()=>{throw new Error('DeepSeek 不应选择其他 Agent');}});
  await Promise.all(calls.filter(value=>value instanceof Promise||value?.then));
  assert.deepEqual(calls.filter(value=>typeof value==='string'),['readiness']);
  assert.doesNotMatch(setup,/用谁来配置|换一个助手/);
});

test('same-repository reader uses the inspected snapshot and rejects traversal or unregistered roots',async()=>{
  const {readRepositoryDocument}=require('../repository-import.cjs');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'asl-document-'));
  await fs.writeFile(path.join(root,'README.zh.md'),'# 中文文档');
  const registered=new Map([[root,{repo:{url:'https://github.com/a/b',commit:'a'.repeat(40)}}]]);
  const result=await readRepositoryDocument(root,'README.zh.md',registered);
  assert.equal(result.text,'# 中文文档');assert.match(result.url,/blob\/a{40}\/README.zh.md$/);
  for(const file of ['../README.md','C:/file.md','folder\\README.md','.env','./README.md'])await assert.rejects(readRepositoryDocument(root,file,registered),/无效/);
  await assert.rejects(readRepositoryDocument(root,'README.zh.md',new Map()),/重新打开/);
});

test('early README reader can navigate translations before archive inspection completes',async()=>{
  const {readOverview}=require('../repository-import.cjs');
  const result=await readOverview('https://github.com/a/b',async url=>{
    assert.equal(url,'https://api.github.com/repos/a/b/contents/README.zh.md?ref=main');
    return{ok:true,text:async()=>JSON.stringify({path:'README.zh.md',html_url:'https://github.com/a/b/blob/main/README.zh.md',content:Buffer.from('中文').toString('base64'),encoding:'base64'})};
  },undefined,{file:'README.zh.md',ref:'main'});
  assert.equal(result.text,'中文');
});

test('preloading and clicks share a request, refresh keeps the last good snapshot on failure',async()=>{
  const app=await fs.readFile(path.join(__dirname,'../src/App.jsx'),'utf8');
  const start=app.indexOf('  function repositoryReport('),end=app.indexOf('\n  const [githubReport',start);
  let resolve,calls=0,fail=false;
  const cloudCache={current:new Map()},cloudJobs={current:new Map()};
  const read=vm.runInNewContext('('+app.slice(start,end).trim()+')',{cloudCache,cloudJobs,setSourceVersion(){},api:()=>{calls++;return fail?Promise.reject(new Error('offline')):new Promise(r=>resolve=r);}});
  const a=read('repo'),b=read('repo');assert.equal(a,b);assert.equal(calls,1);
  resolve({commit:'one'});await a;assert.equal((await read('repo')).commit,'one');assert.equal(calls,1);
  fail=true;await assert.rejects(read('repo',true),/offline/);assert.equal(cloudCache.current.get('repo').commit,'one');assert.equal(cloudJobs.current.size,0);
});

test('adding an existing library skill saves graph and membership together without copying it again',async()=>{
  const app=await fs.readFile(path.join(__dirname,'../src/App.jsx'),'utf8');
  const start=app.indexOf('  async function saveDiagram('),end=app.indexOf('\n  const openLibrary',start),calls=[];
  const save=vm.runInNewContext('('+app.slice(start,end).trim()+')',{workspace:'library',catalog:{skills:[{id:'known'}]},api:async(...args)=>{calls.push(args);return{};},catalogCache:{current:{delete(){}}},currentRoot:{current:'other'},load(){},setContentSaving(){}});
  await save({id:'mode',fingerprint:'original',roots:['first']},'# 图',{skill:{id:'known'},placement:'research'});
  assert.equal(calls.length,1);const request=calls[0][2].request;
  assert.equal(request.operation,'mode.save');assert.equal(request.placement,'research');assert.deepEqual([...request.skills],['first','known']);assert.equal(request.document,'# 图');
});
