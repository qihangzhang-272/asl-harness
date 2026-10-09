const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {launch}=require('./fixture.cjs');

async function context(app,label){
  await app.evaluate(({Menu},label)=>{
    Menu.buildFromTemplate=items=>({popup:options=>{
      const item=items.find(item=>item.label===label);
      if(!item?.enabled&&item?.enabled!==undefined)throw new Error('菜单项不可用：'+label);
      if(!item)throw new Error('缺少菜单项：'+label);
      item.click();options.callback();
    }});
  },label);
}

test('55 connections stay recorded, overflow folds and removal only forgets the selected source',{timeout:120000},async()=>{
  let {app,page,run,workspace,errors}=await launch();
  const urls=Array.from({length:55},(_,i)=>`https://github.com/qa/record-${i+1}`);
  const preferences=path.join(run,'home/app/libraries.json');
  try{
    await app.evaluate(({ipcMain})=>{
      ipcMain.removeHandler('asl:github-skills');
      ipcMain.handle('asl:github-skills',(_,url)=>({ok:true,value:{repository:url,snapshot:'/record',commit:'one',modes:[],skills:[],readme:{text:'# 已记录仓库',url:url+'/blob/main/README.md'}}}));
      ipcMain.removeHandler('asl:repository-overview');ipcMain.handle('asl:repository-overview',()=>({ok:true,value:null}));
    });
    const state=JSON.parse(await fs.readFile(preferences,'utf8'));state.repositories=urls;
    await fs.writeFile(preferences,JSON.stringify(state));
    await page.reload();await page.locator('.mode-library-overview').waitFor();
    assert.equal(await page.locator('.cloud-source:visible').count(),49,'本地库与云端合计最多直接显示50条');
    assert.equal(await page.locator('.source-overflow summary small').innerText(),'6');
    assert.equal((await page.evaluate(async()=>window.asl.initial())).value.repositories.length,55);
    await page.locator('.source-overflow>summary').click();
    await page.locator('.cloud-source>.source-heading').filter({hasText:'record-55'}).click();
    await page.getByRole('heading',{name:'已记录仓库',exact:true}).waitFor();
    await context(app,'移除连接');
    await page.locator('.cloud-source>.source-heading').filter({hasText:'record-55'}).click({button:'right'});
    await page.waitForFunction(()=>!document.querySelector('.cloud-source button[title$="record-55"]'));
    assert.deepEqual(JSON.parse(await fs.readFile(preferences,'utf8')).repositories,urls.slice(0,54));
    assert.ok(await fs.stat(path.join(workspace,'skills/product-analysis/SKILL.md')));
    assert.deepEqual(errors,[]);
    await page.close();await app.close();
    ({app,page,errors}=await launch({resume:run}));
    assert.equal((await page.evaluate(async()=>window.asl.initial())).value.repositories.length,54,'完整重启仍保留所有未移除记录');
    assert.deepEqual(errors,[]);
    console.log('连接容量验收：'+run);
  }finally{await page.close();await app.close();}
});

