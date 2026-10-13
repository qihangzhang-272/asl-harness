const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {launch,dispose}=require('./fixture.cjs');

test('large diagrams open as an overview and restore readable size without changing authored content',{timeout:120000},async t=>{
  const library=await fs.mkdtemp(path.join(os.tmpdir(),'asl-reading-'));
  t.after(()=>fs.rm(library,{recursive:true,force:true}));
  await fs.cp(path.join(__dirname,'../../examples/personal-environment'),library,{recursive:true});
  const file=path.join(library,'modes/creator-studio/MODE.md');
  const nodes=Array.from({length:12},(_,i)=>`n${i}["需要完整阅读的材料与判断 ${i+1}"]`);
  await fs.appendFile(file,'\n## 阅读验收\n\n```mermaid\nflowchart LR\n'+nodes.join('\n')+'\n'+nodes.slice(1).map((_,i)=>`n${i} --> n${i+1}`).join('\n')+'\n```\n');
  const before=await fs.readFile(file);
  const {app,page,errors}=await launch({library});
  try{
    await page.locator('.source-tree button').filter({hasText:'Creator Studio'}).first().click();
    await page.getByRole('tab',{name:'阅读验收',exact:true}).click();
    const viewport=page.locator('.architecture-section .mermaid-viewport');
    await viewport.locator('svg').waitFor();
    await page.getByRole('button',{name:'按原始大小阅读',exact:true}).waitFor();
    await page.waitForFunction(()=>{const el=document.querySelector('.architecture-section .mermaid-viewport');return el&&el.scrollWidth<=el.clientWidth+2;});
    await page.getByRole('button',{name:'按原始大小阅读',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'按原始大小阅读',exact:true}).innerText(),'100%');
    await viewport.evaluate(el=>el.scrollLeft=el.scrollWidth);
    await page.getByRole('button',{name:'全图概览并复位',exact:true}).click();
    await page.waitForFunction(()=>{const el=document.querySelector('.architecture-section .mermaid-viewport');return el&&!el.inert&&el.scrollLeft===0&&el.scrollWidth<=el.clientWidth+2;});
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(920,740));
    await page.waitForFunction(()=>{const el=document.querySelector('.architecture-section .mermaid-viewport');return innerWidth===920&&el.scrollWidth<=el.clientWidth+2;});
    assert.deepEqual(await fs.readFile(file),before);
    assert.deepEqual(errors,[]);
  }finally{await dispose(app);}
});

test('conflict recovery changes scope or directory without overwriting an unmanaged Skill',{timeout:120000},async()=>{
  const {app,page,run,workspace,errors}=await launch();
  const existing=path.join(run,'home/.agents/skills/product-analysis/SKILL.md');
  await fs.mkdir(path.dirname(existing),{recursive:true});await fs.writeFile(existing,'UNMANAGED ORIGINAL');
  const custom=path.join(run,'custom-skills'),project=path.join(run,'separate-project');await fs.mkdir(custom);await fs.mkdir(project);
  try{
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(920,740));
    await app.evaluate(({dialog},{custom,project})=>{
      globalThis.recoveryFolders=[custom,project];
      dialog.showOpenDialog=async()=>({canceled:false,filePaths:[globalThis.recoveryFolders.shift()]});
    },{custom,project});
    await page.getByRole('button',{name:'Agent 配置',exact:true}).first().click();
    await page.getByRole('button',{name:'添加工作模式',exact:true}).click();
    await page.getByRole('button',{name:'继续',exact:true}).click();
    await page.getByRole('heading',{name:'将要更改',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'配置到 Codex',exact:true}).isDisabled(),true);
    const recovery=await page.locator('.conflict-recovery').boundingBox();
    const height=await page.evaluate(()=>innerHeight);
    assert.ok(recovery&&recovery.y>=0&&recovery.y+recovery.height<=height,'预检后应直接看到冲突恢复操作');
    assert.equal(await page.getByRole('button',{name:'为冲突选择其他技能目录',exact:true}).evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===el;}),true,'窄窗口恢复操作不能被内层滚动区或底部操作栏遮住');
    await page.getByRole('button',{name:'为冲突选择其他技能目录',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('.sync-preview'));
    await page.getByRole('button',{name:'继续',exact:true}).click();
    await page.getByRole('heading',{name:'将要更改',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'配置到 Codex',exact:true}).isEnabled(),true);
    await page.locator('.user-location>summary').click();
    await page.getByRole('button',{name:'恢复标准目录',exact:true}).click();
    await page.getByRole('button',{name:'继续',exact:true}).click();
    await page.getByRole('button',{name:'改用独立项目',exact:true}).click();
    await page.getByRole('button',{name:'项目 · separate-project',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'配置到 Codex',exact:true}).isEnabled(),true);
    assert.equal(await fs.readFile(existing,'utf8'),'UNMANAGED ORIGINAL');
    assert.equal(await fs.readdir(custom).then(files=>files.length),0,'恢复入口只选择位置，不偷偷配置');
    assert.deepEqual(errors,[]);
  }finally{await dispose(app);}
});
