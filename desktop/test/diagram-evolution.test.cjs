const {test}=require('node:test'),assert=require('node:assert/strict');
test('re-rendering the same source suspends old SVG interaction until the new drawing is installed',()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const source=fs.readFileSync(require.resolve('../src/MermaidView.jsx'),'utf8');
  const body=source.match(/onClick=\{\(\)=>\{(camera\.current=null;.*?)\}\}/)[1];
  let renderedSource='flowchart LR; a-->b';
  const fit=vm.runInNewContext(`(function(){${body}})`,{camera:{current:'old'},setRenderedSource:value=>renderedSource=value,setFrame(){assert.equal(renderedSource,'','发起同源重绘时即暂停旧图交互，不等副作用开始');},setScale(){}});
  fit();
});
test('evolution matches authored identities across renders, never matching nodes by their labels',async()=>{
  const {evolutionKey}=await import('../src/diagram-evolution.mjs');
  const element=(id,data={})=>({id,dataset:data,matches:()=>false});
  assert.equal(evolutionKey(element('flowchart-skill_research-71')),'node:skill_research');
  assert.equal(evolutionKey(element('flowchart-skill_research-2')),'node:skill_research');
  assert.equal(evolutionKey(element('node_12',{aslNode:'research'})),'node:research');
  assert.equal(evolutionKey(element('unknown')),null);
});
