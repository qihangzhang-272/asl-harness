const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { readRepository } = require('../repository-import.cjs');

test('README can be read before archive download and returns clear missing/rate-limit states',async()=>{
  const {readOverview}=require('../repository-import.cjs');
  let requests=0;
  const result=await readOverview('https://github.com/qa/overview',async url=>{requests++;assert.match(url,/\/readme$/);return{ok:true,text:async()=>JSON.stringify({path:'README.md',html_url:'https://github.com/qa/overview/blob/main/README.md',content:Buffer.from('# 先看内容').toString('base64'),encoding:'base64'})};});
  assert.equal(result.text,'# 先看内容');assert.equal(requests,1);
  assert.equal(await readOverview('https://github.com/qa/overview',async()=>({ok:false,status:404})),null);
  await assert.rejects(readOverview('https://github.com/qa/overview',async()=>({ok:false,status:403})),/请求频率/);
});

for(const aliased of [false,true])test(`repository preview includes its actual README with a commit-pinned base (${aliased?'aliased':'direct'} temp)`, async t => {
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'asl-readme-'));
  t.after(()=>fs.rm(temp,{recursive:true,force:true}));
  if(aliased){await fs.mkdir(path.join(temp,'real'));await fs.symlink(path.join(temp,'real'),path.join(temp,'alias'),'junction');}
  const context={temp:aliased?path.join(temp,'alias'):temp,selected:new Set(),repositories:new Map(),remember:async()=>{},
    fetch:async url=>url.includes('codeload')?{ok:true,body:(async function*(){yield Buffer.from('fixture');})()}
      :{ok:true,text:async()=>JSON.stringify(url.includes('/commits/')?{sha:'e'.repeat(40)}:{default_branch:'main'})},
    core:async(_,{output})=>{await fs.mkdir(output);await fs.writeFile(path.join(output,'README.md'),'# 实际仓库\n\n[用法](docs/use.md)');return{skills:[],repositoryFiles:['README.md'],repositoryDependencies:[]};}};
  const result=await readRepository(`https://github.com/qa/readme-preview-${aliased}`,context);
  assert.equal(result.readme.text,'# 实际仓库\n\n[用法](docs/use.md)');
  assert.equal(result.readme.file,'README.md');
  assert.match(result.readme.url,/blob\/e{40}\/README.md$/);
});

test('reading or preloading a repository reuses its snapshot without reconnecting a removed source', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'asl-repo-cache-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  let downloads = 0, remembered = 0, parses = 0;
  const context = { temp, selected: new Set(), repositories: new Map(), remember: async () => remembered++,
    fetch: async url => {
      if (url.includes('codeload')) {
        downloads++;
        return { ok: true, body: (async function* () { yield Buffer.from('fixture'); })() };
      }
      return { ok: true, text: async () => JSON.stringify(url.includes('/commits/') ? { sha: 'c'.repeat(40) } : { default_branch: 'main' }) };
    },
    core: async (_action, { output }) => {
      parses++; await fs.mkdir(output);
      return { skills: [], repositoryFiles: [], repositoryDependencies: [] };
    },
  };
  const one = await readRepository('https://github.com/qa/cache-fixture', context);
  const two = await readRepository('https://github.com/qa/cache-fixture', context);
  const branch = await readRepository('https://github.com/qa/cache-fixture/tree/main', context);
  assert.equal(one.snapshot, two.snapshot);
  assert.equal(one.snapshot,branch.snapshot);
  assert.deepEqual([...context.repositories.get(one.snapshot).urls],['https://github.com/qa/cache-fixture','https://github.com/qa/cache-fixture/tree/main']);
  assert.equal(downloads, 1); assert.equal(parses, 1); assert.equal(remembered, 0);
  assert.ok(one.checkedAt,'cloud inspection exposes when it last checked upstream');
  assert.ok(two.checkedAt);
  assert.equal(context.repositories.get(one.snapshot).report,one,'native Agent handoff only uses the inspected report kept by the main process');
});

