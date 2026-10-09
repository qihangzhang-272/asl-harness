const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=name=>fs.readFileSync(path.join(__dirname,'../src',name),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('organizing retries the failed operation with the original goal',async()=>{
  const body=source('EnvironmentGuide.jsx').split('export default function EnvironmentGuide(')[1].split('  return <EditorPage')[0];
  const states=[];let cursor=0,launches=0,checks=0,loads=0;
  const context={useState(initial){const index=cursor++;if(!(index in states))states[index]=initial;return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];},useRef:value=>({current:value}),useEffect:()=>{},useLeaveGuard:()=>{}};
  const component=vm.runInNewContext(`(function(${body}return {start,launch,verify,retry};})`,context);
  const api=async(action,...args)=>{
    if(action==='run'&&args[0]==='guide'){loads++;return {cli:'asl-harness'};}
    if(action==='assistants')return [{id:'codex-app',name:'Codex',available:true}];
    if(action==='organize'){launches++;assert.equal(args[1].goal,'整理研究模式');if(launches===1)throw Error('NATIVE_START_FAILED');return {id:'session',status:'opened'};}
    if(action==='run'&&args[0]==='describe'){checks++;if(checks===1)throw Error('READ_FAILED');return {};}
    if(action==='setupStatus')return {status:'ended'};
  };
  const props={workspace:'C:/temporary/library',api,read:(_key,_label,fn)=>fn(api),onVerified:async()=>{},onClose:()=>{}};
  const render=()=>{cursor=0;return component(props);};
  render().start();await settle();states[2]='整理研究模式';
  await render().launch({id:'codex-app',name:'Codex'});
  await render().retry();
  assert.equal(launches,2);assert.equal(loads,1,'启动重试不能变成重新扫描');
  render().verify();await settle();render().retry();await settle();
  assert.equal(checks,2);assert.equal(launches,2,'检查结果重试不能再次启动 Agent');
});

test('setup keeps technical details folded and copy handoff acknowledges its destination',()=>{
  const setup=source('AgentDialogs.jsx').split('export function ConnectDialog')[0];
  assert.match(setup,/<details[^>]*>\s*<summary>配置位置<\/summary>/);
  assert.match(setup,/<details[^>]*>\s*<summary>检查项/);
  assert.match(setup,/await api\('copyText',report\.brief\);\s*setCopied\(true\)/);
  assert.match(setup,/已复制。在 \{hostName\} 新会话中粘贴并发送/);
  assert.match(setup,/检查未完成，请重试/);
  assert.match(setup,/<summary>查看详情<\/summary><pre>\{checkError\}<\/pre>/);
});

test('failed checks clear an old handoff and preserve the complete diagnostic',async()=>{
  const body=source('AgentDialogs.jsx').split('export function SetupDialog(')[1].split('  const labels =')[0];
  const states=[];
  const setup=vm.runInNewContext(`(function(${body}return check;})`,{useState(value){const index=states.length;states.push(value);return [value,next=>{states[index]=next;}];},useRef:()=>({current:true}),useEffect:()=>{}});
  const failure=Object.assign(Error('短提示'),{diagnostic:'原始完整原因',code:'READ_FAILED',details:{file:'MODE.md',line:5}});
  const check=setup({values:{host:'workbuddy'},api:async()=>{throw failure;}});
  states[0]={brief:'旧报告'};await check();
  assert.equal(states[0],null,'失败后不能复制旧报告冒充最新结果');
  assert.deepEqual(JSON.parse(states[4]),{message:failure.diagnostic,code:failure.code,details:failure.details});
});
