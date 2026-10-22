const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {launch,dispose}=require('./fixture.cjs');

async function sample(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'asl-mechanisms-')),library=path.join(root,'library');
  await fs.cp(path.join(__dirname,'../../examples/personal-environment'),library,{recursive:true});
  await fs.cp(path.join(library,'skills/source-research'),path.join(library,'skills/spare-research'),{recursive:true});
  const spare=path.join(library,'skills/spare-research/SKILL.md');
  await fs.writeFile(spare,(await fs.readFile(spare,'utf8')).replace('name: source-research','name: spare-research').replace('# Source research','# Spare research'));
  await fs.mkdir(path.join(library,'modes/research-desk'),{recursive:true});
  await fs.writeFile(path.join(library,'modes/research-desk/MODE.md'),'# 资料核验\n');
  await fs.writeFile(path.join(library,'modes/research-desk/mode.yaml'),'apiVersion: asl-wep/v0.4.0\nkind: ModeProjection\nmetadata: {id: research-desk}\nspec:\n  skills: [source-research]\n  architecture:\n    shared: []\n    paradigms:\n      - id: verify-sources\n        title: 资料核验\n        description: 核对公开来源\n        skills: [source-research]\n        edges: []\n');
  await fs.mkdir(path.join(library,'modes/creator-studio/notes'));
  await fs.writeFile(path.join(library,'modes/creator-studio/notes/check.md'),'# 配套核对表\n\n这是隔离验收资料。');
  const git=(...args)=>execFileSync('git',['-C',library,...args],{encoding:'utf8'}).trim();
  git('init');git('config','user.name','ASL 验收');git('config','user.email','test@example.invalid');git('config','core.autocrlf','false');
  git('add','.');git('commit','-m','2026-10-22 22:00｜建立机制产品化的隔离验收基线');
  const source=path.join(library,'skills/source-research/SKILL.md');
  await fs.appendFile(source,'\n关键事实保留原始链接。\n');git('add','.');git('commit','-m','2026-10-22 22:01｜核对反馈对应的来源记录变化');
  return {root,library,source,revision:git('rev-parse','HEAD'),git};
}

test('usage, feedback responsibility and linked diff stay in the existing files',{timeout:120000},async t=>{
  const sampleData=await sample(),{root,library,source,revision,git}=sampleData;
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const original=await fs.readFile(source),head=git('rev-parse','HEAD');
  const {app,page,errors}=await launch({library});
  try{
    await page.getByRole('button',{name:'全部技能',exact:true}).first().click();
    await page.getByRole('button',{name:'查看技能：Source research',exact:true}).click();
    await page.getByRole('button',{name:/使用关系/}).click();
    const relation=page.getByRole('dialog',{name:'Source research的使用关系'});
    assert.match(await relation.innerText(),/2|Creator Studio/);
    assert.match(await relation.innerText(),/由 Product analysis 带入/);
    assert.match(await relation.innerText(),/直接选择这项能力/);
    await relation.getByRole('button',{name:'归档技能',exact:true}).click();
    assert.equal(await relation.getByRole('button',{name:'继续归档',exact:true}).isDisabled(),true);
    await relation.getByRole('button',{name:'检查引用：Product analysis',exact:true}).click();
    await page.locator('.editor-page-heading h1').filter({hasText:'Product analysis'}).waitFor();
    await page.getByRole('button',{name:'编辑',exact:true}).waitFor();
    await page.getByRole('button',{name:'返回',exact:true}).click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.relationship-popover').evaluate(el=>el.matches(':popover-open')),false);
    await page.locator('.skill-context-actions').getByRole('button',{name:'反馈',exact:true}).click();
    assert.equal(await page.getByRole('combobox',{name:'反馈作用对象'}).inputValue(),'source-research');
    await page.getByRole('textbox',{name:'记录内容'}).fill('# 需要原始链接\n\n请保留每个关键事实的出处。');
    await page.getByRole('button',{name:'保存',exact:true}).click();
    await page.getByRole('button',{name:'需要原始链接',exact:true}).waitFor();
    await page.getByRole('button',{name:'编辑',exact:true}).click();
    await page.getByRole('button',{name:'从已有版本中选择',exact:true}).click();
    await page.locator('.file-history-diff').filter({hasText:'关键事实保留原始链接'}).waitFor();
    await page.getByRole('button',{name:'关联这次修改',exact:true}).click();
    await page.getByRole('textbox',{name:'反馈核对记录',exact:true}).fill('在隔离样例中核对原始链接要求，后续业务效果待实际使用。');
    await page.getByRole('button',{name:'保存',exact:true}).click();
    await page.getByRole('button',{name:'交给 Agent 继续处理',exact:true}).waitFor();
    await page.getByRole('button',{name:'查看实际变化',exact:true}).click();
    await page.locator('.file-history-diff').filter({hasText:'关键事实保留原始链接'}).waitFor();
    const recordFile=(await fs.readdir(path.join(library,'feedback'))).find(name=>name.endsWith('.md'));
    const record=await fs.readFile(path.join(library,'feedback',recordFile),'utf8');
    assert.match(record,new RegExp(revision));assert.match(record,/"target": "source-research"/);
    await page.getByRole('button',{name:'交给 Agent 继续处理',exact:true}).click();
    await page.getByRole('heading',{name:'处理反馈',exact:true}).waitFor();
    assert.match(await page.locator('.environment-guide textarea').inputValue(),/source-research/);
    assert.match(await page.locator('.environment-guide textarea').inputValue(),new RegExp(recordFile));
    assert.deepEqual(await fs.readFile(source),original);assert.equal(git('rev-parse','HEAD'),head);
    assert.deepEqual(errors,[]);
  }catch(error){console.error('流程失败时的界面：',await page.locator('body').innerText());throw error;}finally{await dispose(app);}
});