test('MCP drafts confirm once on all leaving actions, while repeat visits share a valid read',{timeout:120000},async()=>{
  const {app,page,run,workspace,errors}=await launch();
  try{
    await app.evaluate(({ipcMain},project)=>{
      globalThis.mcpProbe={reads:0,fail:false,writes:0};
      const native={projects:[project],hosts:[{id:'codex-app',name:'Codex',scopes:['user','project'],configured:true}],connections:[],mcpSources:[]};
      const read=ipcMain._invokeHandlers.get('asl:read');ipcMain.removeHandler('asl:read');
      ipcMain.handle('asl:read',(e,id,method,args)=>method==='native'?{ok:true,value:native}:read(e,id,method,args));
      ipcMain.removeHandler('asl:mcp');ipcMain.handle('asl:mcp',()=>{
        globalThis.mcpProbe.reads++;
        return globalThis.mcpProbe.fail?{ok:false,error:'测试读取暂不可用'}:{ok:true,value:{sources:['user','project'].map(scope=>({scope,file:'/qa/'+scope,servers:[],fingerprint:'one',canToggle:true})),notice:''}};
      });
      ipcMain.removeHandler('asl:mcp-save');ipcMain.handle('asl:mcp-save',()=>{globalThis.mcpProbe.writes++;return {ok:true,value:{}};});
    },workspace);
    await page.reload();await page.locator('.mode-library-overview').waitFor();
    const open=async()=>{await page.getByRole('button',{name:'Agent 配置',exact:true}).first().click();await page.getByRole('button',{name:'管理 MCP',exact:true}).click();await page.getByRole('button',{name:'添加 MCP',exact:true}).waitFor();};
    await open();
    await page.getByRole('button',{name:'添加 MCP',exact:true}).click();
    page.removeAllListeners('dialog');let confirmations=0,discard=false;
    page.on('dialog',async dialog=>{confirmations++;await (discard?dialog.accept():dialog.dismiss());});
    await page.getByRole('button',{name:'关闭 MCP 编辑',exact:true}).click();assert.equal(confirmations,0);
    await page.getByRole('button',{name:'添加 MCP',exact:true}).click();
    await page.locator('.mcp-editor input').first().fill('unsaved');
    for(const action of [
      ()=>page.getByRole('button',{name:'关闭 MCP 编辑',exact:true}).click(),
      ()=>page.getByRole('button',{name:'重新读取',exact:true}).click(),
      ()=>page.getByRole('button',{name:'全部技能',exact:true}).first().click(),
      ()=>page.locator('.mcp-panel .text-button').click(),
      ()=>page.getByRole('combobox',{name:'已发现的 MCP 项目',exact:true}).selectOption(workspace),
    ]){const before=confirmations;await action();assert.equal(confirmations,before+1,'每次离开仅确认一次');assert.equal(await page.locator('.mcp-editor input').first().inputValue(),'unsaved');}
    assert.equal(await app.evaluate(()=>globalThis.mcpProbe.writes),0);
    discard=true;await page.locator('.mcp-panel .text-button').click();
    await page.getByRole('button',{name:'管理 MCP',exact:true}).click();await page.getByRole('button',{name:'添加 MCP',exact:true}).waitFor();
    assert.equal(await app.evaluate(()=>globalThis.mcpProbe.reads),1,'返回同一范围不再重复读取');
    await app.evaluate(()=>{globalThis.mcpProbe.fail=true;});
    await page.getByRole('button',{name:'重新读取',exact:true}).click();
    await page.getByText('测试读取暂不可用',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'添加 MCP',exact:true}).count(),1,'刷新失败保留有效快照');
    assert.deepEqual(errors,[]);console.log('MCP 离页与缓存验收：'+run);
  }catch(e){console.error('MCP 验收失败：'+run,await page.locator('body').innerText());throw e;}
  finally{await page.close();await app.close();}
});

