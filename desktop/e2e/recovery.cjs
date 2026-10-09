const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {launch,packagedCore}=require('./fixture.cjs');
// Match the existing core write deadline; latency is measured separately, not by this safety test.
const ready=page=>page.waitForFunction(()=>!document.querySelector('.mermaid-viewport[inert],.mermaid-edit[aria-busy="true"]'),null,{timeout:120000});
const center=async el=>{const r=await el.boundingBox();assert.ok(r);return {x:r.x+r.width/2,y:r.y+r.height/2};};
async function example(){
  const output=await fs.mkdtemp(path.join(os.tmpdir(),'asl-recovery-')),library=path.join(output,'library');
  await fs.cp(path.join(__dirname,'../../examples/personal-environment'),library,{recursive:true});
  const file=path.join(library,'modes/creator-studio/MODE.md');
  await fs.appendFile(file,'\n## 恢复流程\n\n```mermaid\nflowchart LR\n a[资料]\n b[分析]\n a --> b\n```\n\n## 恢复时序\n\n```mermaid\nsequenceDiagram\n participant a as 资料\n participant b as 分析\n a->>b: 第一条\n b-->>a: 第二条\n```\n\n## 恢复层级\n\n```mermaid\nmindmap\n root((组织))\n  a[资料]\n  b[分析]\n```\n');
  return {...await launch({library,output}),file};
}
async function open(page,title='恢复流程'){
  await page.locator('.source-tree button').filter({hasText:'Creator Studio'}).first().click();
  await page.getByRole('tab',{name:title,exact:true}).click();await ready(page);
  await page.locator('.mermaid-drawing>svg').waitFor();
}
async function dispose(app){
  // Never force-close a real user window; this is the fixture's isolated process.
  if(app.process().exitCode===null&&app.windows().some(window=>!window.isClosed()))await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(window=>window.destroy()));
  await app.close();
}

test('all drag types cancel on blur, Escape and pointercancel, then complete a normal gesture',{timeout:480000},async()=>{
  const {app,page,file,run,errors}=await example();
  try{
    await page.evaluate(()=>{
      globalThis.unboundFrames=[];
      new MutationObserver(()=>{
        for(const svg of document.querySelectorAll('.mermaid-edit .mermaid-viewport:not([inert]) svg[aria-roledescription="flowchart-v2"]')){
          if([...svg.querySelectorAll('g.node')].some(node=>typeof node.onpointerdown!=='function'))globalThis.unboundFrames.push(svg.id);
        }
      }).observe(document.querySelector('.content'),{childList:true,subtree:true,attributes:true,attributeFilter:['inert']});
    });
    const cases=[['恢复流程','g.node[data-canvas-node="b"]','g.node[data-canvas-node="a"]'],['恢复时序','text.messageText:last-of-type','text.messageText:first-of-type'],['恢复层级','g.node[data-asl-node="b"]','g.node[data-asl-node="a"]']];
    for(const [title,from,to] of cases){
      await open(page,title);const source=page.locator(from),target=page.locator(to);await source.waitFor();
      for(const cancel of ['blur','Escape','pointercancel']){
        const before=await fs.readFile(file,'utf8'),a=await center(source),b=await center(target);
        await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y+2,{steps:12});
        if(cancel==='Escape')await page.keyboard.press('Escape');
        else if(cancel==='pointercancel')await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1})));
        else await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
        await page.mouse.up();await ready(page);
        assert.equal(await page.locator('.is-dragging,.is-moving,.is-drop-target').count(),0,title+cancel);
        assert.equal(await fs.readFile(file,'utf8'),before,'取消不写入 '+title+cancel);
      }
      const before=await fs.readFile(file,'utf8'),a=await center(source),b=await center(target);
      await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y+2,{steps:12});await page.mouse.up();await ready(page);
      assert.notEqual(await fs.readFile(file,'utf8'),before,'取消后可再次正常拖动 '+title);
    }
    assert.deepEqual(await page.evaluate(()=>globalThis.unboundFrames),[],'画板可交互时必须已经绑定拖动');
    assert.deepEqual(errors,[]);console.log('取消恢复：'+run);
  }catch(error){console.error(run,error.stack);await page.screenshot({path:path.join(run,'drag-failure.png')});await fs.writeFile(path.join(run,'drag-failure.html'),await page.locator('body').innerHTML());throw error;}
  finally{await dispose(app);}
});