test('cloud refresh is separate from Mode adoption and never writes a local environment',()=>{
  const source=require('node:fs').readFileSync(path.join(__dirname,'../src/App.jsx'),'utf8');
  const effect=source.match(/\/\/ Cloud refresh only[\s\S]*?\}, \[cloud\?\.url, modal, busy\]\);/)?.[0];
  assert.ok(effect);
  assert.match(effect,/repositoryReport\(url,true\)/);
  assert.doesNotMatch(effect,/importRepositoryMode|run.*import|load\(workspace/);
  assert.match(effect,/setCloud/);
});

test('ASL repository inspection preserves skill bytes instead of injecting a root license into every skill', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'asl-repo-exact-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const context = { temp, selected: new Set(), repositories: new Map(), remember: async () => {},
    fetch: async url => url.includes('codeload')
      ? { ok: true, body: (async function* () { yield Buffer.from('fixture'); })() }
      : { ok: true, text: async () => JSON.stringify(url.includes('/commits/') ? {sha: 'd'.repeat(40)} : {default_branch: 'main'}) },
    core: async (action, {output}) => {
      if (action === 'catalog') return {modes: [{id:'writing',skills:['example'],architecture:{paradigms:[]}}],skills:[{id:'example',title:'Example'}]};
      await fs.mkdir(path.join(output, 'skills/example'), {recursive: true});
      await fs.mkdir(path.join(output, 'modes'));
      await fs.writeFile(path.join(output, 'WORKSPACE.md'), '# ASL');
      await fs.writeFile(path.join(output, 'LICENSE'), 'root notice');
      await fs.writeFile(path.join(output, 'skills/example/SKILL.md'), 'original');
      return {skills: [{source: path.join(output, 'skills/example'), inspection: {files:['SKILL.md'], reasons:[]}}],
        repositoryFiles:['LICENSE'], repositoryDependencies:[]};
    },
  };
  const report = await readRepository('https://github.com/qa/preserve-asl', context);
  assert.equal(report.catalog.skills[0].title,'Example');
  assert.equal(report.modes[0].id,'writing');
  assert.equal(report.skills[0].repositoryPath,'skills/example');
  assert.equal(context.selected.has(report.snapshot),false); // Remote preview is not a writable local library.
  assert.equal(await fs.readFile(path.join(report.snapshot, 'skills/example/SKILL.md'), 'utf8'), 'original');
  assert.equal(await fs.stat(path.join(report.snapshot, 'skills/example/LICENSE')).then(()=>true).catch(()=>false), false);
});

async function cachedRepository(t) {
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'asl-repository-offline-'));
  t.after(()=>fs.rm(temp,{recursive:true,force:true}));
  let commit='a'.repeat(40), offline=false, downloads=0, requests=0;
  const context={temp,cacheRoot:path.join(temp,'cache'),selected:new Set(),repositories:new Map(),
    fetch:async url=>{
      requests++;
      if(offline)throw new Error('network unavailable');
      if(url.includes('codeload')){downloads++;return{ok:true,body:(async function*(){yield Buffer.from(commit);})()};}
      return{ok:true,text:async()=>JSON.stringify(url.includes('/commits/')?{sha:commit}:{default_branch:'main'})};
    },
    core:async(action,{source,output})=>{
      assert.equal(action,'unpack');
      const text=await fs.readFile(source,'utf8');
      await fs.mkdir(path.join(output,'docs'),{recursive:true});
      await fs.writeFile(path.join(output,'README.md'),'# '+text);
      await fs.writeFile(path.join(output,'docs/use.md'),'使用 '+text);
      return{skills:[],repositoryFiles:['README.md','docs/use.md'],repositoryDependencies:[]};
    }};
  return{context,url:'https://github.com/qa/offline-'+path.basename(temp),
    change:(value='b')=>{commit=value.repeat(40);},offline:()=>{offline=true;},
    counts:()=>({downloads,requests}),restart:()=>({...context,selected:new Set(),repositories:new Map()})};
}

