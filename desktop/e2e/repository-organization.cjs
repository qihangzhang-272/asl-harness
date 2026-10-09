const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {launch,dispose}=require('./fixture.cjs');

for(const empty of [true,false])test(`repository Skills can be read and chosen one by one into ${empty?'a first':'an existing'} Mode`,{timeout:180000},async()=>{
  const {app,page,run,workspace,errors}=await launch({empty});
  const url='https://github.com/qa/reading-tools',snapshot=path.join(run,'repository');
  const original='---\nname: reading\ndescription: 阅读材料\n---\n# 阅读材料\n\n保留完整的研究方法。\n';
  try{
    for(const id of ['reading','unused']){
      await fs.mkdir(path.join(snapshot,id,'scripts'),{recursive:true});
      await fs.writeFile(path.join(snapshot,id,'SKILL.md'),original.replaceAll('reading',id));
      await fs.writeFile(path.join(snapshot,id,'scripts/read.py'),'print("read")\n');
    }
    await app.evaluate(async({app,ipcMain,dialog},{url,snapshot})=>{
      const path=process.getBuiltinModule('node:path');
      const require=process.getBuiltinModule('node:module').createRequire(path.join(app.getAppPath(),'package.json'));
      await require('./library.cjs').updatePreferences(path.join(app.getPath('userData'),'libraries.json'),state=>({...state,repositories:[url]}));
      ipcMain.removeHandler('asl:github-skills');
      ipcMain.handle('asl:github-skills',()=>({ok:true,value:{repository:url,snapshot,commit:'one',modes:[],skills:['reading','unused'].map(id=>({id,title:id==='reading'?'阅读材料':'未选技能',description:'整理阅读材料',requires:[],source:path.join(snapshot,id),origin:url+'/tree/main/'+id})),readme:{text:'# 阅读工具仓库',url:url+'/blob/main/README.md'}}}));
      ipcMain.removeHandler('asl:repository-overview');ipcMain.handle('asl:repository-overview',()=>({ok:true,value:null}));
      dialog.showMessageBox=async()=>({response:1});
      dialog.showOpenDialog=async()=>({canceled:false,filePaths:[snapshot]});
    },{url,snapshot});
    await page.evaluate(()=>window.asl.choose('skillSearchRoot'));
    const discovered=await page.evaluate(source=>window.asl.localSkills(source),snapshot);
    assert.equal(discovered.ok,true,JSON.stringify(discovered));
    await page.reload();
    await page.locator('.cloud-source>.source-heading').click();
    await page.getByRole('heading',{name:'阅读工具仓库',exact:true}).waitFor();
    await page.getByText('组织技能',{exact:true}).click();
    await page.locator('.repository-organize').getByRole('button',{name:empty?'新建模式':'Creator Studio',exact:true}).click();
    await page.getByRole('textbox',{name:'模式名称',exact:true}).waitFor();
    if(empty)await page.getByRole('textbox',{name:'模式名称',exact:true}).fill('我的阅读工作');
    await page.getByRole('heading',{name:'仓库技能 · 2',exact:true}).waitFor();
    await page.locator('.graph-pane-skills').getByRole('button',{name:'阅读材料',exact:true}).click();
    await page.locator('.package-rendered').filter({hasText:'保留完整的研究方法'}).waitFor();
    assert.equal(await page.locator('.skill-canvas-panel').getByRole('button',{name:'编辑',exact:true}).isDisabled(),true,'来源只读，先读不采用');
    await page.screenshot({path:path.join(run,'repository-skill-reading.png')});
    const target=empty?path.join(run,'home/app/workspace'):workspace;
    await assert.rejects(fs.stat(path.join(target,'skills/reading')),/ENOENT/);
    await page.getByRole('button',{name:'技能逻辑架构',exact:true}).click();
    await page.locator('.graph-skill').filter({has:page.getByRole('button',{name:'阅读材料',exact:true})}).dragTo(page.locator('.graph-pane[aria-label="技能节点画布"]'));
    await page.locator('g.node[data-canvas-node="skill_reading"]').waitFor({timeout:45000});
    await page.screenshot({path:path.join(run,'repository-canvas.png')});
    if(!empty){
      const modeFile=path.join(workspace,'modes/creator-studio/MODE.md'),before=await fs.readFile(modeFile,'utf8');
      await page.getByText('技能已采用到本地，保存后更新模式。',{exact:true}).waitFor();
      page.removeAllListeners('dialog');
      await page.evaluate(()=>{window.repositoryConfirms=[];window.confirm=message=>{window.repositoryConfirms.push(message);return true;};});
      await page.getByRole('button',{name:'取消',exact:true}).click();
      assert.equal(await fs.readFile(modeFile,'utf8'),before,'取消不保存 Mode，也不回滚已采用技能');
      assert.equal(await fs.readFile(path.join(target,'skills/reading/SKILL.md'),'utf8'),original);
      assert.equal((await page.evaluate(()=>window.repositoryConfirms)).length,1);
      await page.getByText('组织技能',{exact:true}).click();
      await page.locator('.repository-organize').getByRole('button',{name:'Creator Studio',exact:true}).click();
      await page.getByRole('button',{name:'加入 阅读材料',exact:true}).first().click();
      await page.locator('g.node[data-canvas-node="skill_reading"]').waitFor();
    }
    await page.getByRole('button',{name:'保存',exact:true}).click();
    await page.locator('.mode-page').waitFor({timeout:60000});
    assert.doesNotMatch(await page.locator('.mode-page .page-heading').innerText(),/mermaid|flowchart/,'图源码不充当模式简介');
    assert.equal(await page.locator('.source-library').count(),0,'保存后留在真实目标 Mode');
    assert.equal(await fs.readFile(path.join(target,'skills/reading/SKILL.md'),'utf8'),original);
    assert.equal(await fs.readFile(path.join(target,'skills/reading/scripts/read.py'),'utf8'),'print("read")\n');
    assert.equal(await fs.readFile(path.join(snapshot,'reading/SKILL.md'),'utf8'),original);
    await assert.rejects(fs.stat(path.join(target,'skills/unused')),/ENOENT/);
    assert.deepEqual(errors,[]);
    if(!empty){
      await fs.writeFile(path.join(snapshot,'reading/SKILL.md'),original+'\n云端新方法，尚未采用。\n');
      await page.locator('.cloud-source>.source-heading').click();
      await page.getByText('组织技能',{exact:true}).click();
      await page.locator('.repository-organize').getByRole('button',{name:'Creator Studio',exact:true}).click();
      const sourceRow=page.locator('.graph-skill-group').filter({has:page.getByRole('heading',{name:/仓库技能/})}).locator('.graph-skill').filter({hasText:'阅读材料'});
      await sourceRow.getByRole('button',{name:'阅读材料',exact:true}).click();
      await page.locator('.package-rendered').filter({hasText:'云端新方法'}).waitFor();
      await page.evaluate(()=>{window.repositoryConfirms=[];window.confirm=message=>{window.repositoryConfirms.push(message);return false;};});
      await sourceRow.getByRole('button',{name:'加入 阅读材料',exact:true}).click();
      assert.match((await page.evaluate(()=>window.repositoryConfirms))[0],/将使用本地版本/);
      assert.equal(await fs.readFile(path.join(target,'skills/reading/SKILL.md'),'utf8'),original);
      await page.evaluate(()=>{window.confirm=()=>true;});
      await page.getByRole('button',{name:'取消',exact:true}).click();
    }
    await page.screenshot({path:path.join(run,'repository-mode.png')});console.log('仓库逐项组织：'+run);
  }catch(error){console.error(run,errors,await page.locator('body').innerText());throw error;}
  finally{await dispose(app);}
});