test('failed inline save retains editable input; retry succeeds and late failure stays visible across pages',{timeout:360000},async()=>{
  const {app,page,file,run,errors}=await example();
  async function fault(delay){await app.evaluate(({ipcMain},delay)=>{
    const original=globalThis.recoveryRun||ipcMain._invokeHandlers.get('asl:run');globalThis.recoveryRun=original;
    ipcMain.removeHandler('asl:run');ipcMain.handle('asl:run',async(e,action,...args)=>{
      if(action==='edit'){await new Promise(resolve=>setTimeout(resolve,delay));return {ok:false,error:'模拟写入不可用'};}
      return original(e,action,...args);
    });
  },delay);}
  const input=()=>page.locator('.mermaid-label-editor [role=textbox]');
  try{
    await open(page);const before=await fs.readFile(file,'utf8');await fault(0);
    await page.locator('g.node[data-canvas-node="a"]').dblclick();await input().fill('仍可继续修改');await input().press('Enter');
    await page.locator('.mermaid-edit [role=alert]').waitFor();
    await page.waitForFunction(()=>document.querySelector('.mermaid-label-editor [role=textbox]')?.isContentEditable);
    assert.equal(await input().innerText(),'仍可继续修改');assert.equal(await fs.readFile(file,'utf8'),before);
    await page.screenshot({path:path.join(run,'save-retry.png')});
    await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('asl:run');ipcMain.handle('asl:run',globalThis.recoveryRun);});
    await input().fill('重试成功');await input().press('Enter');await ready(page);
    assert.match(await fs.readFile(file,'utf8'),/重试成功/);
    await fault(1500);await page.locator('g.node[data-canvas-node="a"]').dblclick();await input().fill('跨页失败');await input().press('Enter');
    await page.waitForFunction(()=>document.querySelector('.mermaid-edit[aria-busy=true]'));
    // Wait for the save to reach IPC, then leave the view, not the application.
    await page.waitForTimeout(200);await page.getByRole('button',{name:'全部技能',exact:true}).first().click();await page.locator('.skill-library').waitFor();
    await page.locator('.toast[role=alert]').filter({hasText:'未保存：模拟写入不可用'}).waitFor();
    assert.doesNotMatch(await fs.readFile(file,'utf8'),/跨页失败/);
    assert.deepEqual(errors,[]);console.log('失败恢复：'+run);
  }finally{await dispose(app);}
});

