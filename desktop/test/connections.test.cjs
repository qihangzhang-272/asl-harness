const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {connections}=require('../connections.cjs');

test('installed mode inventory verifies files rather than treating a receipt as readiness',async t=>{
  const home=await fs.mkdtemp(path.join(os.tmpdir(),'asl-connections-'));
  t.after(()=>fs.rm(home,{recursive:true,force:true}));
  const library=path.join(home,'library'),project=path.join(home,'project'),preset=path.join(home,'.dsh/.agent-presets/writing');
  const write=async(file,value)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(value));};
  await write(path.join(project,'.asl/host-projections/claude-code/current.json'),{hostId:'claude-code',mode:'writing',environment:library});
  await write(path.join(preset,'.asl-preset-projection.json'),{hostId:'deepseek-harness',mode:'writing',environment:library,basePreset:path.join(home,'base')});
  const inventory={hosts:[{id:'claude-code',scopes:['project','user'],directory:home,userMode:{mode:'writing',workspace:library}}],projects:[project],presets:[{path:preset}]};
  const called=[];
  const results=await connections(inventory,async(action,values)=>{
    called.push([action,values]);
    if(action==='catalog')return {modes:[{id:'writing',title:'Writing',skills:['one']}]};
    if(action==='userSync')return {needsSync:true,conflicts:[]};
    if(action==='verifyPreset')throw new Error('配置被修改');
    return {warnings:[]};
  });
  assert.deepEqual(results.map(r=>r.status),['outdated','configured','attention']);
  assert.equal(called.filter(([a])=>a==='catalog').length,1);
  assert.equal(results[2].issues[0],'配置被修改');
  assert.equal(results[2].title,'Writing');
  assert.ok(!JSON.stringify(results).includes('running'));
});

test('legacy DeepSeek installation offers repair at its existing location',async t=>{
  const home=await fs.mkdtemp(path.join(os.tmpdir(),'asl-legacy-'));
  t.after(()=>fs.rm(home,{recursive:true,force:true}));
  const preset=path.join(home,'asl-writing'),workspace=path.join(home,'library');
  await fs.mkdir(preset);
  await fs.writeFile(path.join(preset,'.asl-preset-projection.json'),JSON.stringify({hostId:'deepseek-harness',environment:workspace,mode:'writing',basePreset:path.join(home,'standard')}));
  const result=await connections({hosts:[],projects:[],presets:[{path:preset}]},async action=>{
    if(action==='catalog')return {modes:[{id:'writing',title:'写作',skills:['one']}]};
    throw Object.assign(new Error('需要升级'),{code:'DEEPSEEK_PRESET_UPGRADE_REQUIRED'});
  });
  assert.equal(result[0].status,'outdated');
  assert.equal(result[0].repair,'upgrade');
  assert.equal(result[0].location,preset);
  assert.deepEqual(result[0].skills,['one']);
});

test('missing source remains visible as an issue, and ordinary presets are not managed',async()=>{
  const result=await connections({hosts:[{id:'codex-app',scopes:['user'],directory:os.tmpdir(),userMode:{mode:'writing',workspace:os.tmpdir()}}],projects:[],presets:[]},async()=>{throw new Error('源已移走');});
  assert.equal(result[0].status,'attention');
  assert.equal(result[0].issues[0],'源已移走');
});

test('drift warnings survive inventory alongside conflicts and full core diagnostics',async()=>{
  const inventory={hosts:[{id:'codex-app',scopes:['user'],directory:os.tmpdir(),userMode:{mode:'writing',workspace:os.tmpdir()}}],projects:[],presets:[]};
  const catalog={modes:[{id:'writing',title:'Writing',skills:[]}]};
  const warning='Environment content changed after projection; run host.project again.';
  const [drift]=await connections(inventory,async action=>action==='catalog'?catalog:{warnings:[warning]});
  assert.equal(drift.status,'outdated');assert.deepEqual(drift.issues,[warning]);
  const [conflict]=await connections(inventory,async action=>action==='catalog'?catalog:{warnings:[warning],conflicts:['本地已修改']});
  assert.equal(conflict.status,'attention');assert.deepEqual(conflict.issues,['本地已修改',warning]);
  const details={file:'AGENTS.md',action:'保留修改后重新核对'};
  const [failure]=await connections(inventory,async action=>{if(action==='catalog')return catalog;throw Object.assign(new Error('投影无法读取'),{code:'HOST_PROJECTION_INVALID',details});});
  assert.equal(failure.status,'attention');assert.deepEqual(failure.diagnostic,{code:'HOST_PROJECTION_INVALID',message:'投影无法读取',details});
});
