const {test}=require('node:test');
const assert=require('node:assert/strict');

test('an active leave guard also protects against external content refresh and releases on cleanup',()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const source=fs.readFileSync(require.resolve('../src/EditorPage.jsx'),'utf8').split('// Same form contract')[0]
    .replace(/^import[^\n]+\n/gm,'').replace('export function','function');
  const document=new EventTarget(),window=new EventTarget();let effect;
  const context=vm.createContext({useEffect:fn=>{effect=fn;},document,window,Event});
  vm.runInContext(source,context);context.useLeaveGuard(true,false);const cleanup=effect();
  const refresh=new Event('asl:before-content-refresh',{cancelable:true});document.dispatchEvent(refresh);
  assert.equal(refresh.defaultPrevented,true,'目录刷新不能卸载未保存的编辑器');
  cleanup();const next=new Event('asl:before-content-refresh',{cancelable:true});document.dispatchEvent(next);
  assert.equal(next.defaultPrevented,false);
});

test('navigation does not isolate a visible canvas behind a view-transition snapshot',()=>{
  const fs=require('node:fs'),vm=require('node:vm');let snapshots=0,updates=0;
  const source=fs.readFileSync(require.resolve('../src/motion.js'),'utf8').replace(/^import[^\n]+\n/gm,'').replace('export function','function');
  const context=vm.createContext({flushSync:fn=>fn(),matchMedia:()=>({matches:false}),document:{startViewTransition:fn=>{snapshots++;fn();return {finished:Promise.resolve()};}}});
  vm.runInContext(source,context);context.navigate(()=>updates++);
  assert.equal(updates,1);assert.equal(snapshots,0,'动画不能截断刚返回时的第一下拖动');
});

test('legacy safe Skill IDs remain visible and have distinct generated Mermaid identities',async()=>{
  const {rootIds,memberIds}=await import('../src/graph-model.mjs'),{skillNodes}=await import('../src/mode-diagrams.mjs');
  const skills=[{id:'a-b',title:'连字符',requires:[]},{id:'a_b',title:'旧下划线',requires:[]}];
  assert.deepEqual(rootIds({roots:['a-b','a_b']}),['a-b','a_b']);
  assert.deepEqual(memberIds(['a-b','a_b'],skills),['a-b','a_b']);
  assert.equal(new Set(skillNodes(skills).map(node=>node.alias)).size,2);
});

test('leaving a reader records the latest position even before the queued scroll event',()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  let effect;
  const values=new Map(),listeners=new Map();
  const element={scrollTop:0,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  const source=fs.readFileSync(require.resolve('../src/useViewState.jsx'),'utf8').replace(/^import[^\n]+\n/,'').replaceAll('export function','function');
  const context=vm.createContext({useLayoutEffect:fn=>{effect=fn;},getComputedStyle:()=>({overflowY:'auto'}),localStorage:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)}});
  vm.runInContext(source,context);context.useScrollMemory('reading',{current:element});
  const detach=effect();element.scrollTop=1100;detach();
  assert.equal(values.get('asl.view.scroll.reading'),'1100');assert.equal(listeners.size,0);
});

test('structure drags cancel on blur and ignore other pointers, then allow another drag',async()=>{
  const {attachStructureDrag}=await import('../src/mermaid-structure-dom.mjs');
  const listeners=new Map(),moves=[];
  const element=key=>({dataset:{aslEdit:key},classList:{values:new Set(),add(v){this.values.add(v);},remove(v){this.values.delete(v);}},getBoundingClientRect:()=>({x:0,y:0,width:100,height:80})});
  const a=element('a'),b=element('b');b.closest=()=>b;
  const svg={contains:()=>true,addEventListener(){},removeEventListener(){}};
  const previous={window:global.window,document:global.document};
  global.window={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  global.document={elementFromPoint:()=>b};
  const event=(pointerId=1)=>({pointerId,button:0,clientX:20,clientY:30,target:{closest:()=>null},preventDefault(){}});
  try{
    const detach=attachStructureDrag(svg,[{element:a,item:{key:'a',kind:'node'}},{element:b,item:{key:'b',kind:'node'}}],{type:'mindmap',structural:true},value=>moves.push(value));
    const start=()=>a.onpointerdown({...event(),clientX:0,clientY:0});
    start();listeners.get('pointermove')(event());
    assert.equal(a.classList.values.has('is-dragging'),true);
    assert.equal(typeof listeners.get('blur'),'function');listeners.get('blur')();
    assert.equal(a.classList.values.size,0);assert.equal(b.classList.values.size,0);assert.equal(moves.length,0);
    start();listeners.get('pointermove')(event(2));assert.equal(a.classList.values.size,0);
    listeners.get('pointermove')(event());listeners.get('pointerup')(event(2));assert.equal(moves.length,0);
    listeners.get('pointerup')(event());assert.equal(moves.length,1);
    for(const name of ['pointercancel','keydown']){
      start();listeners.get('pointermove')(event());listeners.get(name)({...event(),key:'Escape'});assert.equal(moves.length,1);
    }
    detach();assert.equal(listeners.size,0);
  }finally{Object.assign(global,previous);}
});

test('repository navigation preserves a Chinese section and a literal hash in the file name',async()=>{
  const {repositoryFileLink}=await import('../src/repository-links.mjs');
  const base='https://github.com/owner/repo/blob/main/README.md';
  assert.equal(repositoryFileLink('./README.zh-CN.md#安装',base),'README.zh-CN.md#%E5%AE%89%E8%A3%85');
  assert.equal(repositoryFileLink('./docs/a%23b.md#安装',base),'docs/a%23b.md#%E5%AE%89%E8%A3%85');
});

test('file read reuse is bounded, coalesces reads, and invalidation rejects late cache population',async()=>{
  const {ReadCache}=await import('../src/read-cache.mjs');
  let now=0,calls=0,finish;
  const cache=new ReadCache({limit:2,ttl:10,now:()=>now});
  const read=()=>cache.read('a',async()=>++calls);
  assert.equal(await read(),1);assert.equal(await read(),1);
  now=11;assert.equal(await read(),2);
  const late=cache.read('late',()=>new Promise(resolve=>{finish=resolve;}));
  const shared=cache.read('late',()=>assert.fail('duplicate read'));
  await Promise.resolve();
  cache.clear();finish('old');assert.equal(await late,'old');assert.equal(await shared,'old');
  assert.equal(await cache.read('late',async()=> 'new'),'new');
  await assert.rejects(cache.read('failure',async()=>{throw Error('offline');}),/offline/);
  assert.equal(await cache.read('failure',async()=> 'retry'),'retry');
  await cache.read('b',async()=>3);assert.equal(await cache.read('late',async()=> 'evicted'),'evicted');
});
