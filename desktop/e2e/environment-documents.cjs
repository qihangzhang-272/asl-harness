const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {launch}=require('./fixture.cjs');
async function close(app){
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(window=>window.destroy()));
  await app.close();
}
test('Profile and feedback use existing files, protect drafts, reject external conflicts and archive explicitly',{timeout:180000},async()=>{
  const {app,page,workspace,run,errors}=await launch();
  try{
    const skill=path.join(workspace,'skills/source-research/SKILL.md'),original=await fs.readFile(skill);
    await page.getByRole('button',{name:'偏好与记录',exact:true}).click();
    await page.locator('.environment-documents .package-rendered').waitFor();
    await page.getByRole('button',{name:'编辑',exact:true}).click();
    const input=page.getByRole('textbox',{name:'记录内容'});
    await input.fill('# 工作偏好\n\n先给结论。');
    page.removeAllListeners('dialog');let prompts=0;page.on('dialog',dialog=>{prompts++;dialog.dismiss();});
    await page.getByRole('button',{name:'全部技能',exact:true}).first().click();
    assert.equal(prompts,1);assert.equal(await input.inputValue(),'# 工作偏好\n\n先给结论。');
    assert.doesNotMatch(await fs.readFile(path.join(workspace,'PROFILE.md'),'utf8'),/先给结论/);
    await app.evaluate(({ipcMain})=>{const original=ipcMain._invokeHandlers.get('asl:run');ipcMain.removeHandler('asl:run');ipcMain.handle('asl:run',async(event,action,...args)=>{if(action==='edit')await new Promise(resolve=>setTimeout(resolve,300));return original(event,action,...args);});});
    await page.getByRole('button',{name:'保存',exact:true}).click();
    assert.equal(await input.evaluate(element=>element.readOnly),true,'保存期间不会让稍后输入被旧回执覆盖');
    await page.waitForFunction(()=>document.querySelector('.package-rendered')?.textContent.includes('先给结论'));
    assert.match(await fs.readFile(path.join(workspace,'PROFILE.md'),'utf8'),/先给结论/);
    await page.getByRole('button',{name:'新建记录',exact:true}).click();
    await input.fill('# 本次反馈\n\n本次结果再短一点，不修改技能。');
    await page.getByRole('button',{name:'保存',exact:true}).click();
    await page.getByRole('button',{name:'本次反馈',exact:true}).waitFor();
    const name=(await fs.readdir(path.join(workspace,'feedback'))).find(name=>name.endsWith('.md'));
    assert.ok(name);const file=path.join(workspace,'feedback',name);
    await page.getByRole('button',{name:'编辑',exact:true}).click();await input.fill('# 我的未保存修改');
    await fs.writeFile(file,'# 外部新版本\n');
    await page.getByText('文件有新版本，未保存修改已保留。',{exact:false}).waitFor();
    await page.getByRole('button',{name:'保存',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'内容已更新'}).waitFor();
    assert.equal(await input.inputValue(),'# 我的未保存修改');assert.equal(await fs.readFile(file,'utf8'),'# 外部新版本\n');
    page.removeAllListeners('dialog');page.on('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'重新读取',exact:true}).click();
    await page.locator('.package-rendered').filter({hasText:'外部新版本'}).waitFor();
    await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});
    await page.getByRole('button',{name:'归档记录',exact:true}).click();
    await page.locator('.package-rendered').filter({hasText:'先给结论'}).waitFor();
    assert.equal(await fs.stat(file).catch(()=>null),null);assert.deepEqual(await fs.readFile(skill),original);
    await page.screenshot({path:path.join(run,'preferences-and-records.png')});
    assert.deepEqual(errors,[]);console.log('偏好与记录：'+run);
  }finally{await close(app);}
});

test('an unrelated malformed package is isolated while valid Modes remain readable',{timeout:120000},async()=>{
  const output=await fs.mkdtemp(path.join(os.tmpdir(),'asl-catalog-isolation-')),library=path.join(output,'library');
  await fs.cp(path.join(__dirname,'../../examples/personal-environment'),library,{recursive:true});
  await fs.mkdir(path.join(library,'skills/broken'));await fs.writeFile(path.join(library,'skills/broken/SKILL.md'),'not a complete skill');
  const {app,page,errors,run}=await launch({library,output});
  try{
    await page.getByText('1 处内容需要检查',{exact:true}).click();
    await page.getByText(/skills[\\/]broken/).waitFor();
    await page.locator('.source-tree button').filter({hasText:'Creator Studio'}).first().click();
    await page.locator('.mode-page').waitFor();
    await page.getByRole('button',{name:'全部技能',exact:true}).first().click();
    await page.locator('.skill-library').waitFor();assert.deepEqual(errors,[]);
    console.log('局部读取隔离：'+run);
  }finally{await close(app);}
});