test('direct canvas deletion, rename, connection and drag share undo/redo, while external writes invalidate history',{timeout:600000},async()=>{
  const {app,page,file,run,errors}=await example();
  const node=id=>page.locator(`g.node[data-canvas-node="${id}"]`);
  async function history(label){
    await page.locator('.mermaid-viewport').click({button:'right',position:{x:12,y:12}});
    await page.getByRole('menuitem',{name:label,exact:true}).click();await ready(page);
  }
  try{
    await open(page);const original=await fs.readFile(file,'utf8');
    await node('b').click({button:'right'});await page.getByRole('menuitem',{name:'移出画板',exact:true}).click();await ready(page);
    assert.equal(await node('b').count(),0);const removed=await fs.readFile(file,'utf8');
    await history('撤销');assert.equal(await fs.readFile(file,'utf8'),original);
    await history('重做');assert.equal(await fs.readFile(file,'utf8'),removed);
    await page.getByRole('button',{name:'全部技能',exact:true}).first().click();await open(page);
    await history('撤销');assert.equal(await fs.readFile(file,'utf8'),original,'切页仍是同一份操作历史');
    await node('a').click({button:'right'});await page.getByRole('menuitem',{name:'连接节点',exact:true}).click();await node('b').click();
    await page.waitForFunction(()=>document.querySelectorAll('path.flowchart-link').length===2);await ready(page);
    await history('撤销');assert.equal(await fs.readFile(file,'utf8'),original,'连线也按一步撤销');
    await node('a').dblclick();const input=page.locator('.mermaid-label-editor [role=textbox]');await input.fill('一次改字');await input.press('Enter');await ready(page);
    await history('撤销');assert.equal(await fs.readFile(file,'utf8'),original);
    const a=await center(node('a'));await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(a.x+40,a.y+35,{steps:10});await page.mouse.up();await ready(page);
    await history('撤销');assert.equal(await fs.readFile(file,'utf8'),original,'完整拖动一步撤销');
    await fs.appendFile(file,'\n外部 Agent 的修改\n');
    await page.getByRole('button',{name:'刷新技能库',exact:true}).click();await ready(page);
    await page.getByText('外部 Agent 的修改',{exact:true}).waitFor({state:'attached'});
    await page.locator('.mermaid-viewport').click({button:'right',position:{x:12,y:12}});
    assert.equal(await page.getByRole('menuitem',{name:'重做',exact:true}).count(),0);
    assert.match(await fs.readFile(file,'utf8'),/外部 Agent 的修改/);
    assert.deepEqual(errors,[]);console.log('直接画板历史：'+run);
  }finally{await dispose(app);}
});

test('repeat Skill reading reuses one request and explicit refresh retrieves external changes',{timeout:120000},async()=>{
  const {app,page,workspace,run,errors}=await launch();
  try{
    await app.evaluate(({ipcMain})=>{
      globalThis.fileReadCount=0;const original=ipcMain._invokeHandlers.get('asl:run');ipcMain.removeHandler('asl:run');
      ipcMain.handle('asl:run',(e,action,...args)=>{if(action==='files')globalThis.fileReadCount++;return original(e,action,...args);});
    });
    await page.getByRole('button',{name:'全部技能',exact:true}).first().click();
    const id=await page.locator('.skill-table-row').first().locator('[title]').first().getAttribute('title');
    const timings=[];
    for(let i=0;i<4;i++){
      const start=Date.now();await page.locator('.skill-table-row').first().click();await page.locator('.package-rendered').waitFor();
      timings.push(Date.now()-start);await page.locator('.skill-canvas-panel').getByRole('button',{name:'关闭',exact:true}).click();
    }
    assert.equal(await app.evaluate(()=>globalThis.fileReadCount),1);
    await page.locator('.skill-table-row').first().click();await page.locator('.package-rendered').waitFor();
    await fs.appendFile(path.join(workspace,'skills',id,'SKILL.md'),'\n## 外部测试内容\n');
    await page.getByRole('button',{name:'重新读取文件',exact:true}).click();
    await page.getByRole('heading',{name:'外部测试内容',exact:true}).waitFor();
    assert.ok(await app.evaluate(()=>globalThis.fileReadCount)>=2);
    console.log('技能复用耗时：'+JSON.stringify({run,timings}));assert.deepEqual(errors,[]);
  }finally{await dispose(app);}
});

