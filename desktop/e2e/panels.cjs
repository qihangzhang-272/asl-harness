const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs/promises');
const {launch,dispose}=require('./fixture.cjs');

test('all navigation rails resize, retain preferences, cancel safely and leave readable content',{timeout:120000},async()=>{
  const {app,page,run,workspace,errors}=await launch();
  async function resize(label,delta){
    const handle=page.getByRole('separator',{name:label,exact:true});
    await handle.hover();
    const start=await handle.boundingBox();assert.ok(start,`${label} 应当可操作`);
    const before=Number(await handle.getAttribute('aria-valuenow'));
    await page.mouse.move(start.x+start.width/2,start.y+start.height/2);
    await page.mouse.down();await page.mouse.move(start.x+start.width/2+delta,start.y+start.height/2,{steps:8});await page.mouse.up();
    const after=Number(await handle.getAttribute('aria-valuenow'));
    assert.ok(Math.abs(after-before-delta)<3,`${label}: ${before} → ${after}，预期差 ${delta}`);
    return after;
  }
  try{
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.isVisible()).setSize(1400,950));
    const nav=await resize('调整导航栏宽度',60);
    await page.getByRole('button',{name:'全部技能',exact:true}).first().click();
    await resize('调整技能导览宽度',50);
    const guide=page.locator('.skill-library-tree');
    const countStyles=await guide.locator('small').first().evaluate(el=>({font:getComputedStyle(el).fontVariantNumeric,align:getComputedStyle(el).textAlign}));
    assert.match(countStyles.font,/tabular-nums/);assert.equal(countStyles.align,'right');
    const guideWidth=(await guide.boundingBox()).width;
    await guide.locator('button span').first().evaluate(el=>{el.textContent='很长的技能导览名称用于验证文字不会把数量挤出侧栏'.repeat(3);});
    assert.ok(await guide.locator('button').first().evaluate(el=>el.querySelector('span').getBoundingClientRect().right<=el.querySelector('small').getBoundingClientRect().left),'长名称不能挤占数量列');
    await page.screenshot({path:path.join(run,'guide-wide.png')});
    const directory=path.join(workspace,'skills/product-analysis/references');
    await fs.mkdir(directory,{recursive:true});
    await Promise.all(Array.from({length:35},(_,i)=>fs.writeFile(path.join(directory,`布局验收-${i}-较长的资料文件名称.md`),'# 测试资料\n')));
    await page.locator('.skill-table-row').first().click();
    await page.locator('.skill-canvas-panel .package-rendered').waitFor();
    await resize('调整技能文件目录宽度',40);
    const fileWidth=Number(await page.getByRole('separator',{name:'调整技能文件目录宽度'}).getAttribute('aria-valuenow'));
    const scrollTarget=await page.locator('.package-tree').evaluate(element=>{const box=element.getBoundingClientRect(),hit=document.elementFromPoint(box.x+32,box.y+80);return {box:box.toJSON(),inside:element.contains(hit),viewport:{width:innerWidth,height:innerHeight},height:element.clientHeight,contentHeight:element.scrollHeight};});
    assert.ok(scrollTarget.inside,'滚轮落点必须在文件目录的可见区域：'+JSON.stringify(scrollTarget));
    assert.ok(scrollTarget.contentHeight>scrollTarget.height,'测试目录必须具有可滚动内容：'+JSON.stringify(scrollTarget));
    await page.evaluate(()=>{window.__panelWheel=[];document.addEventListener('wheel',event=>{const tree=document.querySelector('.package-tree'),box=tree.getBoundingClientRect();window.__panelWheel.push({inside:tree.contains(event.target),target:event.target.outerHTML.slice(0,250),x:event.clientX,y:event.clientY,deltaY:event.deltaY,box:box.toJSON(),height:tree.clientHeight,contentHeight:tree.scrollHeight,top:tree.scrollTop,outerTop:document.querySelector('.content').scrollTop});},{capture:true,once:true});});
    await page.locator('.package-tree').hover({position:{x:32,y:80}});await page.mouse.wheel(0,1200);
    await page.waitForFunction(()=>document.querySelector('.package-tree').scrollTop>0);
    const handle=page.getByRole('separator',{name:'调整技能文件目录宽度'});
    const box=await handle.boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+40);await page.mouse.down();await page.mouse.move(box.x+30,box.y+40);
    await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();
    assert.equal(Number(await handle.getAttribute('aria-valuenow')),fileWidth,'失焦取消未完成的拖动');
    assert.equal(await page.locator('[data-resizing]').count(),0);
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.isVisible()).setSize(920,800));
    await page.waitForFunction(()=>document.querySelector('.package-document').getBoundingClientRect().width>=280);
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.isVisible()).setSize(1400,950));
    await page.waitForFunction(width=>Number(document.querySelector('[aria-label="调整技能文件目录宽度"]').getAttribute('aria-valuenow'))===width,fileWidth);
    await page.reload();await page.locator('.skill-library').waitFor();
    assert.equal(Number(await page.getByRole('separator',{name:'调整导航栏宽度'}).getAttribute('aria-valuenow')),nav);
    await page.locator('.skill-canvas-panel .package-rendered').waitFor();
    assert.equal(await page.locator('.skill-table-row').count(),0,'重开应恢复当前技能阅读，而不是退回列表');
    assert.equal(Number(await page.getByRole('separator',{name:'调整技能文件目录宽度'}).getAttribute('aria-valuenow')),fileWidth);
    await page.getByRole('button',{name:'关闭',exact:true}).last().click();
    assert.ok(Math.abs((await guide.boundingBox()).width-guideWidth)<2);
    await page.locator('.source-tree button').filter({hasText:'Creator Studio'}).first().click();
    await page.locator('.architecture-section g.node[role=button]').first().click();
    await page.locator('.skill-canvas-panel .package-rendered').waitFor();
    assert.equal(Number(await handle.getAttribute('aria-valuenow')),fileWidth,'同一文件目录在画板浮层中沿用宽度');
    await resize('调整技能文件目录宽度',-30);
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.isVisible()).setSize(920,800));
    await page.getByRole('separator',{name:'调整技能文件目录宽度'}).hover();
    await page.screenshot({path:path.join(run,'skill-narrow.png')});
    assert.ok(await page.locator('.skill-canvas-panel .package-document').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'窄窗口正文与操作不能横向溢出');
    await page.locator('.skill-canvas-panel .package-document>header').getByRole('button',{name:'编辑',exact:true}).click({trial:true,timeout:3000});
    await page.locator('.skill-canvas-panel .package-rendered').hover();await page.mouse.wheel(0,1200);
    await page.waitForFunction(()=>document.querySelector('.skill-canvas-panel .package-rendered').scrollTop>0);
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.isVisible()).setSize(1400,950));
    await page.getByRole('button',{name:'技能逻辑架构',exact:true}).click();
    await page.getByRole('button',{name:'编辑模式',exact:true}).click();
    await page.locator('.graph-pane-skills').waitFor();
    await resize('调整模式技能栏宽度',50);
    await page.getByRole('separator',{name:'调整模式技能栏宽度'}).dblclick();
    assert.equal(Number(await page.getByRole('separator',{name:'调整模式技能栏宽度'}).getAttribute('aria-valuenow')),240);
    assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(run,'panels-wide.png')});
    console.log(JSON.stringify({evidence:run}));
  }catch(error){console.error(run,error.stack);console.error('目录滚动事实：',await page.evaluate(()=>({events:window.__panelWheel,trees:[...document.querySelectorAll('.package-tree')].map(el=>({box:el.getBoundingClientRect().toJSON(),height:el.clientHeight,contentHeight:el.scrollHeight,top:el.scrollTop,overflow:getComputedStyle(el).overflow})),outerTop:document.querySelector('.content')?.scrollTop})).catch(()=>null));await page.screenshot({path:path.join(run,'panels-failure.png'),timeout:10000}).catch(capture=>console.error('截图未完成：'+capture.message));await fs.writeFile(path.join(run,'panels-failure.html'),await page.locator('body').innerHTML({timeout:10000}).catch(()=>''));throw error;}
  finally{await dispose(app);}
});

