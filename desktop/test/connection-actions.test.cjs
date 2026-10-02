const {test}=require('node:test');
const assert=require('node:assert/strict');
test('update keeps the exact Agent, library and destination for every scope',async()=>{
  const {updateConnection}=await import('../src/connection-actions.mjs');
  for(const scope of ['preset','user','project']) {
    const calls=[],item={workspace:'original-library',mode:'creator-studio',host:scope==='preset'?'deepseek-harness':'claude-code',scope,project:'existing-folder',basePreset:'existing-tools',skillsDir:'custom-skills'};
    await updateConnection(item,async(...args)=>{calls.push(args);return {fingerprint:'abc',conflicts:[]};});
    const [,action,values]=calls.at(-1);
    assert.equal(values.workspace,item.workspace);
    assert.equal(values.mode,item.mode);
    if(scope==='preset'){assert.equal(action,'preset');assert.equal(values.output,item.project);assert.equal(values.basePreset,item.basePreset);}
    else{assert.equal(values.host,'claude-code');assert.equal(scope==='user'?values.skillsDir:values.project,scope==='user'?item.skillsDir:item.project);}
  }
});
test('unmanaged user changes cannot be overwritten by update',async()=>{
  const {updateConnection}=await import('../src/connection-actions.mjs');let calls=0;
  await assert.rejects(updateConnection({scope:'user'},async()=>{calls++;return {conflicts:['changed']};}),/修改/);
  assert.equal(calls,1);
});