test('external updates refresh an open reader, but preserve file and inline drafts until explicit discard',{timeout:240000},async()=>{
  const {app,page,file,workspace,run,errors}=await example();
  try{
    await open(page);
    await page.getByRole('button',{name:'全部技能',exact:true}).first().click();
    await page.locator('.skill-table-row').filter({has:page.locator('[title="product-analysis"]')}).first().click();
    await page.locator('.package-rendered').waitFor();
    const skill=path.join(workspace,'skills/product-analysis/SKILL.md');
    await fs.appendFile(skill,'\n## 外部新版正文\n');
    await page.getByRole('heading',{name:'外部新版正文',exact:true}).waitFor({timeout:15000});
    await page.getByRole('button',{name:'编辑',exact:true}).click();
    await page.getByRole('textbox',{name:'文件内容',exact:true}).fill('保留我的文件草稿');
    await fs.appendFile(skill,'\n## 再次更新\n');
    await page.getByText('文件已更新，未保存内容已保留。',{exact:true}).waitFor();
    assert.equal(await page.getByRole('textbox',{name:'文件内容',exact:true}).inputValue(),'保留我的文件草稿');
    await page.getByRole('button',{name:'读取新版本',exact:true}).click();
    await page.getByRole('heading',{name:'再次更新',exact:true}).waitFor();
    assert.doesNotMatch(await fs.readFile(skill,'utf8'),/保留我的文件草稿/);
    await open(page);
    await page.locator('g.node[data-canvas-node="a"]').dblclick();
    const input=page.locator('.mermaid-label-editor [role=textbox]');await input.fill('保留我的节点草稿');
    await fs.writeFile(file,(await fs.readFile(file,'utf8')).replace('a[资料]','a[外部节点新版]'));
    await page.getByText('文件已更新，未保存内容已保留。',{exact:true}).waitFor();
    assert.equal(await input.innerText(),'保留我的节点草稿');
    await input.press('Escape');await page.getByRole('button',{name:'外部节点新版',exact:true}).waitFor({timeout:15000});
    assert.deepEqual(errors,[]);console.log('外部编辑保护：'+run);
  }finally{await dispose(app);}
});

test('legacy reading records reopen in the same main canvas reader as new selections',{timeout:120000},async()=>{
  const {app,page,workspace,run,errors}=await launch();
  try{
    await page.evaluate(async root=>{const reply=await window.asl.rememberView(root,{page:'skills',mode:'',view:'map',skill:'product-analysis'});if(!reply.ok)throw Error(reply.error);},workspace);
    await page.reload();await page.locator('.skill-canvas-panel .package-rendered').waitFor();
    assert.equal(await page.locator('.inspector').count(),0);
    await page.locator('.skill-canvas-panel').getByRole('button',{name:'关闭',exact:true}).click();
    await page.locator('.skill-table-row').filter({has:page.locator('[title="product-analysis"]')}).first().click();
    await page.locator('.skill-canvas-panel .package-rendered').waitFor();
    assert.deepEqual(errors,[]);console.log('阅读记录统一：'+run);
  }finally{await dispose(app);}
});

test('a first Mode can be created and reopened from an ordinary complete Skill, without an Agent',{timeout:240000},async()=>{
  const {app,page,run,errors}=await launch({empty:true});
  const source=path.join(run,'ordinary-reading'),original='---\nname: reading\ndescription: 阅读材料\n---\n# 我的阅读技能\n\n保留完整内容。\n';
  try{
    await fs.mkdir(path.join(source,'scripts'),{recursive:true});
    await fs.writeFile(path.join(source,'SKILL.md'),original);
    await fs.writeFile(path.join(source,'scripts/read.py'),'print("read")\n');
    await app.evaluate(({dialog},source)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});dialog.showMessageBox=async()=>({response:1});},source);
    await page.getByRole('button',{name:'从这台电脑开始',exact:true}).click();
    await page.getByRole('textbox',{name:'模式名称',exact:true}).fill('我的阅读工作');
    await page.getByRole('button',{name:'目录',exact:true}).click();
    await page.getByRole('button',{name:'加入 我的阅读技能',exact:true}).click();
    await page.locator('g.node[data-canvas-node="skill_reading"]').waitFor();
    await page.getByRole('button',{name:'保存',exact:true}).click();
    await page.locator('.mode-page').waitFor({timeout:60000});
    const target=path.join(run,'home/app/workspace');
    assert.equal(await fs.readFile(path.join(target,'skills/reading/SKILL.md'),'utf8'),original);
    assert.equal(await fs.readFile(path.join(target,'skills/reading/scripts/read.py'),'utf8'),'print("read")\n');
    assert.equal(await fs.readFile(path.join(source,'SKILL.md'),'utf8'),original);
    await assert.rejects(fs.stat(path.join(source,'SOURCE.md')),/ENOENT/);
    assert.equal((await fs.readdir(path.join(target,'modes'))).length,1);
    await page.reload();await page.locator('.mode-page').waitFor();
    await page.locator('g.node[data-canvas-node="skill_reading"]').click();await page.locator('.package-rendered').waitFor();
    assert.match(await page.locator('.package-rendered').innerText(),/保留完整内容/);
    assert.deepEqual(errors,[]);await page.screenshot({path:path.join(run,'first-mode.png')});console.log('无 Agent 首次创建：'+run);
  }catch(error){console.error(run,await page.locator('body').innerText());throw error;}
  finally{await dispose(app);}
});

