const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'../src/App.jsx'),'utf8');
const part=(start,end)=>app.slice(app.indexOf(start),app.indexOf(end,app.indexOf(start)));

test('ordinary diagram and text saves apply once; there is no discarded check before the write',async()=>{
  for(const [name,end] of [['saveDiagram','  const openLibrary'],['saveContent','  async function applyEdit']]){
    const calls=[];
    const context={workspace:'library',currentRoot:{current:'other'},catalogCache:{current:{delete(){}}},
      api:async(...args)=>{calls.push(args);return{};},load:async()=>{},setContentSaving(){},setModal(){},showMode(){},setMessage(){}};
    const save=vm.runInNewContext(`(${part(`  async function ${name}`,end).split('\n  async function saveFile')[0].trim()})`,context);
    if(name==='saveDiagram')await save({id:'m',fingerprint:'fp',roots:['a']},'# m');
    else await save({operation:'skill.file.save',id:'a',expected:'fp',file:'SKILL.md',document:'# a'});
    assert.equal(calls.length,1,`${name} should run the authoritative write gate once`);
    assert.equal(calls[0][2].apply,true);
    assert.equal(calls[0][2].request.expected,'fp');
  }
});

test('frontend presents a short error but preserves complete CLI diagnostics',async()=>{
  const diagnostic={code:'MERMAID_RENDER_FAILED',message:'MODE.md · line 8: syntax error\n'.repeat(12),
    details:[{file:'MODE.md',line:8,action:'修正 Mermaid 原文，重新提交'}]};
  const {errorText}=await import('../src/presentation.mjs');
  const api=vm.runInNewContext(`(${part('async function api','function IconButton').trim()})`,{
    window:{asl:{run:async()=>({ok:false,error:diagnostic.message,code:diagnostic.code,details:diagnostic.details})}},errorText});
  await assert.rejects(()=>api('run','edit',{}),error=>{
    assert.equal(error.code,diagnostic.code);
    assert.deepEqual(error.details,diagnostic.details);
    assert.equal(error.diagnostic,diagnostic.message);
    assert.ok(error.message.length<70,'product errors should not dump parser traces');
    return true;
  });
});

test('diagram preview keeps parser diagnostics behind an explicit details action',()=>{
  const view=fs.readFileSync(path.join(__dirname,'../src/MermaidView.jsx'),'utf8');
  assert.match(view,/<details><summary>详细错误<\/summary><pre>\{error\}<\/pre><\/details>/);
  assert.doesNotMatch(view,/<strong>这张图需要修正<\/strong><pre>/);
});