test('a pending external Skill reread keeps the document and scrollable directory visible',{timeout:120000},async()=>{
  const {app,page,run,workspace,errors}=await launch();
  try{
    const directory=path.join(workspace,'skills/product-analysis/references');
    await fs.mkdir(directory,{recursive:true});
    await Promise.all(Array.from({length:35},(_,i)=>fs.writeFile(path.join(directory,`连续阅读-${i}.md`),'# 资料\n')));
    await page.getByRole('button',{name:'全部技能',exact:true}).first().click();
    await page.locator('.skill-table-row').filter({has:page.locator('[title="product-analysis"]')}).click();
    await page.locator('.package-tree button[title^="references/连续阅读-"]').last().waitFor();
    const before=await page.locator('.package-rendered').innerText();
    await app.evaluate(({ipcMain})=>{
      const original=ipcMain._invokeHandlers.get('asl:run');
      ipcMain.removeHandler('asl:run');ipcMain.handle('asl:run',async(event,action,...args)=>{
        if(action==='files'&&!globalThis.releaseReread)await new Promise(resolve=>globalThis.releaseReread=resolve);
        return original(event,action,...args);
      });
    });
    await fs.appendFile(path.join(workspace,'skills/product-analysis/SKILL.md'),'\n外部更新后的阅读内容。\n');
    await page.waitForFunction(()=>document.querySelector('[aria-label="重新读取文件"]')?.disabled);
    assert.equal(await page.locator('.package-tree button[title^="references/连续阅读-"]').count(),35,'同一文件更新时目录不能被清空');
    assert.equal(await page.locator('.package-rendered').innerText(),before,'后台读取期间保留最后有效内容');
    await page.locator('.package-tree').hover({position:{x:32,y:80}});await page.mouse.wheel(0,1200);
    await page.waitForFunction(()=>document.querySelector('.package-tree').scrollTop>0);
    await app.evaluate(()=>globalThis.releaseReread());
    await page.getByText('外部更新后的阅读内容。',{exact:true}).waitFor();
    assert.deepEqual(errors,[]);console.log('连续阅读：'+run);
  }finally{await app.evaluate(()=>globalThis.releaseReread?.()).catch(()=>{});await dispose(app);}
});