test('external Mode archival preserves an open file draft until confirmed discard',{timeout:180000},async()=>{
  const {app,page,workspace,run,errors}=await launch();
  try{
    const second=path.join(workspace,'modes/second');await fs.mkdir(second);
    await fs.writeFile(path.join(second,'MODE.md'),'# Second\n');
    await fs.writeFile(path.join(second,'mode.yaml'),'apiVersion: asl-wep/v0.4.0\nkind: ModeProjection\nmetadata:\n  id: second\nspec:\n  skills: [source-research]\n  architecture:\n    shared: [source-research]\n    paradigms: []\n');
    await page.getByRole('button',{name:'刷新技能库',exact:true}).click();
    await page.locator('.source-tree button').filter({hasText:'Second'}).waitFor();
    await page.locator('.source-tree button').filter({hasText:'Creator Studio'}).click();
    await page.locator('.architecture-section g.node[role=button]').first().click();await page.locator('.package-rendered').waitFor();
    await page.getByRole('button',{name:'编辑',exact:true}).click();
    await page.getByRole('textbox',{name:'文件内容',exact:true}).fill('外部归档不能丢掉我的草稿');
    const {runCore}=require('../bridge.cjs'),options={executable:packagedCore()};
    const catalog=await runCore('catalog',{workspace},options),mode=catalog.modes.find(m=>m.id==='creator-studio');
    await runCore('edit',{workspace,request:{operation:'mode.archive',id:mode.id,expected:mode.fingerprint},apply:true},options);
    await page.getByText('文件已更新，未保存内容已保留。',{exact:true}).waitFor();
    assert.equal(await page.getByRole('textbox',{name:'文件内容',exact:true}).inputValue(),'外部归档不能丢掉我的草稿');
    let confirmations=0;page.removeAllListeners('dialog');page.on('dialog',()=>confirmations++);page.once('dialog',dialog=>dialog.dismiss());
    await page.getByRole('button',{name:'读取新版本',exact:true}).click();
    assert.equal(await page.getByRole('textbox',{name:'文件内容',exact:true}).count(),1);
    page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'读取新版本',exact:true}).click();
    await page.locator('.mode-library-overview').waitFor();assert.equal(await page.locator('.skill-canvas-panel').count(),0);
    assert.equal(confirmations,2,'decline and accept each require exactly one confirmation');
    assert.deepEqual(errors,[]);console.log('外部归档保护：'+run);
  }catch(error){console.error(run,errors,await page.locator('body').innerText());await page.screenshot({path:path.join(run,'archive-failure.png')});throw error;}
  finally{await dispose(app);}
});

