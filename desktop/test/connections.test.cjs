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
  assert.ok(!JSON.stringify(results).includes('running'));
});

test('missing source remains visible as an issue, and ordinary presets are not managed',async()=>{
  const result=await connections({hosts:[{id:'codex-app',scopes:['user'],directory:os.tmpdir(),userMode:{mode:'writing',workspace:os.tmpdir()}}],projects:[],presets:[]},async()=>{throw new Error('源已移走');});
  assert.equal(result[0].status,'attention');
  assert.equal(result[0].issues[0],'源已移走');
});
