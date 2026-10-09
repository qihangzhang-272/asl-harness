const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=()=>fs.readFileSync(path.join(__dirname,'../src/ModeHistory.jsx'),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));

function mount(props={},helpers={}){
  const hooks=[];let cursor=0;
  const slot=initial=>{const index=cursor++;if(!(index in hooks))hooks[index]=initial;return index;};
  const context={useState(initial){const index=slot(initial);return [hooks[index],value=>{hooks[index]=typeof value==='function'?value(hooks[index]):value;}];},useRef(value){return hooks[slot({current:value})];},useMemo:fn=>fn(),useEffect:()=>{},useLeaveGuard:()=>action=>action(),modeChanges:()=>({added:[],removed:[],structure:false}),modeDiagramDocument:()=>'',diagramsIn:()=>[],renderDiagram:async source=>source,...helpers};
  const body=source().split('export default function ModeHistory(')[1].split('  return <EditorPage')[0];
  const component=vm.runInNewContext(`(function(${body}return {load,render,graphsFor,records,version,status};})`,context);
  return next=>{cursor=0;return component({workspace:'C:/library',mode:{id:'research',title:'研究',roots:['current'],skills:['current'],document:'current',fingerprint:'now'},skills:[],api:async()=>({entries:[],nextOffset:null,status:'ok'}),...props,...next});};
}

test('history fallback diagrams use historical membership instead of current roots',()=>{
  let supplied;
  const render=mount({}, {modeDiagramDocument:mode=>{supplied=mode;return '';}});
  render().graphsFor({skills:['past'],document:'old'});
  assert.deepEqual([...supplied.roots],['past']);
});

test('scrubbing does not queue discarded Mermaid renders',async()=>{
  const pending=new Map(),started=[];
  const component=mount({}, {renderDiagram:source=>{started.push(source);return new Promise(resolve=>pending.set(source,resolve));}});
  const view=component();
  view.version.current=1;const first=view.render('a',1);
  view.version.current=2;const discarded=view.render('b',2);
  view.version.current=3;const latest=view.render('c',3);
  assert.deepEqual(started,['a']);
  pending.get('a')('svg-a');await first;await settle();
  assert.deepEqual(started,['a','c']);assert.equal(await discarded,null);
  pending.get('c')('svg-c');assert.equal((await latest).source,'c');
});

test('an older record-list response cannot replace the latest refresh',async()=>{
  const pending=[];
  const render=mount({api:()=>new Promise(resolve=>pending.push(resolve))});
  const first=render().load(),second=render().load();
  pending[1]({entries:[{revision:'new'}],status:'ok',nextOffset:null});await second;
  pending[0]({entries:[{revision:'old'}],status:'ok',nextOffset:null});await first;
  assert.equal(render().records[0].revision,'new');
});

test('continuing from a version enters the existing editor without applying restore',()=>{
  const text=source();
  assert.match(text,/onClick=\{\(\)=>onContinue\(\{\.\.\.mode,\.\.\.detail\.snapshot,roots:detail\.snapshot\.skills\}\)\}/);
  assert.doesNotMatch(text,/onContinue\([^\n]*restoreHistory/);
  assert.match(text,/<MermaidView[^>]* evolve compact/);
  assert.equal((text.match(/<MermaidView/g)||[]).length,1);
  assert.match(text,/disabled=\{!ready\|\|busy\|\|readOnly\|\|!!missing.length\}/);
  assert.match(text,/<strong>\{caption\}<\/strong>/);
  assert.doesNotMatch(text,/aria-valuetext=\{[^\n]*selected.title/);
});

test('repeated pagination reads are coalesced while a page is pending',async()=>{
  let finish,calls=0;
  const render=mount({api:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
  const first=render().load(true),second=render().load(true);
  assert.equal(calls,1);finish({entries:[{revision:'old'}],nextOffset:null,status:'ok'});
  await Promise.all([first,second]);assert.equal(render().records.length,1);
});
