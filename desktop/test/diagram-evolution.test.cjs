const {test}=require('node:test'),assert=require('node:assert/strict');
test('re-rendering the same source suspends old SVG interaction until the new drawing is installed',()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const source=fs.readFileSync(require.resolve('../src/MermaidView.jsx'),'utf8');
  const body=source.match(/onClick=\{\(\)=>\{(camera\.current=null;.*?)\}\}/)[1];
  let renderedSource='flowchart LR; a-->b';
  let scroll;
  const fit=vm.runInNewContext(`(function(){${body}})`,{camera:{current:'old'},box:{current:{scrollTo:value=>scroll=value}},setRenderedSource:value=>renderedSource=value,setFrame(){assert.equal(renderedSource,'','发起同源重绘时即暂停旧图交互，不等副作用开始');},setScale(){}});
  fit();
  assert.equal(scroll.left,0);assert.equal(scroll.top,0,'全图复位也恢复滚动位置');
});
test('evolution matches authored identities across renders, never matching nodes by their labels',async()=>{
  const {evolutionKey}=await import('../src/diagram-evolution.mjs');
  const element=(id,data={})=>({id,dataset:data,matches:()=>false});
  assert.equal(evolutionKey(element('flowchart-skill_research-71')),'node:skill_research');
  assert.equal(evolutionKey(element('flowchart-skill_research-2')),'node:skill_research');
  assert.equal(evolutionKey(element('node_12',{aslNode:'research'})),'node:research');
  assert.equal(evolutionKey(element('unknown')),null);
});
test('a queued viewport resize after leaving the diagram cannot access a cleared ref',()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const source=fs.readFileSync(require.resolve('../src/MermaidView.jsx'),'utf8');
  const body=source.match(/new ResizeObserver\(entries=>\{([\s\S]*?)\}\);/)[1];
  const callback=vm.runInNewContext(`(entries)=>{${body}}`,{viewport:{isConnected:false},box:{current:null},getComputedStyle(){assert.fail('离页后的观察器不能读取样式');},setAvailableWidth(){assert.fail('离页后不能改视角');},setAvailableHeight(){assert.fail('离页后不能改视角');}});
  assert.doesNotThrow(()=>callback([{contentRect:{width:800,height:500}}]));
});