test('repository cache reopens across instances offline and registers document access without downloading',async t=>{
  const fixture=await cachedRepository(t),first=await readRepository(fixture.url,fixture.context);
  const before=fixture.counts();fixture.offline();
  const next=fixture.restart(),second=await readRepository(fixture.url,next);
  assert.equal(second.commit,first.commit);
  assert.equal(second.cacheStatus,'cached');
  assert.equal(second.checkedAt,first.checkedAt);
  assert.deepEqual(fixture.counts(),before);
  assert.equal(next.repositories.get(second.snapshot).report,second);
  const {readRepositoryDocument}=require('../repository-import.cjs');
  assert.match((await readRepositoryDocument(second.snapshot,'docs/use.md',next.repositories)).text,/a{40}/);
  await assert.rejects(readRepositoryDocument(second.snapshot,'../outside.md',next.repositories),/路径无效/);
});

test('explicit refresh updates the snapshot and failed refresh leaves the previous content readable',async t=>{
  const fixture=await cachedRepository(t),first=await readRepository(fixture.url,fixture.context);
  fixture.change();
  const cached=await readRepository(fixture.url,fixture.context);
  assert.equal(cached.commit,first.commit);
  assert.equal(cached.cacheStatus,'cached');
  const fresh=await readRepository(fixture.url,{...fixture.context,refresh:true});
  assert.equal(fresh.commit,'b'.repeat(40));assert.equal(fresh.cacheStatus,'fresh');
  assert.equal(fixture.counts().downloads,2);
  fixture.offline();
  const stale=await readRepository(fixture.url,{...fixture.restart(),refresh:true});
  assert.equal(stale.commit,fresh.commit);assert.equal(stale.cacheStatus,'stale');
  assert.match(stale.refreshError,/network unavailable/);
  assert.equal(stale.checkedAt,fresh.checkedAt);
  assert.match(stale.readme.text,/b{40}/);
});

test('refreshing A to B to A keeps the last successful version for reads and offline reopen',async t=>{
  const fixture=await cachedRepository(t),first=await readRepository(fixture.url,fixture.context);
  await readRepository(fixture.url+'/tree/main',fixture.context);
  fixture.change();await readRepository(fixture.url,{...fixture.context,refresh:true});
  fixture.change('a');
  const refreshed=await readRepository(fixture.url,{...fixture.context,refresh:true});
  assert.equal(refreshed.commit,first.commit);
  assert.equal((await readRepository(fixture.url,fixture.context)).commit,first.commit);
  assert.equal(fixture.counts().downloads,2,'reuse the already inspected A archive');
  fixture.offline();
  const reopened=await readRepository(fixture.url,fixture.restart());
  assert.equal(reopened.commit,first.commit);assert.equal(reopened.checkedAt,refreshed.checkedAt);
  assert.match(reopened.readme.text,/a{40}/);
});

test('refreshing an alias does not change another URL last successful snapshot',async t=>{
  const fixture=await cachedRepository(t),alias=fixture.url+'/tree/main';
  await readRepository(fixture.url,fixture.context);await readRepository(alias,fixture.context);
  fixture.change();
  const latest=await readRepository(fixture.url,{...fixture.context,refresh:true});
  fixture.change('a');await readRepository(alias,{...fixture.context,refresh:true});
  assert.equal((await readRepository(fixture.url,fixture.context)).commit,latest.commit);
});

test('first alias cache hit persists the inspected archive for offline reopen without downloading',async t=>{
  const fixture=await cachedRepository(t),first=await readRepository(fixture.url,fixture.context);
  const alias=fixture.url+'/tree/main';
  const aliased=await readRepository(alias,fixture.context);
  assert.equal(aliased.snapshot,first.snapshot);assert.equal(fixture.counts().downloads,1);
  const before=fixture.counts();fixture.offline();
  const reopened=await readRepository(alias,fixture.restart());
  assert.equal(reopened.commit,first.commit);assert.deepEqual(fixture.counts(),before);
});