test('genuine stale inline saves keep their draft; outside-graph retry merges, same-graph changes require discard',{timeout:240000},async()=>{
  const {app,page,file,run,errors}=await example(),input=()=>page.locator('.mermaid-label-editor [role=textbox]');
  try{
    await open(page);
    await app.evaluate(({ipcMain})=>{
      const original=ipcMain._invokeHandlers.get('asl:run');globalThis.holdOnce=true;
      ipcMain.removeHandler('asl:run');ipcMain.handle('asl:run',async(e,action,...args)=>{
        if(action==='edit'&&globalThis.holdOnce){globalThis.holdOnce=false;await new Promise(resolve=>globalThis.releaseEdit=resolve);}
        return original(e,action,...args);
      });
    });
    await page.locator('g.node[data-canvas-node="a"]').dblclick();await input().fill('用户的新名称');await input().press('Enter');
    await app.evaluate(async()=>{while(!globalThis.releaseEdit)await new Promise(r=>setTimeout(r,20));});
    await page.getByText('正在保存…',{exact:true}).waitFor();
    await fs.appendFile(file,'\n外部只改了说明。\n');await app.evaluate(()=>globalThis.releaseEdit());
    await page.waitForFunction(()=>document.querySelector('.mermaid-label-editor [role=textbox]')?.isContentEditable);
    assert.equal(await input().innerText(),'用户的新名称');assert.doesNotMatch(await fs.readFile(file,'utf8'),/用户的新名称/);
    await input().press('Enter');await input().waitFor({state:'detached'});await ready(page);
    assert.match(await fs.readFile(file,'utf8'),/用户的新名称/);assert.match(await fs.readFile(file,'utf8'),/外部只改了说明/);
    await app.evaluate(()=>{globalThis.holdOnce=true;delete globalThis.releaseEdit;});
    await page.locator('g.node[data-canvas-node="a"]').dblclick();await input().fill('第二个未保存草稿');await input().press('Enter');
    await app.evaluate(async()=>{while(!globalThis.releaseEdit)await new Promise(r=>setTimeout(r,20));});
    await fs.writeFile(file,(await fs.readFile(file,'utf8')).replace('用户的新名称','外部同图名称'));
    await app.evaluate(()=>globalThis.releaseEdit());
    await page.waitForFunction(()=>document.querySelector('.mermaid-label-editor [role=textbox]')?.isContentEditable);
    assert.equal(await input().innerText(),'第二个未保存草稿');assert.match(await fs.readFile(file,'utf8'),/外部同图名称/);
    await page.getByText('文件已更新，未保存内容已保留。',{exact:true}).waitFor();
    await page.getByRole('button',{name:'读取新版本',exact:true}).click();await ready(page);
    await page.locator('g.node[data-canvas-node="a"]').filter({hasText:'外部同图名称'}).waitFor();
    assert.equal(await input().count(),0);assert.deepEqual(errors,[]);console.log('真实指纹冲突：'+run);
  }catch(error){console.error(run,errors,await page.locator('body').innerText());await page.screenshot({path:path.join(run,'stale-inline-failure.png')});throw error;}
  finally{await dispose(app);}
});

