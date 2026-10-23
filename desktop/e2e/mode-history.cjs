const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {launch,packagedCore,dispose}=require('./fixture.cjs');
const root=path.resolve(__dirname,'../..');
function git(library,...args){return execFileSync('git',['-C',library,...args],{encoding:'utf8',windowsHide:true}).trim();}
function core(library,args,input){
  const exe=packagedCore();
  return JSON.parse(execFileSync(exe||process.env.ASL_PYTHON||'python',[...(exe?[]:['-m','asl_harness.commands']),...args,'--workspace',library],{input:input&&JSON.stringify(input),encoding:'utf8',windowsHide:true,env:{...process.env,PYTHONPATH:path.join(root,'src')}}));
}
test('Mode evolution directly scrubs one live canvas, restores safely and continues editing',{timeout:180000},async()=>{
  const output=await fs.mkdtemp(path.join(process.env.ASL_E2E_OUTPUT||os.tmpdir(),'asl-evolution-')),library=path.join(output,'library');
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
  await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.restore();win.setContentSize(1024,768);win.show();win.webContents.setBackgroundThrottling(false);});
  async function capture(name){
    const bytes=await app.evaluate(async({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0],[width,height]=win.getContentSize();return(await win.capturePage()).resize({width,height,quality:'best'}).toPNG();});
    await fs.writeFile(path.join(run,name),Buffer.from(bytes));
  }
  const waitDrawing=revision=>page.waitForFunction(revision=>{
    const canvas=document.querySelector('.evolution-canvas');
    return canvas?.dataset.revision===revision&&!!canvas.querySelector('.mermaid-viewport:not([inert]) svg');
  },revision);
  try{
    await page.locator('.source-tree button').filter({hasText:'Creator Studio'}).first().click();
    await page.getByRole('button',{name:'演变记录',exact:true}).click();
    await page.locator('.evolution-canvas svg').waitFor();
    const range=page.getByRole('slider',{name:'演进时间轴'});
    await page.waitForFunction(()=>Number(document.querySelector('input[aria-label="演进时间轴"]')?.max)>1);
    assert.equal(await page.locator('.evolution-canvas').count(),1);assert.equal(await page.locator('.mode-history img').count(),0);
    const max=Number(await range.getAttribute('max'));
    assert.equal(await page.locator('.evolution-events button').count(),max+1,'每个版本在同一条轨道中保持独立位置');
    // Actual mouse scrub, not a synthetic change event. Rapid direction changes keep only the final selection.
    const bounds=await range.boundingBox();
    await page.mouse.move(bounds.x+bounds.width,bounds.y+bounds.height/2);await page.mouse.down();
    await page.mouse.move(bounds.x+bounds.width*.25,bounds.y+bounds.height/2,{steps:8});
    await page.mouse.move(bounds.x+bounds.width*.6,bounds.y+bounds.height/2,{steps:8});await page.mouse.up();
    await page.waitForFunction(()=>!!document.querySelector('.evolution-canvas').dataset.revision);
    await range.fill(String(max));await waitDrawing('current');
    const ordered=[...history.entries].reverse();await range.fill(String(ordered.findIndex(entry=>entry.revision===older.revision)));
    await waitDrawing(older.revision);
    assert.match(await page.locator('.evolution-canvas').innerText(),/初步分析/);
    assert.ok(await page.locator('.evolution-canvas .evolution-changed').count()>0,'实际渲染的命名空间不能阻断节点变化提示');
    const trace=page.getByRole('button',{name:'变化说明',exact:true});
    if(await trace.getAttribute('aria-expanded')!=='true')await trace.click();
    await page.locator('.history-trace').waitFor();
    assert.equal(await page.locator('.history-trace').count(),1,'选中版本应有同版本的变更依据');
    await page.getByRole('button',{name:'补充说明',exact:true}).click();
    const explanation=page.getByRole('textbox',{name:'变更说明',exact:true});
    await explanation.fill('# 调整依据\n\n用户明确要求先核对来源，再形成判断。\n');
    await app.evaluate(({dialog})=>{globalThis.aslHistoryDialog=dialog.showMessageBox;dialog.showMessageBox=async()=>({response:0});});
    await page.getByRole('button',{name:'保存说明',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.mode-history')?.getAttribute('aria-busy')==='false');
    assert.equal(await explanation.isVisible(),true,'取消保存保留草稿');
    assert.equal(core(library,['environment.history','--mode','creator-studio','--revision',older.revision]).note,null);
    await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});
    await page.getByRole('button',{name:'保存说明',exact:true}).click();
    await page.getByText('说明已保存',{exact:true}).waitFor();
    assert.match(await page.locator('.history-trace').innerText(),/先核对来源/);
    assert.equal(git(library,'rev-parse','HEAD'),head);
    await range.fill(String(max));await waitDrawing('current');
    assert.doesNotMatch(await page.locator('.history-trace').innerText(),/先核对来源/,'切换版本不能显示上个版本的说明');
    assert.match(await page.locator(`.evolution-events [data-revision="${older.revision}"]`).innerText(),/调整依据/,'已读取的节点主题不能在离开后退回泛化标题');
    await range.focus();await page.keyboard.press('ArrowLeft');
    assert.equal(Number(await range.inputValue()),max-1,'原生时间轴保留键盘逐版本浏览');
    await range.fill(String(ordered.findIndex(entry=>entry.revision===older.revision)));await waitDrawing(older.revision);
    await page.getByRole('button',{name:'编辑说明',exact:true}).click();
    await explanation.fill('外部说明改变后，这份草稿应保留。');
    const actualNote=core(library,['environment.history','--mode','creator-studio','--revision',older.revision]).note;
    core(library,['environment.history.note','--revision',older.revision],{document:'外部补充的真实说明',expected:actualNote.fingerprint});
    await page.getByRole('button',{name:'保存说明',exact:true}).click();
    await page.getByText('说明未保存，草稿已保留。',{exact:true}).waitFor();
    assert.equal(await explanation.inputValue(),'外部说明改变后，这份草稿应保留。');
    assert.equal(core(library,['environment.history','--mode','creator-studio','--revision',older.revision]).note.document,'外部补充的真实说明\n');
    await app.evaluate(({dialog})=>{dialog.showMessageBox=globalThis.aslHistoryDialog;});
    await page.getByRole('button',{name:'重新读取说明',exact:true}).click();
    await page.getByText('外部补充的真实说明',{exact:true}).waitFor();
    assert.equal(await explanation.count(),0,'明确放弃草稿后读取新说明，不能沿用过期指纹');
    const timings=[];
    for(const value of [max,ordered.findIndex(entry=>entry.revision===older.revision),max,ordered.findIndex(entry=>entry.revision===older.revision)]){
      const started=Date.now();await range.fill(String(value));
      await waitDrawing(value===max?'current':older.revision);
      timings.push(Date.now()-started);
    }
    console.log('已读版本来回切换耗时(ms)：'+timings.join(','));
    for(const name of ['协作时序','能力结构','研究协作']){
      await page.getByRole('tab',{name,exact:true}).click();
      await page.waitForFunction(name=>document.querySelector('.evolution-graphs [aria-selected=true]')?.textContent===name,name);
      await waitDrawing(older.revision);
      await capture(`evolution-${name}.png`);
    }
    await capture('mode-evolution.png');
    const unchanged=await fs.readFile(path.join(library,'modes/creator-studio/MODE.md'));
    for(const name of ['研究协作','协作时序','能力结构']){
      await page.getByRole('tab',{name,exact:true}).click();
      await range.fill(String(ordered.findIndex(entry=>entry.revision===older.revision)));await waitDrawing(older.revision);
      await range.press('End');await waitDrawing('current');
      assert.match(await page.locator('.evolution-canvas').innerText(),/形成判断/);
      assert.equal(await page.locator('.evolution-canvas').count(),1);
      assert.equal(await page.getByRole('button',{name:/回放|播放/}).count(),0,'版本浏览没有播放控制');
      await capture(`scrub-${name}.png`);
    }
    await page.getByRole('tab',{name:'研究协作',exact:true}).click();
    await range.fill(String(ordered.findIndex(entry=>entry.revision===older.revision)));await waitDrawing(older.revision);
    await range.fill(String(max-1));await waitDrawing(ordered[max-1].revision);
    assert.ok(await page.locator('.evolution-changed').count()>0);
    await range.press('End');await waitDrawing('current');
    assert.equal(await page.locator('.evolution-changed').count(),0,'相同图形的下一版本不能沿用上次变化提示');
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(920,740));
    const timeline=page.locator('.evolution-timeline');
    await page.waitForFunction(()=>{const view=document.querySelector('.evolution-timeline'),node=view.querySelector('[aria-current=step]'),a=node.getBoundingClientRect(),b=view.getBoundingClientRect();return a.left>=b.left&&a.right<=b.right;});
    const selectedTitle=page.locator('.evolution-selection>strong'),originalTitle=await selectedTitle.innerText();
    await selectedTitle.evaluate(node=>{node.textContent='用于核对窄窗口的长版本主题：'.repeat(12);});
    assert.equal(await selectedTitle.evaluate(node=>node.getBoundingClientRect().right<=document.querySelector('.evolution-navigation').getBoundingClientRect().left),true,'长主题不能遮住版本位置和键盘提示');
    await selectedTitle.evaluate((node,title)=>{node.textContent=title;},originalTitle);
    const beforeScroll=await timeline.evaluate(view=>view.scrollLeft);
    await timeline.hover();await page.mouse.wheel(0,-200);
    await page.waitForFunction(before=>document.querySelector('.evolution-timeline').scrollLeft<before,beforeScroll);
    assert.equal(await range.inputValue(),String(max),'滚动浏览不能擅自更换正在阅读的版本');
    await range.focus();await range.press('Home');await waitDrawing(ordered[0].revision);
    await range.press('End');await waitDrawing('current');
    await new Promise(resolve=>setTimeout(resolve,1300));
    assert.equal(await range.inputValue(),String(max),'没有任何自动播放计时器推进版本');
    assert.deepEqual(await fs.readFile(path.join(library,'modes/creator-studio/MODE.md')),unchanged,'浏览不写入当前 Mode');
    await range.fill(String(ordered.findIndex(entry=>entry.revision===older.revision)));await waitDrawing(older.revision);
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
    await page.waitForFunction(()=>document.querySelector('.evolution-summary')?.textContent.includes('已恢复'),null,{timeout:90000});
    assert.match(await fs.readFile(path.join(library,'modes/creator-studio/MODE.md'),'utf8'),/初步分析/);
    assert.equal(git(library,'rev-parse','HEAD'),head);assert.deepEqual(await fs.readFile(path.join(library,'skills/source-research/SKILL.md')),original);
    const updated=core(library,['environment.history','--mode','creator-studio']);assert.equal(updated.entries.length,history.entries.length+1);
    await page.getByRole('button',{name:'从这里继续编辑',exact:true}).click();await page.locator('.mode-workspace-native').waitFor();
    assert.deepEqual(errors,[]);console.log('演进时间轴实机：'+run);
  }catch(error){console.error(run,errors,error.stack);await capture('evolution-failure.png').catch(capture=>console.error(capture.message));throw error;}
  finally{await dispose(app);}
});
