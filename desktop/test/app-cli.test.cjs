const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'../src/App.jsx'),'utf8');
const part=(start,end)=>app.slice(app.indexOf(start),app.indexOf(end,app.indexOf(start)));

test('ordinary diagram and text saves apply once; there is no discarded check before the write',async()=>{
  const {createHistory}=await import('../src/graph-model.mjs');
  for(const [name,end] of [['saveDiagram','  const openLibrary'],['saveContent','  async function applyEdit']]){
    const calls=[];
    const context={createHistory,historyFor:()=>null,catalog:{skills:[]},workspace:'library',currentRoot:{current:'other'},catalogCache:{current:{delete(){}}},loadRequest:{current:5},setLoadingRoot(){},
      api:async(...args)=>{calls.push(args);return{};},load:async()=>{},setContentSaving(){},setModal(){},showMode(){},setMessage(){}};
    const save=vm.runInNewContext(`(${part(`  async function ${name}`,end).split('\n  async function saveFile')[0].trim()})`,context);
    if(name==='saveDiagram')await save({id:'m',fingerprint:'fp',roots:['a']},'# m');
    else await save({operation:'skill.file.save',id:'a',expected:'fp',file:'SKILL.md',document:'# a'});
    assert.equal(calls.length,1,`${name} should run the authoritative write gate once`);
    assert.equal(calls[0][2].apply,true);
    assert.equal(calls[0][2].request.expected,'fp');
    if(name==='saveDiagram')assert.equal(context.loadRequest.current,6,'画板保存作废此前仍在途的目录结果');
  }
});

test('frontend presents a short error but preserves complete CLI diagnostics',async()=>{
  const diagnostic={code:'MERMAID_RENDER_FAILED',message:'MODE.md · line 8: syntax error\n'.repeat(12),
    details:[{file:'MODE.md',line:8,action:'修正 Mermaid 原文，重新提交'}]};
  const {coreError}=await import('../src/presentation.mjs');
  const api=vm.runInNewContext(`(${part('async function api','function IconButton').trim()})`,{
    window:{asl:{run:async()=>({ok:false,error:diagnostic.message,code:diagnostic.code,details:diagnostic.details})}},coreError});
  await assert.rejects(()=>api('run','edit',{}),error=>{
    assert.equal(error.code,diagnostic.code);
    assert.deepEqual(error.details,diagnostic.details);
    assert.equal(error.diagnostic,diagnostic.message);
    assert.ok(error.message.length<70,'product errors should not dump parser traces');
    return true;
  });
});

test('background reads preserve the same short error and Agent diagnostics as direct reads',async()=>{
  const diagnostic={ok:false,code:'MERMAID_RENDER_FAILED',error:'C:/private/MODE.md\nSyntax error'.repeat(20),details:[{line:8}]};
  const presentation=await import('../src/presentation.mjs'),errors=[];
  const source=fs.readFileSync(path.join(__dirname,'../src/useReadTasks.jsx'),'utf8').split('export function ReadStatus')[0]
    .replace(/^import[^\n]+\n/gm,'').replace('export function','function');
  const context=vm.createContext({...presentation,crypto,window:{asl:{read:async()=>diagnostic,cancelRead:async()=>{}}},
    useRef:value=>({current:value}),useState:()=>[[],()=>{}],useEffect(){}});
  vm.runInContext(source,context);const tasks=context.useReadTasks(error=>errors.push(error));
  await tasks.read('example','读取',call=>call('run','catalog',{}));
  assert.equal(errors[0].code,diagnostic.code);assert.equal(errors[0].diagnostic,diagnostic.error);
  assert.deepEqual(errors[0].details,diagnostic.details);assert.ok(errors[0].message.length<70);
});

