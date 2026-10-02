const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');

test('local discovery reuses its last report across pages and restarts, refreshing explicitly',async t=>{
  const {localDiscovery}=require('../local-discovery.cjs');
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'asl-discovery-'));
  t.after(()=>fs.rm(folder,{recursive:true,force:true}));
  const root=path.join(folder,'skills'),source=path.join(root,'example');await fs.mkdir(source,{recursive:true});
  let scans=0;
  const file=path.join(folder,'index.json'),roots=[{name:'Skills',path:root}];
  const scan=async()=>{scans++;return {skills:[{id:'example',source,description:'a'}],issues:[]};};
  const first=localDiscovery({file,scan});
  await first.read(roots);await first.read(roots);
  assert.equal(scans,1);
  const restarted=localDiscovery({file,scan});
  const report=await restarted.read(roots);
  assert.equal(scans,1);assert.ok(report.checkedAt);assert.equal(report.skills.length,1);
  await restarted.read(roots,{refresh:true});assert.equal(scans,2);
  await fs.writeFile(file,'broken');
  await localDiscovery({file,scan}).read(roots);assert.equal(scans,3);
  const saved=JSON.parse(await fs.readFile(file,'utf8'));
  saved.report.skills.push(null);saved.report.issues.push(null);
  await fs.writeFile(file,JSON.stringify(saved));
  assert.equal((await localDiscovery({file,scan}).read(roots)).skills.length,1);
  assert.equal(scans,4,'malformed cache records cause a fresh scan, not a render failure');
});

test('cache cannot authorize an outside directory and cancelled refresh keeps the last good report',async t=>{
  const {localDiscovery}=require('../local-discovery.cjs');
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'asl-discovery-boundary-'));
  t.after(()=>fs.rm(folder,{recursive:true,force:true}));
  const root=path.join(folder,'skills'),source=path.join(root,'example'),outside=path.join(folder,'private');
  await fs.mkdir(source,{recursive:true});await fs.mkdir(outside);
  const file=path.join(folder,'index.json'),roots=[{path:root}];
  let scans=0;
  const scan=async()=>{scans++;return {skills:[{id:'example',source}],issues:[]};};
  await localDiscovery({file,scan}).read(roots);
  const saved=JSON.parse(await fs.readFile(file,'utf8'));saved.report.skills.push({id:'outside',source:outside});
  await fs.writeFile(file,JSON.stringify(saved));
  const cache=localDiscovery({file,scan});
  assert.deepEqual((await cache.read(roots)).skills.map(s=>s.id),['example']);
  const controller=new AbortController();controller.abort();
  await assert.rejects(cache.read(roots,{refresh:true,signal:controller.signal}));
  assert.equal((await cache.read(roots)).skills.length,1);assert.equal(scans,1);
});
