const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const os=require('node:os'),path=require('node:path');

test('abandoned render output exits without an unhandled Electron error window', {timeout:20000,skip:process.platform!=='win32'}, async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'asl-render-disconnect-'));
  const file=path.join(directory,'diagrams.json');
  await fs.writeFile(file,JSON.stringify([{file:'MODE.md',text:'```mermaid\nflowchart LR\n A --> B\n```'}]));
  const desktop=path.resolve(__dirname,'..');
  const executable=process.env.ASL_TEST_EXECUTABLE||path.join(desktop,'node_modules/electron/dist',process.platform==='win32'?'electron.exe':'electron');
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
  const child=spawn(executable,[...(process.env.ASL_TEST_EXECUTABLE?[]:[desktop]),'--validate-mermaid',file],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const exit=new Promise((resolve,reject)=>{child.once('exit',code=>resolve(code));child.once('error',reject);});
  child.stderr.resume();child.stdout.destroy();
  let timer;
  try{
    const result=await Promise.race([exit,new Promise(resolve=>{timer=setTimeout(()=>resolve('stuck'),12000);})]);
    assert.notEqual(result,'stuck','caller disconnected: render process must exit instead of leaving an Error dialog');
    assert.notEqual(result,0,'closed output is not a delivered successful result');
  }finally{clearTimeout(timer);if(child.exitCode===null)child.kill();}
});
