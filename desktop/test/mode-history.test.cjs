const {test}=require('node:test'),assert=require('node:assert/strict');
const {commandArgs}=require('../bridge.cjs');
test('a restore in progress protects navigation even without an unsaved text draft',()=>{
  const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../src/EditorPage.jsx'),'utf8');
  assert.match(source,/if\(dirty\|\|busy\)\{document\.addEventListener\('click'/);
});
test('Mode history has bounded read, preview and explicit restore commands',()=>{
  assert.deepEqual(commandArgs('history',{workspace:'C:/library',mode:'research',limit:40,offset:0}),['environment.history','--workspace','C:/library','--mode','research','--limit','40','--offset','0']);
  const values={workspace:'C:/library',mode:'research',revision:'a'.repeat(40),expected:'b'.repeat(64)};
  assert.ok(commandArgs('restoreHistory',values).includes('--check'));
  assert.ok(!commandArgs('restoreHistory',{...values,apply:true}).includes('--check'));
  assert.throws(()=>commandArgs('history',{workspace:'C:/library',revision:'HEAD~1'}));
  assert.throws(()=>commandArgs('history',{workspace:'C:/library',limit:1000}));
});
test('history playback derives only factual membership changes from selected snapshots',async()=>{
  const {modeChanges}=await import('../src/mode-evolution.mjs');
  assert.deepEqual(modeChanges({skills:['a','b'],document:'old'},{skills:['b','c'],document:'new'}),{added:['c'],removed:['a'],structure:true});
  assert.deepEqual(modeChanges(null,{skills:['b'],document:''}),{added:[],removed:[],structure:false});
});
