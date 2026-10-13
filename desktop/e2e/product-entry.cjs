const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {launch,dispose}=require('./fixture.cjs');

test('entry explains Mode purpose, native availability and the next action',{timeout:120000},async()=>{
  const {app,page,errors}=await launch();
  try{
    await page.locator('.source-mode-card p').filter({hasText:'用于长期的内容研究、产品判断与表达。'}).waitFor();
    await page.getByRole('button',{name:'Agent 配置',exact:true}).first().click();
    await page.getByRole('heading',{name:/尚未在 .* 配置工作模式/}).waitFor();
    await app.evaluate(({ipcMain})=>{
      ipcMain.removeHandler('asl:assistants');
      ipcMain.handle('asl:assistants',()=>({ok:true,value:[{id:'codex-app',name:'Codex CLI',available:false,unavailableReason:'已找到 Codex CLI，但文件没有执行权限，请修复安装后重新检查。'}]}));
    });
    await page.locator('.source-tree button').filter({hasText:'Creator Studio'}).click();
    await page.getByRole('button',{name:'交给 AI 整理',exact:true}).first().click();
    await page.getByText(/已找到 Codex CLI，但文件没有执行权限/).waitFor();
    await page.getByRole('button',{name:'刷新工作库',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'查看整理结果',exact:true}).count(),0);
    await page.locator('.environment-guide textarea').fill('尚未发送的目标');
    page.removeAllListeners('dialog');page.on('dialog',dialog=>dialog.dismiss());
    await page.getByRole('button',{name:'刷新工作库',exact:true}).click();
    assert.equal(await page.locator('.environment-guide textarea').inputValue(),'尚未发送的目标','刷新离页不能丢掉未发送目标');
    assert.deepEqual(errors,[]);
  }finally{await dispose(app);}
});

test('authored skill wording stays searchable and keyboard opening preserves source content',{timeout:120000},async t=>{
  const library=await fs.mkdtemp(path.join(os.tmpdir(),'asl-skill-entry-'));
  t.after(()=>fs.rm(library,{recursive:true,force:true}));
  await fs.cp(path.join(__dirname,'../../examples/personal-environment'),library,{recursive:true});
  const modeFile=path.join(library,'modes/creator-studio/mode.yaml');
  await fs.writeFile(modeFile,(await fs.readFile(modeFile,'utf8')).replace('  architecture:\n','  architecture:\n    nodes:\n      - skill: product-analysis\n        title: 产品判断\n        note: 根据材料形成明确判断。\n'));
  const skillFile=path.join(library,'skills/product-analysis/SKILL.md'),before=await fs.readFile(skillFile);
  const {app,page,errors}=await launch({library});
  try{
    await page.getByRole('button',{name:'全部技能',exact:true}).first().click();
    const search=page.getByRole('textbox',{name:'搜索技能',exact:true});
    await search.fill('明确判断');
    const entry=page.getByRole('button',{name:'查看技能：产品判断',exact:true});
    await entry.waitFor();
    assert.equal(await page.getByRole('listitem').count(),1);
    await entry.focus();await page.keyboard.press('Enter');
    await page.locator('.skill-canvas.is-focused .package-rendered').waitFor();
    assert.deepEqual(await fs.readFile(skillFile),before);
    assert.deepEqual(errors,[]);
  }finally{await dispose(app);}
});