test('Skill retirement previews and native cancellation preserve the complete package, then archive restores it',{timeout:120000},async t=>{
  const {root,library}=await sample();t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const skill=path.join(library,'skills/spare-research'),original=await fs.readFile(path.join(skill,'SKILL.md'));
  const {app,page,errors}=await launch({library});
  try{
    await page.getByRole('button',{name:'全部技能',exact:true}).first().click();
    await page.getByRole('button',{name:'查看技能：Spare research',exact:true}).click();
    await page.getByRole('button',{name:/使用关系/}).click();
    await page.getByRole('button',{name:'归档技能',exact:true}).click();
    await page.getByRole('button',{name:'继续归档',exact:true}).click();
    await page.getByRole('heading',{name:'归档内容',exact:true}).waitFor();
    await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:0});});
    await page.getByRole('button',{name:'确认归档',exact:true}).click();
    assert.deepEqual(await fs.readFile(path.join(skill,'SKILL.md')),original);
    await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});
    await page.getByRole('button',{name:'确认归档',exact:true}).click();
    await page.getByText('已归档，原文件已保留。',{exact:true}).waitFor();
    assert.equal(await fs.stat(skill).catch(()=>null),null);
    await page.getByRole('button',{name:'工作模式',exact:true}).first().click();
    await page.getByRole('button',{name:'归档',exact:true}).click();
    await page.locator('.archive-browser .package-tree button').filter({hasText:'Spare research'}).click();
    await page.getByRole('button',{name:'恢复到工作库',exact:true}).click();
    await page.getByText('已恢复到工作库',{exact:true}).waitFor();
    assert.deepEqual(await fs.readFile(path.join(skill,'SKILL.md')),original);
    assert.ok(await fs.stat(path.join(skill,'SOURCE.md')));assert.deepEqual(errors,[]);
  }catch(error){console.error('归档失败时的界面：',await page.locator('body').innerText());throw error;}finally{await dispose(app);}
});