test('a catalog read already in flight cannot replace a newly opened inline draft',{timeout:120000},async()=>{
  const {app,page,file,workspace,run,errors}=await example();
  const input=()=>page.locator('.mermaid-label-editor [role=textbox]');
  try{
    await open(page);
    await app.evaluate(({ipcMain})=>{
      const original=ipcMain._invokeHandlers.get('asl:read');
      ipcMain.removeHandler('asl:read');ipcMain.handle('asl:read',async(e,id,method,args)=>{
        const result=await original(e,id,method,args);
        if(method==='run'&&args[0]==='catalog'&&!globalThis.releaseCatalog)await new Promise(resolve=>globalThis.releaseCatalog=resolve);
        return result;
      });
      const write=ipcMain._invokeHandlers.get('asl:run');globalThis.draftWrites=0;
      ipcMain.removeHandler('asl:run');ipcMain.handle('asl:run',(e,action,...args)=>{if(action==='edit')globalThis.draftWrites++;return write(e,action,...args);});
    });
    await fs.writeFile(file,(await fs.readFile(file,'utf8')).replace('a[资料]','a[外部新名称]'));
    await app.evaluate(({BrowserWindow},workspace)=>BrowserWindow.getAllWindows().find(window=>window.isVisible()).webContents.send('asl:environment-changed',{workspace}),workspace);
    await app.evaluate(async()=>{const deadline=Date.now()+10000;while(!globalThis.releaseCatalog){if(Date.now()>deadline)throw Error('目录读取未到达受控边界');await new Promise(resolve=>setTimeout(resolve,20));}});
    await page.locator('g.node[data-canvas-node="a"]').dblclick();await input().fill('读取途中开始的草稿');
    await app.evaluate(()=>globalThis.releaseCatalog());
    await page.getByText('文件已更新，未保存内容已保留。',{exact:true}).waitFor();
    assert.equal(await input().innerText(),'读取途中开始的草稿');
    page.removeAllListeners('dialog');page.once('dialog',dialog=>dialog.dismiss());
    await page.getByRole('button',{name:'读取新版本',exact:true}).click();
    assert.equal(await input().innerText(),'读取途中开始的草稿');
    assert.equal(await app.evaluate(()=>globalThis.draftWrites),0,'取消放弃不触发离焦保存');
    page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'读取新版本',exact:true}).click();await ready(page);
    await page.locator('g.node[data-canvas-node="a"]').filter({hasText:'外部新名称'}).waitFor();
    assert.equal(await input().count(),0);assert.equal(await app.evaluate(()=>globalThis.draftWrites),0);assert.deepEqual(errors,[]);console.log('在途读取保护：'+run);
  }catch(error){console.error(run,errors,await page.locator('body').innerText());await page.screenshot({path:path.join(run,'inflight-draft-failure.png')});throw error;}
  finally{await dispose(app);}
});

test('partial Skill adoption is disclosed and explicit retry reuses the complete package',{timeout:240000},async()=>{
  const {app,page,workspace,run,errors}=await launch(),source=path.join(run,'home/.codex/skills/retry-extra'),file=path.join(workspace,'modes/creator-studio/MODE.md');
  try{
    await fs.mkdir(source,{recursive:true});await fs.writeFile(path.join(source,'SKILL.md'),'---\nname: retry-extra\ndescription: 重试测试\n---\n# 完整重试技能\n');await fs.writeFile(path.join(source,'notes.md'),'完整资料\n');
    await app.evaluate(({ipcMain,dialog},file)=>{
      dialog.showMessageBox=async()=>({response:1});const original=ipcMain._invokeHandlers.get('asl:run');globalThis.adoptionCount=0;globalThis.conflictOnce=true;
      ipcMain.removeHandler('asl:run');ipcMain.handle('asl:run',async(e,action,...args)=>{
        const values=args[0];
        if(action==='edit'&&values.apply&&values.request.operation==='skill.import')globalThis.adoptionCount++;
        if(action==='edit'&&values.request.operation==='mode.save'&&globalThis.conflictOnce){globalThis.conflictOnce=false;await process.getBuiltinModule('node:fs/promises').appendFile(file,'\n外部说明保留。\n');}
        return original(e,action,...args);
      });
    },file);
    await page.reload();await page.locator('.mode-library-overview').waitFor();
    await page.locator('.source-tree button').filter({hasText:'Creator Studio'}).click();await page.getByRole('tab',{name:'通用能力',exact:true}).click();
    const add=async()=>{await page.locator('.mermaid-viewport').click({button:'right',position:{x:12,y:12}});await page.getByRole('menuitem',{name:'添加技能',exact:true}).click();await page.getByRole('menuitem',{name:'完整重试技能',exact:true}).click();};
    await add();await page.getByText('技能已保存到库，尚未加入此模式。读取新版后可再次添加。',{exact:true}).waitFor();
    assert.deepEqual((await fs.readdir(path.join(workspace,'skills/retry-extra'))).sort(),['SKILL.md','SOURCE.md','notes.md']);
    await page.getByRole('button',{name:'读取模式后重试',exact:true}).click();await ready(page);await add();await ready(page);
    await page.locator('g.node[data-canvas-node="skill_retry_extra"]').waitFor();
    assert.equal(await app.evaluate(()=>globalThis.adoptionCount),1);assert.match(await fs.readFile(file,'utf8'),/外部说明保留/);
    assert.deepEqual(errors,[]);console.log('部分保存回执：'+run);
  }finally{await dispose(app);}
});

