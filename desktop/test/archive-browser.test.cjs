const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=()=>fs.readFileSync(path.join(__dirname,'../src/ArchiveBrowser.jsx'),'utf8');

function mount(api,props={}){
  const hooks=[];let cursor=0;
  const slot=initial=>{const index=cursor++;if(!(index in hooks))hooks[index]=initial;return index;};
  const context={useState(initial){const index=slot(initial);return [hooks[index],value=>{hooks[index]=typeof value==='function'?value(hooks[index]):value;}];},useRef(value){return hooks[slot({current:value})];},useEffect:()=>{},useLeaveGuard:()=>action=>action()};
  const body=source().split('export default function ArchiveBrowser(')[1].split('  return <EditorPage')[0];
  const component=vm.runInNewContext(`(function(${body}return {load,change,data,error,notice,external};})`,context);
  return ()=>{cursor=0;return component({workspace:'C:/test/library',api,onClose:()=>{},...props});};
}
const record=(entry,known=true)=>({entry,title:entry,kind:known?'mode':'unknown',target:known?'modes/example':null,restorable:known,cleanupAllowed:known,fingerprint:'version-1',files:[{path:'MODE.md'}],file:'MODE.md',document:'# 模式'});

test('archive restore uses the selected fingerprint; unknown and read-only records cannot mutate',async()=>{
  for(const options of [{known:true},{known:false},{known:true,readOnly:true}]){
    const item=record('example',options.known),writes=[];let saved=0;
    const render=mount(async(method,action,values)=>{
      if(action==='archives')return values.entry?item:{entries:[item],issues:[]};
      writes.push({method,action,values});return {changed:true};
    },{readOnly:options.readOnly,onSaved:()=>saved++});
    await render().load('',null,true);await render().change('restore');
    assert.equal(writes.length,options.known&&!options.readOnly?1:0);
    if(writes.length){assert.equal(writes[0].action,'edit');assert.equal(writes[0].values.request.operation,'archive.restore');assert.equal(writes[0].values.request.expected,'version-1');assert.equal(saved,1);}
  }
});

test('canceling archive trash preserves selection and does not report success',async()=>{
  const item=record('example');let saved=0,calls=0;
  const render=mount(async(method,action,values)=>{
    if(method==='trashArchive'){calls++;assert.equal(action.expected,'version-1');return {canceled:true};}
    return values.entry?item:{entries:[item],issues:[]};
  },{onSaved:()=>saved++});
  await render().load('',null,true);await render().change('trash');
  assert.equal(calls,1);assert.equal(saved,0);assert.equal(render().data.entry,'example');assert.equal(render().notice,'');
});

test('archive conflict preserves content and a stale entry cannot be retried without rereading',async()=>{
  const item=record('example');let writes=0;
  const render=mount(async(_method,action,values)=>{
    if(action==='archives')return values.entry?item:{entries:[item],issues:[]};
    writes++;throw Object.assign(Error('归档已改变'),{code:'EDIT_STALE'});
  });
  await render().load('',null,true);await render().change('restore');
  assert.equal(render().external,true);assert.equal(render().data.entry,'example');
  await render().change('restore');assert.equal(writes,1);
});

test('archive reader ignores a late file response after switching entries',async()=>{
  const a=record('a'),b=record('b');let finish;
  const render=mount(async(_method,_action,values)=>{
    if(!values.entry)return {entries:[a,b],issues:[]};
    if(values.file==='slow.md')return new Promise(resolve=>{finish=()=>resolve({...a,file:'slow.md',document:'旧内容'});});
    return values.entry==='a'?a:b;
  });
  await render().load('',null,true);
  const old=render().load('a','slow.md');await render().load('b');finish();await old;
  assert.equal(render().data.entry,'b');
});

test('a completed restore is not misreported as failed when the parent refresh fails',async()=>{
  const item=record('example');
  const render=mount(async(_method,action,values)=>action==='archives'?(values.entry?item:{entries:[item],issues:[]}):{changed:true},{onSaved:async()=>{throw Error('REFRESH_FAILED');}});
  await render().load('',null,true);await render().change('restore');
  assert.equal(render().notice,'已恢复到工作库');
  assert.equal(render().error.message,'操作已完成，页面未能更新，请重新读取。');
});