test('a completed Skill import is disclosed when the following Mode save fails',async()=>{
  const model=await import('../src/graph-model.mjs'),presentation=await import('../src/presentation.mjs');
  const messages=[],calls=[];
  const context={...model,...presentation,workspace:'/library',historyFor:()=>null,catalog:{skills:[]},
    loadRequest:{current:0},setLoadingRoot(){},setContentSaving(){},setExternalChange(){},setMessage:value=>messages.push(value),
    api:async(_method,_action,values)=>{calls.push(values);if(values.request.operation==='mode.save')throw Error('模式写入失败');return {sourceFingerprint:'source-one'};}};
  const save=vm.runInNewContext(`(${part('  async function saveDiagram','  const openLibrary').trim()})`,context);
  await assert.rejects(save({id:'m',title:'模式',roots:[],document:'# m'},'# m',{skill:{id:'a',source:'/complete-skill'}}),/模式写入失败/);
  assert.equal(calls.filter(call=>call.apply&&call.request.operation==='skill.import').length,1);
  assert.match(messages.at(-1).text,/技能已保存到库/);assert.match(messages.at(-1).text,/尚未加入/);
  assert.equal(typeof messages.at(-1).action,'function');
});

test('canvas saving is visible without exposing parser text or extra persistent controls',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../src/MermaidEdit.jsx'),'utf8');
  assert.match(source,/busy&&<[^>]+role="status"[^>]*>[^<]*正在保存/);
});

test('diagram preview keeps parser diagnostics behind an explicit details action',()=>{
  const view=fs.readFileSync(path.join(__dirname,'../src/MermaidView.jsx'),'utf8');
  assert.match(view,/<details><summary>详细错误<\/summary><pre>\{error\}<\/pre><\/details>/);
  assert.doesNotMatch(view,/<strong>这张图需要修正<\/strong><pre>/);
});

test('direct canvas history restores document and membership only after a successful fingerprinted save',async()=>{
  const model=await import('../src/graph-model.mjs'),entries=new Map(),calls=[],messages=[];
  let mode={id:'m',path:'/library/modes/m',title:'测试模式',fingerprint:'0',document:'# 原文',roots:['a'],architecture:{shared:['a']}};
  let fail=false;
  const context={...model,workspace:'/library',catalog:{skills:[{id:'a'},{id:'b'}]},
    canvasHistories:{current:entries},catalogCache:{current:new Map()},currentRoot:{current:'/library'},loadRequest:{current:0},setLoadingRoot(){},
    historyFor:item=>entries.get(item.path)?.fingerprint===item.fingerprint?entries.get(item.path).history:null,
    api:async(_method,_action,values)=>{
      calls.push(values.request);if(fail)throw Error('写入失败');
      assert.equal(values.request.expected,mode.fingerprint);
      mode={...mode,document:values.request.document,roots:values.request.skills,architecture:values.request.architecture||mode.architecture,fingerprint:String(+mode.fingerprint+1)};
      return {catalog:{modes:[mode]}};
    },setCatalog(){},setExternalChange(){},setContentSaving(){},setMessage:message=>messages.push(message)};
  const save=vm.runInNewContext(`(${part('  async function saveDiagram','  const openLibrary').trim()})`,context);
  await save(mode,'# 新图',{skill:{id:'b'}});
  assert.deepEqual(Array.from(mode.roots),['a','b']);assert.equal(entries.get(mode.path).history.past.length,1);
  await save(mode,'',{history:'undo'});assert.equal(mode.document,'# 原文');assert.deepEqual(Array.from(mode.roots),['a']);
  await save(mode,'',{history:'redo'});assert.equal(mode.document,'# 新图');assert.deepEqual(Array.from(mode.roots),['a','b']);
  const history=entries.get(mode.path);fail=true;
  await assert.rejects(save(mode,'# 未保存'),/写入失败/);assert.equal(entries.get(mode.path),history);assert.equal(messages.at(-1).error,true);
  const before=calls.length;mode={...mode,fingerprint:'external',document:'# 外部修改'};
  await save(mode,'',{history:'undo'});assert.equal(calls.length,before,'外部版本不能套用旧撤销');
});