test('a linked Chinese README lands on its section and Back stays in the repository reader',{timeout:120000},async()=>{
  const {app,page,run,errors}=await launch({empty:true}),url='https://github.com/qa/anchor-reader';
  try{
    await app.evaluate(({ipcMain},url)=>{
      ipcMain.removeHandler('asl:github-skills');ipcMain.handle('asl:github-skills',()=>({ok:true,value:{repository:url,snapshot:'/qa-anchor',commit:'one',skills:[],modes:[],readme:{text:'# 示例仓库\n\n[中文安装说明](README.zh-CN.md#安装)',url:url+'/blob/main/README.md'}}}));
      ipcMain.removeHandler('asl:connect-repository');ipcMain.handle('asl:connect-repository',()=>({ok:true,value:[url]}));
      ipcMain.removeHandler('asl:repository-overview');ipcMain.handle('asl:repository-overview',()=>({ok:true,value:null}));
      ipcMain.removeHandler('asl:repository-document');ipcMain.handle('asl:repository-document',(_,snapshot,file)=>{
        if(file!=='README.zh-CN.md')return {ok:false,error:'文件名含错误章节参数'};
        return {ok:true,value:{text:'# 中文文档\n\n'+Array(60).fill('背景材料。\n\n').join('')+'## 安装\n\n目标章节。',url:url+'/blob/main/README.zh-CN.md'}};
      });
    },url);
    await page.getByRole('button',{name:'发现',exact:true}).first().click();
    await page.getByRole('textbox',{name:'GitHub 仓库地址',exact:true}).fill(url);
    await page.getByRole('button',{name:'读取仓库',exact:true}).click();
    await page.getByRole('link',{name:'中文安装说明',exact:true}).click();await page.getByRole('heading',{name:'安装',exact:true}).waitFor();
    const y=(await page.getByRole('heading',{name:'安装',exact:true}).boundingBox()).y;
    assert.ok(y>0&&y<await page.evaluate(()=>innerHeight),'目标章节必须真正在屏幕内');
    await page.screenshot({path:path.join(run,'readme-anchor.png')});
    await page.getByRole('button',{name:'返回文档',exact:true}).click();await page.getByRole('heading',{name:'示例仓库',exact:true}).waitFor();
    assert.deepEqual(errors,[]);console.log('章节定位：'+run);
  }finally{await dispose(app);}
});

test('normal native close asks about unsaved input, cancellation stays and discard closes',{timeout:120000},async()=>{
  const {app,page,run}=await launch();
  try{
    await page.locator('.source-tree button').filter({hasText:'Creator Studio'}).first().click();
    await page.getByRole('button',{name:'编辑模式',exact:true}).click();await page.getByRole('textbox',{name:'模式名称',exact:true}).fill('未保存名称');
    page.removeAllListeners('dialog');
    await app.evaluate(({dialog,BrowserWindow})=>{
      globalThis.closePrompt={choice:0,questions:[]};dialog.showMessageBoxSync=(_,options)=>{globalThis.closePrompt.questions.push(options);return globalThis.closePrompt.choice;};
      BrowserWindow.getAllWindows()[0].close();
    });
    await page.waitForTimeout(300);
    assert.equal(await page.getByRole('textbox',{name:'模式名称',exact:true}).inputValue(),'未保存名称');
    const prompts=await app.evaluate(()=>globalThis.closePrompt.questions);
    assert.equal(prompts.length,1);assert.deepEqual(prompts[0].buttons,['继续编辑','放弃并关闭']);
    const closed=page.waitForEvent('close');
    await app.evaluate(({BrowserWindow})=>{globalThis.closePrompt.choice=1;setTimeout(()=>BrowserWindow.getAllWindows()[0].close(),0);});
    await closed;console.log('原生关窗：'+run);
  }finally{await dispose(app);}
});
