const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {_electron}=require('playwright');
const desktop=path.resolve(__dirname,'..');

async function launch({output=process.env.ASL_E2E_OUTPUT,baseline,empty=false,resume}={}){
  const run=resume||await fs.mkdtemp(path.join(output||os.tmpdir(),'asl-e2e-'));
  const home=path.join(run,'home'),workspace=path.join(run,'library');
  await fs.mkdir(path.join(home,'app'),{recursive:true});
  if(!resume) {
    if(!empty)await fs.cp(path.join(desktop,'../examples/personal-environment'),workspace,{recursive:true});
    await fs.writeFile(path.join(home,'app/libraries.json'),JSON.stringify({libraries:empty?[]:[workspace],lastLibrary:empty?null:workspace,views:{},repositories:[]}));
  }
  const env={...process.env,HOME:home,USERPROFILE:home,APPDATA:path.join(home,'Roaming'),LOCALAPPDATA:path.join(home,'Local'),CODEX_HOME:path.join(home,'.codex'),CLAUDE_CONFIG_DIR:path.join(home,'.claude')};
  delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({...(process.env.ASL_TEST_EXE&&{executablePath:process.env.ASL_TEST_EXE}),args:[...(process.env.ASL_TEST_EXE?[]:[desktop]),'--user-data-dir='+path.join(home,'app')],env});
  const page=await app.firstWindow();page.setDefaultTimeout(20000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>dialog.accept());
  // Both measurements use a fresh-profile reload. Only renderer assets differ;
  // Python, IPC, fixture and Electron are identical. No real host configuration.
  try{await page.locator(resume?'.source-library,.mode-library-overview,.welcome,.skill-library':empty?'.welcome':'.mode-library-overview').first().waitFor({timeout:60000});}
  catch(error){await page.screenshot({path:path.join(run,'launch-failure.png')});console.error(run,errors,await page.locator('body').innerText());await app.close();throw error;}
  if(baseline)await app.evaluate(async({session,net},{original,replacement})=>{
    await session.defaultSession.protocol.handle('file',request=>{
      const selected=request.url.startsWith(original)?replacement+request.url.slice(original.length):request.url;
      return net.fetch(selected,{bypassCustomProtocolHandlers:true});
    });
  },{original:pathToFileURL(path.join(desktop,'dist')+path.sep).href,replacement:pathToFileURL(path.resolve(baseline)+path.sep).href});
  return {app,page,run,workspace,errors};
}
module.exports={launch};
