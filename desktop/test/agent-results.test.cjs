const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=name=>fs.readFileSync(path.join(__dirname,'../src',name),'utf8');

test('configuration handoff preserves the core result and exposes honest Hook scope',()=>{
  const dialog=source('AgentDialogs.jsx');
  assert.match(dialog,/onApplied\(status,[^\n]+, result\)/);
  for(const text of ['配置位置','下一步','自动检查','尚未实测','默认模式不在项目 Hook 覆盖范围内','尚未接入自动检查'])assert.ok(dialog.includes(text),text);
  for(const field of ['report.hooks','commandFound','activation?.instructionFile','item.path','item.skills'])assert.ok(dialog.includes(field),field);
});

test('connection diagnostics remain available without enabling unsafe updates',()=>{
  const page=source('AgentPage.jsx');
  assert.match(page,/item\.diagnostic/);
  assert.match(page,/error\.diagnostic/);
  assert.match(page,/disabled=\{busy\|\|item\.status==='attention'\}/);
});

test('initial setup reads do not compete with the parent write gate and ignore late results',async()=>{
  const body=source('AgentDialogs.jsx').split('export function SetupDialog(')[1].split('  const labels =')[0];
  for(const unmount of [false,true]){
    const states=[];let effect,resolve;
    const report={checks:[],setupNotes:[]};
    const context={useState(value){const index=states.length;states.push(value);return [value,next=>{states[index]=next;}];},useRef:value=>({current:value}),useEffect:fn=>{effect=fn;}};
    const setup=vm.runInNewContext(`(function(${body}return null;})`,context);
    setup({values:{host:'workbuddy'},task:()=>assert.fail('initial reading must not use the parent write gate'),
      api:()=>new Promise(done=>{resolve=done;})});
    const cleanup=effect();
    if(unmount)cleanup();
    resolve(report);await new Promise(done=>setImmediate(done));
    assert.equal(states[0],unmount?null:report);
  }
});
