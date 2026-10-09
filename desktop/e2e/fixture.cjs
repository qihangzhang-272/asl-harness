const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {_electron}=require('playwright');
const desktop=path.resolve(__dirname,'..');
const children=new WeakMap();

async function dispose(app){
  // Only the process created by this fixture; never a real user's window.
  const child=children.get(app),timer=child?.exitCode===null&&child.signalCode===null?setTimeout(()=>child.kill(),5000):null;
  try{
    if(app.windows().some(window=>!window.isClosed()))await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(window=>window.destroy()));
    await app.close();
  }finally{clearTimeout(timer);}
}

function packagedCore(executable=process.env.ASL_TEST_EXE){
  if(!executable)return undefined;
  const directory=path.dirname(executable);
  return path.basename(directory)==='MacOS'
    ?path.join(directory,'../Resources/core/asl-harness')
    :path.join(directory,'resources/core/asl-harness.exe');
}

async function launch({output=process.env.ASL_E2E_OUTPUT,baseline,core,library,empty=false,resume}={}){
  const run=resume||await fs.mkdtemp(path.join(output||os.tmpdir(),'asl-e2e-'));
  const home=path.join(run,'home'),workspace=library?path.resolve(library):path.join(run,'library');
  await fs.mkdir(path.join(home,'app'),{recursive:true});
  if(!resume) {
    if(!empty&&!library)await fs.cp(path.join(desktop,'../examples/personal-environment'),workspace,{recursive:true});
    await fs.writeFile(path.join(home,'app/libraries.json'),JSON.stringify({libraries:empty?[]:[workspace],lastLibrary:empty?null:workspace,views:{},repositories:[]}));
  }
  const env={...process.env,HOME:home,USERPROFILE:home,APPDATA:path.join(home,'Roaming'),LOCALAPPDATA:path.join(home,'Local'),CODEX_HOME:path.join(home,'.codex'),CLAUDE_CONFIG_DIR:path.join(home,'.claude')};
  delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({...(process.env.ASL_TEST_EXE&&{executablePath:process.env.ASL_TEST_EXE}),args:[...(process.env.ASL_TEST_EXE?[]:[desktop]),'--user-data-dir='+path.join(home,'app')],env});
  children.set(app,app.process());
  const page=await app.firstWindow();page.setDefaultTimeout(20000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>dialog.accept());
  // Reload after selecting the measured assets/core; production IPC and Electron
  // stay unchanged. The profile is isolated from real host configuration.
  try{await page.locator(resume?'.source-library,.mode-library-overview,.welcome,.skill-library':empty?'.welcome':'.mode-library-overview').first().waitFor({timeout:60000});}
  catch(error){await page.screenshot({path:path.join(run,'launch-failure.png')});console.error(run,errors,await page.locator('body').innerText());await dispose(app);throw error;}
  const frontend=baseline||process.env.ASL_TEST_FRONTEND;
  if(frontend)await app.evaluate(async({app,session,net},{original,replacement})=>{
    if(app.isPackaged){const path=process.getBuiltinModule('node:path');original=process.getBuiltinModule('node:url').pathToFileURL(path.join(process.resourcesPath,'app','dist')+path.sep).href;}
    await session.defaultSession.protocol.handle('file',request=>{
      const selected=request.url.startsWith(original)?replacement+request.url.slice(original.length):request.url;
      return net.fetch(selected,{bypassCustomProtocolHandlers:true});
    });
  },{original:pathToFileURL(path.join(desktop,'dist')+path.sep).href,replacement:pathToFileURL(path.resolve(frontend)+path.sep).href});
  if(core)await app.evaluate((_,source)=>{
    // Test-only process boundary: production has no alternate-core configuration.
    const {ChildProcess}=process.getBuiltinModule('node:child_process'),spawn=ChildProcess.prototype.spawn;
    ChildProcess.prototype.spawn=function(options){
      if(options.args.includes('asl_harness.commands'))options.envPairs=options.envPairs.map(value=>value.startsWith('PYTHONPATH=')?'PYTHONPATH='+source:value);
      return spawn.call(this,options);
    };
  },path.resolve(core,'src'));
  if(process.env.ASL_TEST_FRONTEND){await page.reload();await page.locator(empty?'.welcome':'.mode-library-overview').waitFor();}
  return {app,page,run,workspace,errors};
}
module.exports={launch,packagedCore,dispose};
