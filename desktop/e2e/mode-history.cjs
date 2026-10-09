const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {launch,packagedCore}=require('./fixture.cjs');
const root=path.resolve(__dirname,'../..');
function git(library,...args){return execFileSync('git',['-C',library,...args],{encoding:'utf8',windowsHide:true}).trim();}
function core(library,args,input){
  const exe=packagedCore();
  return JSON.parse(execFileSync(exe||process.env.ASL_PYTHON||'python',[...(exe?[]:['-m','asl_harness.commands']),...args,'--workspace',library],{input:input&&JSON.stringify(input),encoding:'utf8',windowsHide:true,env:{...process.env,PYTHONPATH:path.join(root,'src')}}));
}
test('Mode evolution scrubs one live canvas, replays, restores safely and continues editing',{timeout:180000},async()=>{
  const output=await fs.mkdtemp(path.join(os.tmpdir(),'asl-evolution-')),library=path.join(output,'library');
  await fs.cp(path.join(root,'examples/personal-environment'),library,{recursive:true});
  git(library,'init');git(library,'config','core.autocrlf','false');git(library,'config','user.name','ASL 临时验收');git(library,'config','user.email','test@example.invalid');
  git(library,'add','.');git(library,'commit','-m','2026-10-08 12:00｜建立隔离验收样例');
  const head=git(library,'rev-parse','HEAD'),original=await fs.readFile(path.join(library,'skills/source-research/SKILL.md'));
  const diagram=(label,extra='')=>`# Creator Studio\n\n## 研究协作\n\n\`\`\`mermaid\nflowchart LR\nskill_source_research["资料检索"] --> skill_product_analysis["${label}"]\n${extra}\n\`\`\`\n\n## 协作时序\n\n\`\`\`mermaid\nsequenceDiagram\nparticipant A as 资料检索\nparticipant B as 产品分析\nA->>B: ${label}\n\`\`\`\n\n## 能力结构\n\n\`\`\`mermaid\nmindmap\n  root((研究))\n    read[资料检索]\n    analyze[${label}]\n\`\`\`\n`;
  function save(document){const mode=core(library,['environment.catalog']).modes[0];return core(library,['environment.edit'],{operation:'mode.save',id:mode.id,expected:mode.fingerprint,skills:mode.roots,document});}
  save(diagram('初步分析'));save(diagram('证据核对','skill_product_analysis --> check["交叉确认"]'));save(diagram('形成判断','skill_product_analysis --> check["交叉确认"]\ncheck --> skill_source_research'));
  const history=core(library,['environment.history','--mode','creator-studio']);assert.ok(history.entries.length>=4);
  const older=history.entries.find(entry=>core(library,['environment.history','--mode','creator-studio','--revision',entry.revision]).snapshot.document.includes('初步分析'));
  const {app,page,run,errors}=await launch({library,output});
  try{
    await page.locator('.source-tree button').filter({hasText:'Creator Studio'}).first().click();
    await page.getByRole('button',{name:'演变记录',exact:true}).click();
    await page.locator('.evolution-canvas svg').waitFor();
    const range=page.getByRole('slider',{name:'演进时间轴'});
    await page.waitForFunction(()=>Number(document.querySelector('input[aria-label="演进时间轴"]')?.max)>1);
    assert.equal(await page.locator('.evolution-canvas').count(),1);assert.equal(await page.locator('.mode-history img').count(),0);
    const max=Number(await range.getAttribute('max'));
    // Actual mouse scrub, not a synthetic change event. Rapid direction changes keep only the final selection.
    const bounds=await range.boundingBox();
    await page.mouse.move(bounds.x+bounds.width,bounds.y+bounds.height/2);await page.mouse.down();
    await page.mouse.move(bounds.x+bounds.width*.25,bounds.y+bounds.height/2,{steps:8});
    await page.mouse.move(bounds.x+bounds.width*.6,bounds.y+bounds.height/2,{steps:8});await page.mouse.up();
    await page.waitForFunction(()=>!!document.querySelector('.evolution-canvas').dataset.revision);
    await range.fill(String(max));await page.waitForFunction(()=>document.querySelector('.evolution-canvas').dataset.revision==='current');
    const ordered=[...history.entries].reverse();await range.fill(String(ordered.findIndex(entry=>entry.revision===older.revision)));
    await page.waitForFunction(revision=>document.querySelector('.evolution-canvas').dataset.revision===revision,older.revision);
    assert.match(await page.locator('.evolution-canvas').innerText(),/初步分析/);
    const timings=[];
    for(const value of [max,ordered.findIndex(entry=>entry.revision===older.revision),max,ordered.findIndex(entry=>entry.revision===older.revision)]){
      const started=Date.now();await range.fill(String(value));
      await page.waitForFunction(revision=>document.querySelector('.evolution-canvas').dataset.revision===revision,value===max?'current':older.revision);
      timings.push(Date.now()-started);
    }
    console.log('已读版本来回切换耗时(ms)：'+timings.join(','));
    for(const name of ['协作时序','能力结构','研究协作']){
      await page.getByRole('tab',{name,exact:true}).click();
      await page.waitForFunction(name=>document.querySelector('.evolution-graphs [aria-selected=true]')?.textContent===name,name);
      await page.locator('.evolution-canvas svg').waitFor();
      await page.screenshot({path:path.join(run,`evolution-${name}.png`)});
    }
    await page.screenshot({path:path.join(run,'mode-evolution.png')});
    await page.getByRole('button',{name:'回放变化',exact:true}).click();await page.getByRole('button',{name:'暂停回放',exact:true}).click();
    await page.getByLabel('记录操作',{exact:true}).click();
    await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:0});});
    const before=await fs.readFile(path.join(library,'modes/creator-studio/MODE.md'));
    await page.getByRole('button',{name:'恢复这个版本',exact:true}).click();
    await page.getByRole('button',{name:'全部技能',exact:true}).first().click();
    assert.equal(await page.locator('.mode-history').count(),1,'恢复期间不能切走丢失结果');
    await page.waitForFunction(()=>document.querySelector('.mode-history')?.getAttribute('aria-busy')==='false');
    assert.deepEqual(await fs.readFile(path.join(library,'modes/creator-studio/MODE.md')),before);
    await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});
    await page.getByRole('button',{name:'恢复这个版本',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.evolution-summary')?.textContent.includes('已恢复'));
    assert.match(await fs.readFile(path.join(library,'modes/creator-studio/MODE.md'),'utf8'),/初步分析/);
    assert.equal(git(library,'rev-parse','HEAD'),head);assert.deepEqual(await fs.readFile(path.join(library,'skills/source-research/SKILL.md')),original);
    const updated=core(library,['environment.history','--mode','creator-studio']);assert.equal(updated.entries.length,history.entries.length+1);
    await page.getByRole('button',{name:'从这里继续编辑',exact:true}).click();await page.locator('.mode-workspace-native').waitFor();
    assert.deepEqual(errors,[]);console.log('演进时间轴实机：'+run);
  }catch(error){await page.screenshot({path:path.join(run,'evolution-failure.png')});console.error(run,errors,await page.locator('body').innerText());throw error;}
  finally{await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(window=>window.destroy()));await app.close();}
});