test('native Agent entry protects unsent goals and does not require editing or copying a prompt',{timeout:120000},async()=>{
  const {app,page,run,errors}=await launch();
  try{
    await app.evaluate(({ipcMain})=>{
      globalThis.organizeProbe={fail:true,calls:[]};
      ipcMain.removeHandler('asl:assistants');ipcMain.handle('asl:assistants',()=>({ok:true,value:[{id:'codex-app',name:'Codex CLI',available:true}]}));
      // The native model process is the test boundary; no model task is launched.
      ipcMain.removeHandler('asl:organize');ipcMain.handle('asl:organize',(_,id,values)=>{
        globalThis.organizeProbe.calls.push({id,values});
        return globalThis.organizeProbe.fail?{ok:false,error:'测试会话未打开'}:{ok:true,value:{id:'test-session',status:'opened'}};
      });
    });
    const open=async()=>{await page.locator('.source-tree button').filter({hasText:'Creator Studio'}).click();await page.getByRole('button',{name:'交给 AI 整理',exact:true}).first().click();await page.getByRole('button',{name:'在 Codex 中继续',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.guide-agents button').disabled);};
    await open();page.removeAllListeners('dialog');let confirmations=0,discard=false;
    page.on('dialog',async dialog=>{confirmations++;await(discard?dialog.accept():dialog.dismiss());});
    assert.equal(await page.getByRole('textbox',{name:'完整整理提示词',exact:true}).count(),0);
    assert.equal(await page.getByRole('button',{name:'复制提示词',exact:true}).count(),0);
    await page.locator('.editor-page-heading').getByRole('button',{name:'返回',exact:true}).click();assert.equal(confirmations,0);
    await open();
    const goal=page.getByRole('textbox',{name:'想怎么整理',exact:true});await goal.fill('整理技能关系，不修改技能内容');
    await page.locator('.editor-page-heading').getByRole('button',{name:'返回',exact:true}).click();assert.equal(confirmations,1);assert.equal(await goal.inputValue(),'整理技能关系，不修改技能内容');
    await page.getByRole('button',{name:'在 Codex 中继续',exact:true}).click();await page.getByRole('alert').filter({hasText:'未能打开 Agent，目标已保留。'}).waitFor();
    assert.equal(await page.getByText('测试会话未打开',{exact:false}).isVisible(),false,'原始诊断默认折叠');
    await page.getByText('查看详情',{exact:true}).click();await page.getByText('测试会话未打开',{exact:false}).waitFor();
    assert.equal(await goal.inputValue(),'整理技能关系，不修改技能内容','启动失败保留未发送目标');
    await app.evaluate(()=>{globalThis.organizeProbe.fail=false;});
    await page.getByRole('button',{name:'重试',exact:true}).click();await page.getByText('已在 Codex 打开，可直接对话。',{exact:true}).waitFor();
    const calls=await app.evaluate(()=>globalThis.organizeProbe.calls);assert.equal(calls.length,2);assert.equal(calls[1].values.mode,'creator-studio');assert.equal(calls[1].values.goal,'整理技能关系，不修改技能内容');
    assert.equal(await page.getByText('整理已完成',{exact:true}).count(),0,'打开会话不能冒充完成');
    await page.screenshot({path:path.join(run,'guide-consistency.png')});
    await page.locator('.editor-page-heading').getByRole('button',{name:'返回',exact:true}).click();assert.equal(confirmations,1,'已交给 Agent 的目标不再视为未发送');
    await open();
    await goal.fill('稍后整理');await goal.fill('');
    await page.locator('.editor-page-heading').getByRole('button',{name:'返回',exact:true}).click();assert.equal(confirmations,1,'清空目标后不再提示放弃');
    assert.deepEqual(errors,[]);console.log('整理页验收：'+run);
  }catch(e){console.error('整理页验收失败：'+run,await page.locator('body').innerText());throw e;}
  finally{await page.close();await app.close();}
});

test('no installed Agent leaves CLI discovery and Mode reading available',{timeout:120000},async()=>{
  const {app,page,run,errors}=await launch();
  try{
    await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('asl:assistants');ipcMain.handle('asl:assistants',()=>({ok:true,value:[]}));});
    await page.locator('.source-tree button').filter({hasText:'Creator Studio'}).click();
    await page.getByRole('button',{name:'交给 AI 整理',exact:true}).first().click();
    await page.getByText('未发现可启动的 Agent',{exact:true}).waitFor();
    assert.equal(await page.locator('.guide-agents button').count(),0);
    await page.locator('.guide-cli summary').click();assert.match(await page.locator('.guide-cli code').innerText(),/cli.describe/);
    await page.locator('.editor-page-heading').getByRole('button',{name:'返回',exact:true}).click();
    await page.locator('.mode-page h1').filter({hasText:'Creator Studio'}).waitFor();
    assert.deepEqual(errors,[]);console.log('无 Agent 整理入口验收：'+run);
  }finally{await page.close();await app.close();}
});

test('right-click creates a peer Mode and an independent valid library without changing source Skills',{timeout:180000},async()=>{
  const {app,page,run,workspace,errors}=await launch();
  const sourceFile=path.join(workspace,'skills/product-analysis/SKILL.md'),before=await fs.readFile(sourceFile);
  const originalModes=(await fs.readdir(path.join(workspace,'modes'))).length;
  try{
    await context(app,'新建同级模式');
    await page.locator('.source-tree button').filter({hasText:'Creator Studio'}).click({button:'right'});
    await page.getByRole('textbox',{name:'模式名称',exact:true}).fill('同级测试');
    await page.locator('.graph-pane-skills').getByRole('button',{name:'加入 Product analysis',exact:true}).click();
    await page.getByRole('button',{name:'保存',exact:true}).click();await page.locator('.editor-page').waitFor({state:'detached',timeout:60000});
    const directories=await fs.readdir(path.join(workspace,'modes'));assert.equal(directories.length,originalModes+1);assert.ok(directories.some(id=>id.startsWith('mode-')));
    assert.deepEqual(await fs.readFile(sourceFile),before);
    await context(app,'新建工作库');
    await page.locator('.source-tree>details>summary').first().click({button:'right'});
    await page.getByRole('heading',{name:'新建工作库',exact:true}).waitFor();
    await page.locator('.editor-page select[name=mode]').selectOption('creator-studio');
    const target=path.join(run,'new-library');
    await app.evaluate(({dialog},target)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:target});dialog.showMessageBox=async()=>({response:1});},target);
    await page.getByRole('button',{name:'选择位置并创建',exact:true}).click();
    await page.locator('.editor-page').waitFor({state:'detached',timeout:60000});
    await page.locator('.mode-page h1').filter({hasText:'Creator Studio'}).waitFor();
    assert.equal((await page.evaluate(()=>window.asl.initial())).value.workspace,target);
    assert.ok(await fs.stat(path.join(target,'modes/creator-studio/mode.yaml')));
    assert.deepEqual(await fs.readFile(path.join(target,'skills/product-analysis/SKILL.md')),before);
    assert.deepEqual(await fs.readFile(sourceFile),before,'源技能从未改写');
    assert.equal(await page.locator('.mode-page h1').innerText(),'Creator Studio');
    assert.deepEqual(errors,[]);console.log('层级右键验收：'+run);
  }catch(e){console.error(run,await page.locator('body').innerText());throw e;}
  finally{await page.close();await app.close();}
});