for(const broken of ['missing','digest','metadata-path','linked'])test(`unsafe persistent cache is not read (${broken})`,async t=>{
  const fixture=await cachedRepository(t);
  await readRepository(fixture.url,fixture.context);
  const names=await fs.readdir(fixture.context.cacheRoot);
  const metadata=path.join(fixture.context.cacheRoot,names.find(name=>name.endsWith('.json')));
  const zip=path.join(fixture.context.cacheRoot,names.find(name=>name.endsWith('.zip')));
  if(broken==='missing')await fs.unlink(zip);
  if(broken==='digest')await fs.writeFile(zip,'changed');
  if(broken==='metadata-path'){
    const record=JSON.parse(await fs.readFile(metadata,'utf8'));
    record.repo.subpath='../outside';await fs.writeFile(metadata,JSON.stringify(record));
  }
  if(broken==='linked'){
    const outside=path.join(fixture.context.temp,'outside');
    await fs.mkdir(outside);await fs.unlink(zip);await fs.symlink(outside,zip,'junction');
  }
  fixture.offline();
  await assert.rejects(readRepository(fixture.url,fixture.restart()),/network unavailable/);
});

test('successful same-version refresh persists its check time without downloading again',async t=>{
  const fixture=await cachedRepository(t);
  const first=await readRepository(fixture.url,fixture.context);
  await new Promise(resolve=>setTimeout(resolve,10));
  const refreshed=await readRepository(fixture.url,{...fixture.context,refresh:true});
  assert.notEqual(refreshed.checkedAt,first.checkedAt);
  fixture.offline();
  const reopened=await readRepository(fixture.url,fixture.restart());
  assert.equal(reopened.checkedAt,refreshed.checkedAt);
  assert.equal(fixture.counts().downloads,1);
});

for(const full of ['count','bytes'])test(`full persistent cache does not evict files or prevent online reading (${full})`,async t=>{
  const fixture=await cachedRepository(t),root=fixture.context.cacheRoot;
  await fs.mkdir(root);
  if(full==='count')for(let index=0;index<50;index++)await fs.writeFile(path.join(root,index+'.zip'),'existing');
  else {const file=await fs.open(path.join(root,'existing.zip'),'w');await file.truncate(256*1024*1024);await file.close();}
  const before=await fs.readdir(root);
  const report=await readRepository(fixture.url,fixture.context);
  assert.equal(report.cacheStatus,'fresh');assert.match(report.readme.text,/a{40}/);
  assert.deepEqual(await fs.readdir(root),before);
});

test('archive network failure keeps the cached version and an aborted refresh does not return stale success',async t=>{
  const fixture=await cachedRepository(t),first=await readRepository(fixture.url,fixture.context);
  fixture.change();
  const fetch=async(url,options)=>url.includes('codeload')?{ok:false,status:503}:fixture.context.fetch(url,options);
  const result=await readRepository(fixture.url,{...fixture.restart(),fetch,refresh:true});
  assert.equal(result.commit,first.commit);assert.equal(result.cacheStatus,'stale');assert.match(result.refreshError,/503/);
  const controller=new AbortController();
  await assert.rejects(readRepository(fixture.url,{...fixture.context,refresh:true,fetch:async()=>{
    controller.abort(new Error('canceled'));throw new Error('network failure');
  }},controller.signal),/canceled/);
});

test('persisted archive is revalidated by the existing core before any adoption paths are registered',async t=>{
  const fixture=await cachedRepository(t);
  await readRepository(fixture.url,fixture.context);fixture.offline();
  const next=fixture.restart();next.core=async action=>{assert.equal(action,'unpack');throw new Error('archive validation rejected');};
  await assert.rejects(readRepository(fixture.url,next),/archive validation rejected/);
  assert.equal(next.selected.size,0);assert.equal(next.repositories.size,0);
});
