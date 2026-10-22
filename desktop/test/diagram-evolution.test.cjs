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
test('diagram evolution removes the actual renderer namespace before matching node identity',async()=>{
  const {evolutionKey}=await import('../src/diagram-evolution.mjs');
  const element=(prefix,index)=>({id:`${prefix}-flowchart-skill_research-${index}`,dataset:{},matches:()=>false,closest:()=>({id:prefix})});
  assert.equal(evolutionKey(element('aslMermaid3',71)),'node:skill_research');
  assert.equal(evolutionKey(element('aslMermaid9',2)),'node:skill_research');
});
test('a queued viewport resize after leaving the diagram cannot access a cleared ref',()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const source=fs.readFileSync(require.resolve('../src/MermaidView.jsx'),'utf8');
  const body=source.match(/new ResizeObserver\(entries=>\{([\s\S]*?)\}\);/)[1];
  const callback=vm.runInNewContext(`(entries)=>{${body}}`,{viewport:{isConnected:false},box:{current:null},getComputedStyle(){assert.fail('离页后的观察器不能读取样式');},setAvailableWidth(){assert.fail('离页后不能改视角');},setAvailableHeight(){assert.fail('离页后不能改视角');}});
  assert.doesNotThrow(()=>callback([{contentRect:{width:800,height:500}}]));
});
test('trace motion distinguishes a first view, an existing node and an actual change',async t=>{
  const {animateDiagram}=await import('../src/diagram-evolution.mjs');
  const savedWindow=global.window,savedStyle=global.getComputedStyle;
  t.after(()=>{global.window=savedWindow;global.getComputedStyle=savedStyle;});
  let reduced=false;
  global.window={matchMedia:()=>({matches:reduced})};global.getComputedStyle=()=>({transform:'matrix(1, 0, 0, 1, 100, 0)'});
  const node=(id,label)=>({id:`flowchart-${id}-1`,dataset:{},textContent:label,matches:()=>false,
    classList:{values:[],add(value){this.values.push(value);}},frames:[],
    getBoundingClientRect:()=>({x:100,y:20}),parentElement:{getScreenCTM:()=>({a:1,b:0,c:0,d:1})},
    animate(frames){this.frames.push(frames);}});
  const same=node('same','资料'),renamed=node('renamed','核对'),added=node('added','判断'),nodes=[same,renamed,added];
  const root={querySelector:()=>({animate(){}}),querySelectorAll:selector=>selector==='g.node,.actor'?nodes:[]};
  animateDiagram(root,new Map());
  assert.deepEqual(added.classList.values,[],'第一帧没有比较依据，不应把全部节点标成新增');
  const before=new Map([['node:same',{rect:{x:20,y:20},label:'资料'}],['node:renamed',{rect:{x:30,y:20},label:'分析'}]]);
  animateDiagram(root,before);
  assert.deepEqual(same.classList.values,[]);
  assert.ok(renamed.classList.values.includes('evolution-updated'));
  assert.ok(added.classList.values.includes('evolution-added'));
  assert.match(same.frames.at(-1)[0].transform,/translate\(-80px,0px\)/);
  reduced=true;animateDiagram(root,before);
  assert.equal(same.frames.at(-1)[0].transform,same.frames.at(-1)[1].transform,'减少动态效果不做空间移动');
});