test('local categories and file reading positions survive navigation and narrow tables remain legible',{timeout:120000},async()=>{
  const {app,page,workspace,run,errors}=await launch();
  try{
    const directory=path.join(workspace,'skills/product-analysis/references');await fs.mkdir(directory,{recursive:true});
    await fs.writeFile(path.join(directory,'reading.md'),'# 阅读位置\n\n'+Array.from({length:90},(_,i)=>`第${i}段测试内容。\n\n`).join(''));
    await page.getByRole('button',{name:'全部技能',exact:true}).first().click();
    const category=page.locator('.skill-library-tree button').filter({hasText:'产品分析示例'});await category.click();
    await page.getByRole('button',{name:'来源与更新',exact:true}).first().click();
    await page.getByRole('button',{name:'全部技能',exact:true}).first().click();assert.match(await page.locator('.skill-library-tree button.active').innerText(),/产品分析示例/);
    await page.getByRole('textbox',{name:'搜索技能',exact:true}).fill('Product');
    assert.equal(await page.locator('.skill-library-content .architecture-section').count(),0,'搜索时不重复整张分类图');
    await page.locator('.skill-table-row').first().click();await page.locator('.package-rendered').waitFor();
    await page.locator('.package-tree button[title="references/reading.md"]').click();await page.getByRole('heading',{name:'阅读位置',exact:true}).waitFor();
    await page.locator('.package-rendered').hover();await page.mouse.wheel(0,1100);await page.waitForFunction(()=>document.querySelector('.package-rendered').scrollTop>500);
    const scroll=await page.locator('.package-rendered').evaluate(e=>e.scrollTop);
    await page.locator('.skill-canvas-panel').getByRole('button',{name:'关闭',exact:true}).click();
    const recorded=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith('asl.view.scroll.file:'))));
    await page.locator('.skill-table-row').first().click();await page.getByRole('heading',{name:'阅读位置',exact:true}).waitFor();
    const restored=await page.locator('.package-rendered').evaluate(e=>e.scrollTop);
    assert.ok(Math.abs(restored-scroll)<3,JSON.stringify({scroll,restored,recorded}));
    await page.locator('.skill-canvas-panel').getByRole('button',{name:'关闭',exact:true}).click();
    await page.locator('.skill-library-tree button').filter({hasText:'全部能力'}).click();
    await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.isVisible());w.setSize(920,800);w.webContents.setZoomFactor(1.25);});
    await page.waitForFunction(()=>innerWidth<740&&document.querySelector('.skill-table-row').getBoundingClientRect().right<=innerWidth);
    assert.ok(await page.locator('.skill-table-row').first().evaluate(el=>{const name=el.querySelector('.skill-table-name').getBoundingClientRect(),next=el.children[1].getBoundingClientRect();return name.right<=next.left+1||name.bottom<=next.top+1;}),'125%缩放名称不能与用途文字重叠');
    assert.ok(await page.locator('.skill-table-row').first().evaluate(el=>{const columns=getComputedStyle(el).gridTemplateColumns.split(' ').map(parseFloat);return columns[0]>el.clientWidth*.5&&el.children[2].getBoundingClientRect().width>0;}),'窄表格不能被旧窗口断点覆盖为三列并隐藏数量');
    assert.ok(await page.locator('.page-heading button').evaluateAll(buttons=>buttons.every(e=>e.getBoundingClientRect().right<=innerWidth+1)),'缩放后操作仍在窗口内');
    // Electron capturePage includes the full zoomed compositor surface.
    const screenshot=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.isVisible());return (await w.capturePage()).toPNG().toString('base64');});
    await fs.writeFile(path.join(run,'table-125-percent.png'),Buffer.from(screenshot,'base64'));
    assert.deepEqual(errors,[]);console.log('阅读与窄屏验收：'+run);
  }finally{await page.close();await app.close();}
});