test('a visible Mode remains navigable while refresh is still remembering the library',{timeout:120000},async()=>{
  const {app,page,run,workspace,errors}=await launch();
  try{
    const second=path.join(workspace,'modes/second');await fs.mkdir(second);
    await fs.writeFile(path.join(second,'MODE.md'),'# Second\n');
    await fs.writeFile(path.join(second,'mode.yaml'),'apiVersion: asl-wep/v0.4.0\nkind: ModeProjection\nmetadata:\n  id: second\nspec:\n  skills: [source-research]\n  architecture:\n    shared: [source-research]\n    paradigms: []\n');
    await app.evaluate(({ipcMain})=>{
      const original=ipcMain._invokeHandlers.get('asl:remember');
      ipcMain.removeHandler('asl:remember');ipcMain.handle('asl:remember',async(event,...args)=>{
        if(!globalThis.releaseRemember)await new Promise(resolve=>globalThis.releaseRemember=resolve);
        return original(event,...args);
      });
    });
    await page.getByRole('button',{name:'刷新技能库',exact:true}).click();
    await page.locator('.source-tree button').filter({hasText:'Second'}).waitFor();
    await page.locator('.source-tree button').filter({hasText:'Creator Studio'}).click();
    await page.locator('.mode-page').getByRole('heading',{name:'Creator Studio',exact:true,level:1}).waitFor({timeout:1500});
    await app.evaluate(()=>globalThis.releaseRemember());
    await page.locator('.architecture-section g.node[role=button]').first().waitFor();
    assert.deepEqual(errors,[]);console.log('读取期间导航：'+run);
  }finally{await app.evaluate(()=>globalThis.releaseRemember?.()).catch(()=>{});await dispose(app);}
});