test('Skill saves show affected Modes before writing and Mode attachments open through the real bridge',{timeout:120000},async t=>{
  const {root,library,source}=await sample();t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const {app,page,errors}=await launch({library});
  try{
    const project=path.join(root,'project');await fs.mkdir(project);
    await app.evaluate(({dialog},project)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[project]});dialog.showMessageBox=async()=>({response:1});},project);
    await page.evaluate(()=>window.asl.choose('project'));
    const configured=await page.evaluate(values=>window.asl.run('project',values),{workspace:library,mode:'creator-studio',host:'codex-app',project});
    assert.equal(configured.ok,true,JSON.stringify(configured));
    await page.reload();
    const before=await fs.readFile(source,'utf8');
    await page.getByRole('button',{name:'全部技能',exact:true}).first().click();
    await page.getByRole('button',{name:'查看技能：Source research',exact:true}).click();
    await page.getByRole('button',{name:'编辑',exact:true}).click();
    await page.getByRole('textbox',{name:'文件内容'}).fill(before+'\n仅供样例核对。\n');
    await page.getByRole('button',{name:'校验并保存',exact:true}).click();
    await page.getByRole('region',{name:'保存影响预览',exact:true}).waitFor();
    assert.match(await page.locator('.file-save-preview').innerText(),/资料核验/);
    await page.locator('.file-save-preview').getByText('保存后需要更新 1 个配置位置',{exact:true}).waitFor();
    assert.equal(await fs.readFile(source,'utf8'),before);
    await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});
    await page.getByRole('button',{name:'确认保存更改',exact:true}).click();
    await page.getByRole('heading',{name:'能力已保存',exact:true}).waitFor();
    assert.match(await fs.readFile(source,'utf8'),/仅供样例核对/);
    await page.getByRole('button',{name:'改过什么',exact:true}).click();
    await page.locator('.file-history-diff').filter({hasText:'仅供样例核对'}).waitFor();
    await page.locator('.source-tree button').filter({hasText:'Creator Studio'}).first().click();
    await page.getByRole('button',{name:'配套资料',exact:true}).click();
    await page.getByRole('button',{name:'notes/check.md',exact:true}).click();
    await page.getByRole('heading',{name:'配套核对表',exact:true}).waitFor();
    assert.deepEqual(errors,[]);
  }catch(error){console.error('保存失败时的界面：',await page.locator('body').innerText());throw error;}finally{await dispose(app);}
});

test('a selected replacement is compared file by file and native cancellation keeps local edits',{timeout:120000},async t=>{
  const {root,library,source}=await sample();t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const candidate=path.join(root,'candidate');
  await fs.cp(path.dirname(source),candidate,{recursive:true});
  await fs.appendFile(path.join(candidate,'SKILL.md'),'\n候选版本增加一条核验要求。\n');
  const before=await fs.readFile(source);
  const {app,page,errors}=await launch({library});
  try{
    await app.evaluate(({dialog},candidate)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[candidate]});dialog.showMessageBox=async()=>({response:0});},candidate);
    await page.getByRole('button',{name:'全部技能',exact:true}).first().click();
    await page.getByRole('button',{name:'查看技能：Source research',exact:true}).click();
    await page.getByRole('button',{name:'比较来源版本',exact:true}).click();
    await page.getByRole('button',{name:'选择本地版本',exact:true}).click();
    await page.getByRole('button',{name:'比较这份版本',exact:true}).click();
    await page.getByRole('heading',{name:'替换能力版本',exact:true}).waitFor();
    await page.locator('.package-comparison summary').filter({hasText:'SKILL.md'}).click();
    await page.locator('.package-comparison .file-history-diff').filter({hasText:'候选版本增加一条核验要求'}).waitFor();
    assert.deepEqual(await fs.readFile(source),before);
    await page.getByRole('button',{name:'确认替换完整包',exact:true}).click();
    assert.deepEqual(await fs.readFile(source),before);
    await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});
    await page.getByRole('button',{name:'确认替换完整包',exact:true}).click();
    await page.getByText('已保存。',{exact:true}).waitFor();
    assert.match(await fs.readFile(source,'utf8'),/候选版本增加一条核验要求/);
    assert.deepEqual(errors,[]);
  }catch(error){console.error('来源比较失败时的界面：',await page.locator('body').innerText());throw error;}finally{await dispose(app);}
});