test('cloud translation, filtering and retry remain inside the selected repository',{timeout:120000},async()=>{
  const {app,page,run,errors}=await launch(),url='https://github.com/qa/reading';
  try{
    await app.evaluate(({ipcMain},url)=>{
      globalThis.cloudProbe={reads:0};
      const text='# 仓库说明\n\n[中文](README.zh-CN.md)\n\n'+Array(60).fill('长正文用于检查阅读位置。\n\n').join('');
      ipcMain.removeHandler('asl:github-skills');ipcMain.handle('asl:github-skills',()=>({ok:true,value:{repository:url,snapshot:'/qa-reading',commit:'one',modes:[],readme:{text,url:url+'/blob/main/README.md'},skills:[{id:'reading',title:'阅读测试技能',description:'这只是简介',repositoryPath:'skills/reading',source:'/qa-reading/skills/reading',origin:url+'/tree/main/skills/reading'}]}}));
      ipcMain.removeHandler('asl:repository-document');ipcMain.handle('asl:repository-document',()=>({ok:true,value:{text:'# 中文说明\n\n'+Array(60).fill('这是可继续阅读的中文正文。\n\n').join(''),url:url+'/blob/main/README.zh-CN.md'}}));
      ipcMain.removeHandler('asl:source-document');ipcMain.handle('asl:source-document',()=>++globalThis.cloudProbe.reads===1?{ok:false,error:'技能暂不可读取'}:{ok:true,value:'# 完整技能原文\n\n重试之后的原文。'});
    },url);
    // Fixture records use the same queue as startup view writes; an external file
    // overwrite while the App is live can race and erase the test's own record.
    await app.evaluate(async({app},url)=>{
      const path=process.getBuiltinModule('node:path'),require=process.getBuiltinModule('node:module').createRequire(path.join(app.getAppPath(),'package.json'));
      await require('./library.cjs').updatePreferences(path.join(app.getPath('userData'),'libraries.json'),state=>({...state,repositories:[url]}));
    },url);
    await page.reload();await page.locator('.mode-library-overview').waitFor();await page.locator('.cloud-source>.source-heading').click();
    await page.getByRole('link',{name:'中文',exact:true}).click();await page.getByRole('heading',{name:'中文说明',exact:true}).waitFor();
    await page.locator('.content').hover();await page.mouse.wheel(0,850);await page.waitForFunction(()=>document.querySelector('.content').scrollTop>500);
    const position=await page.locator('.content').evaluate(el=>el.scrollTop);
    await page.getByRole('button',{name:'全部技能',exact:true}).first().click();await page.locator('.cloud-source>.source-heading').click();
    await page.getByRole('heading',{name:'中文说明',exact:true}).waitFor();
    await page.waitForFunction(position=>Math.abs(document.querySelector('.content').scrollTop-position)<3,position);
    await page.getByRole('button',{name:'查看 1 个技能',exact:true}).click();await page.getByRole('textbox',{name:'搜索仓库技能',exact:true}).fill('阅读');
    await page.locator('.repository-skill-card').click();await page.getByText('技能暂不可读取',{exact:true}).waitFor();
    assert.equal(await page.getByText('这只是简介',{exact:true}).count(),0,'读取失败不以简介冒充全文');
    await page.getByRole('button',{name:'重新读取',exact:true}).click();await page.getByRole('heading',{name:'完整技能原文',exact:true}).waitFor();
    const savedLocation=await page.getByRole('button',{name:'返回技能',exact:true}).evaluate((button,url)=>new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{observer.disconnect();reject(new Error('返回后未显示技能列表'));},5000);
      const observer=new MutationObserver(()=>{
        if(!document.querySelector('[aria-label="搜索仓库技能"]'))return;
        observer.disconnect();clearTimeout(timer);
        resolve(JSON.parse(localStorage.getItem('asl.view.cloud-locations'))?.[url]);
      });
      observer.observe(document.querySelector('.source-library'),{childList:true,subtree:true});button.click();
    }),url);
    assert.equal(savedLocation?.skill,null,'列表出现时阅读位置已同步，不因紧接着刷新而退回旧技能');
    assert.equal(await page.getByRole('textbox',{name:'搜索仓库技能',exact:true}).inputValue(),'阅读');
    await page.reload();await page.getByRole('textbox',{name:'搜索仓库技能',exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'搜索仓库技能',exact:true}).inputValue(),'阅读');
    await page.locator('.source-library .repository-tabs').getByRole('button',{name:'仓库介绍',exact:true}).click();await page.getByRole('heading',{name:'中文说明',exact:true}).waitFor();
    await page.locator('.read-status').waitFor({state:'detached',timeout:60000});
    assert.deepEqual(errors,[]);console.log('云端阅读与重试验收：'+run);
  }catch(e){console.error('云端验收失败：'+run,e.stack,await page.locator('body').innerText());throw e;}
  finally{await page.close();await app.close();}
});

test('attention configurations expose check actions but never overwrite an unverified destination',{timeout:90000},async()=>{
  const {app,page,workspace,run,errors}=await launch();
  try{
    await app.evaluate(({ipcMain},workspace)=>{
      globalThis.attentionProbe={fixed:false,writes:0};
      const native=()=>({hosts:[{id:'codex-app',name:'Codex',scopes:['user'],configured:true}],projects:[],mcpSources:[],connections:[{id:'qa-attention',title:'Creator Studio',host:'codex-app',scope:'user',workspace,mode:'creator-studio',skills:['product-analysis'],status:globalThis.attentionProbe.fixed?'configured':'attention',location:'/qa/destination',issues:['内部诊断信息']}]});
      const read=ipcMain._invokeHandlers.get('asl:read');ipcMain.removeHandler('asl:read');ipcMain.handle('asl:read',(e,id,method,args)=>method==='native'?{ok:true,value:native()}:read(e,id,method,args));
      const run=ipcMain._invokeHandlers.get('asl:run');ipcMain.removeHandler('asl:run');ipcMain.handle('asl:run',(e,action,values)=>{if(values?.apply)globalThis.attentionProbe.writes++;return run(e,action,values);});
    },workspace);
    await page.reload();await page.locator('.mode-library-overview').waitFor();await page.getByRole('button',{name:'Agent 配置',exact:true}).first().click();
    await page.getByRole('button',{name:'检查来源库',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'更新内容',exact:true}).isDisabled(),true);
    assert.equal(await page.getByText('内部诊断信息',{exact:true}).isVisible(),false);
    await page.getByRole('button',{name:'检查来源库',exact:true}).click();await page.locator('.mode-page h1').filter({hasText:'Creator Studio'}).waitFor();
    await page.getByRole('button',{name:'Agent 配置',exact:true}).first().click();await app.evaluate(()=>{globalThis.attentionProbe.fixed=true;});
    await page.getByRole('button',{name:'重新检查',exact:true}).click();await page.getByText('配置已核对',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'更新内容',exact:true}).isEnabled(),true);
    assert.equal(await app.evaluate(()=>globalThis.attentionProbe.writes),0);assert.deepEqual(errors,[]);console.log('异常配置恢复入口验收：'+run);
  }finally{await page.close();await app.close();}
});
