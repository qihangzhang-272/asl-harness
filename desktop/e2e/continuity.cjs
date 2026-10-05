const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {launch}=require('./fixture.cjs');

test('a failed Skill file read offers retry without misreporting a binary file',{timeout:60000},async()=>{
  const {app,page,errors}=await launch();
  try {
    await app.evaluate(({ipcMain})=>{
      const run=ipcMain._invokeHandlers.get('asl:run');let failed=false;
      ipcMain.removeHandler('asl:run');
      ipcMain.handle('asl:run',(event,action,values)=>{
        if(action==='files'&&!failed){failed=true;return {ok:false,error:'文件暂时无法读取'};}
        return run(event,action,values);
      });
    });
    await page.getByRole('button',{name:'全部技能',exact:true}).first().click();
    await page.locator('.skill-table-row').first().click();
    await page.getByRole('alert').filter({hasText:'文件暂时无法读取'}).waitFor();
    assert.equal(await page.getByText(/此文件为二进制/).count(),0,'读取失败不能误报为不支持的文件');
    await page.getByRole('button',{name:'重新读取',exact:true}).click();
    await page.locator('.editor-page .package-rendered .markdown-content h1').waitFor();
    assert.equal(await page.getByRole('alert').count(),0);
    assert.deepEqual(errors,[]);
  } finally {await page.close();await app.close();}
});

test('leaving a Skill draft through the source tree protects unsaved edits',{timeout:60000},async()=>{
  const {app,page,errors}=await launch();
  try {
    await page.getByRole('button',{name:'全部技能',exact:true}).first().click();
    await page.locator('.skill-table-row').first().click();
    await page.locator('.editor-page .package-rendered .markdown-content').waitFor();
    await page.getByRole('button',{name:'编辑',exact:true}).click();
    const editor=page.getByRole('textbox',{name:'文件内容',exact:true});
    const draft=(await editor.inputValue())+'\n未保存的测试草稿。';
    await editor.fill(draft);
    page.removeAllListeners('dialog');let confirmations=0,discard=false;
    page.on('dialog',async dialog=>{confirmations++;await (discard?dialog.accept():dialog.dismiss());});
    await page.locator('.source-tree button').filter({hasText:'Creator Studio'}).click();
    assert.equal(confirmations,1,'来源树导航必须先确认草稿');
    assert.equal(await editor.inputValue(),draft);
    await page.getByRole('button',{name:'发现',exact:true}).first().click();
    assert.equal(confirmations,2,'每次离开只询问一次');
    assert.equal(await editor.inputValue(),draft);
    discard=true;
    await page.locator('.editor-page-heading').getByRole('button',{name:'返回',exact:true}).click();
    await page.locator('.editor-page').waitFor({state:'detached'});
    assert.equal(confirmations,3,'返回不重复确认');
    assert.deepEqual(errors,[]);
  } finally {await page.close();await app.close();}
});

test('canceling a pending cloud connection cannot connect later and permits retry',{timeout:60000},async()=>{
  const {app,page,errors}=await launch({empty:true});
  const url='https://github.com/qa/cancel';
  try {
    await app.evaluate(({ipcMain},url)=>{
      globalThis.cancelProbe={connections:0};
      const response={ok:true,value:{repository:url,snapshot:'/cancel',commit:'one',skills:[],modes:[],readme:{text:'# 已重新打开',url:url+'/blob/main/README.md'}}};
      let attempts=0;
      ipcMain.removeHandler('asl:github-skills');
      ipcMain.handle('asl:github-skills',()=>++attempts===1?new Promise(resolve=>{globalThis.cancelProbe.finish=()=>resolve(response);}):response);
      ipcMain.removeHandler('asl:repository-overview');
      ipcMain.handle('asl:repository-overview',()=>({ok:true,value:null}));
      ipcMain.removeHandler('asl:connect-repository');
      ipcMain.handle('asl:connect-repository',()=>{globalThis.cancelProbe.connections++;return {ok:true,value:[url]};});
    },url);
    await page.getByRole('button',{name:'发现',exact:true}).first().click();
    await page.getByRole('textbox',{name:'GitHub 仓库地址',exact:true}).fill(url);
    await page.getByRole('button',{name:'读取仓库',exact:true}).click();
    await page.getByRole('button',{name:'取消读取模式库',exact:true}).click();
    await app.evaluate(()=>globalThis.cancelProbe.finish());
    await page.waitForFunction(()=>!document.querySelector('.source-library[aria-busy=true]'));
    await page.getByRole('button',{name:'重试',exact:true}).waitFor({timeout:3000});
    assert.equal(await app.evaluate(()=>globalThis.cancelProbe.connections),0);
    assert.equal(await page.locator('.cloud-source').count(),0);
    assert.equal(await page.locator('.source-library .source-loading').count(),0);
    await page.getByRole('button',{name:'重试',exact:true}).click();
    await page.getByRole('heading',{name:'已重新打开',exact:true}).waitFor();
    await page.locator('.cloud-source').waitFor();
    assert.equal(await app.evaluate(()=>globalThis.cancelProbe.connections),1);
    assert.deepEqual(errors,[]);
  } finally {await page.close();await app.close();}
});

test('a new Skill draft uses the same leave protection as an existing file',{timeout:60000},async()=>{
  const {app,page,errors}=await launch();
  try {
    await page.getByRole('button',{name:'全部技能',exact:true}).first().click();
    await page.getByRole('button',{name:'创建技能',exact:true}).click();
    page.removeAllListeners('dialog');let confirmations=0,discard=false;
    page.on('dialog',async dialog=>{confirmations++;await (discard?dialog.accept():dialog.dismiss());});
    await page.locator('.editor-page-heading').getByRole('button',{name:'返回',exact:true}).click();
    assert.equal(confirmations,0,'未修改的新建页不必确认');
    await page.getByRole('button',{name:'创建技能',exact:true}).click();
    await page.getByRole('textbox',{name:'用途',exact:true}).fill('保留草稿');
    await page.locator('.source-tree button').filter({hasText:'Creator Studio'}).click();
    assert.equal(confirmations,1);
    assert.equal(await page.getByRole('textbox',{name:'用途',exact:true}).inputValue(),'保留草稿');
    discard=true;
    await page.locator('.editor-page-heading').getByRole('button',{name:'返回',exact:true}).click();
    await page.locator('.editor-page').waitFor({state:'detached'});
    assert.equal(confirmations,2);
    assert.deepEqual(errors,[]);
  } finally {await page.close();await app.close();}
});

test('retrying the initial library restores normal navigation persistence',{timeout:60000},async()=>{
  const {app,page,workspace,run,errors}=await launch();
  try {
    await app.evaluate(({ipcMain})=>{
      const read=ipcMain._invokeHandlers.get('asl:read');let failed=false;
      ipcMain.removeHandler('asl:read');
      ipcMain.handle('asl:read',(event,id,method,args)=>{
        if(method==='run'&&args[0]==='catalog'&&!failed){failed=true;return {ok:false,error:'工作库暂时不可用'};}
        return read(event,id,method,args);
      });
    });
    await page.reload();
    await page.getByRole('heading',{name:'未能打开模式库',exact:true}).waitFor();
    await page.getByRole('button',{name:'重试',exact:true}).click();
    await page.locator('.mode-library-overview').waitFor();
    await page.getByRole('button',{name:'全部技能',exact:true}).first().click();
    await page.getByRole('textbox',{name:'搜索技能',exact:true}).fill('恢复后的搜索');
    await page.waitForFunction(async root=>{const view=(await window.asl.initial()).value.views[root];return view?.query==='恢复后的搜索'&&view.page==='skills';},workspace,{timeout:3000});
    assert.equal(JSON.parse(await fs.readFile(path.join(run,'home/app/libraries.json'),'utf8')).views[workspace].page,'skills');
    assert.deepEqual(errors,[]);
  } finally {await page.close();await app.close();}
});

test('background discovery cannot replace the explicitly selected directory',{timeout:60000},async()=>{
  const {app,page,errors}=await launch({empty:true});
  try {
    await app.evaluate(({ipcMain,dialog})=>{
      globalThis.discoveryProbe={calls:0};
      const report=(id,title,roots)=>({skills:[{id,title,description:'可阅读的测试技能',source:'/skills/'+id}],issues:[],roots});
      ipcMain.removeHandler('asl:local-skills');
      ipcMain.handle('asl:local-skills',()=>{globalThis.discoveryProbe.calls++;return new Promise(resolve=>{globalThis.discoveryProbe.finish=()=>resolve({ok:true,value:report('machine','本机默认技能',[])});});});
      const read=ipcMain._invokeHandlers.get('asl:read');
      ipcMain.removeHandler('asl:read');
      ipcMain.handle('asl:read',(event,id,method,args)=>method==='localSkills'&&args[0]?{ok:true,value:report('chosen','选中目录技能',[{name:'自选目录',path:args[0]}])}:read(event,id,method,args));
      dialog.showOpenDialog=async()=>({canceled:false,filePaths:['C:\\qa-chosen-skills']});
    });
    await page.reload();
    await page.getByRole('button',{name:'发现',exact:true}).first().click();
    await page.getByRole('button',{name:'本机技能',exact:true}).click();
    await page.getByRole('button',{name:'选择目录',exact:true}).click();
    await page.locator('.discovered-skill').filter({hasText:'选中目录技能'}).waitFor();
    await app.evaluate(()=>globalThis.discoveryProbe.finish());
    await page.getByText('正在检查更新',{exact:true}).waitFor({state:'hidden'});
    // A separate renderer round trip lets the already-resolved IPC update flush.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await page.locator('.discovered-skill').filter({hasText:'选中目录技能'}).count(),1);
    assert.equal(await page.locator('.discovered-skill').filter({hasText:'本机默认技能'}).count(),0);
    assert.equal(await page.getByText('自选目录',{exact:true}).count(),1);
    assert.deepEqual(errors,[]);
  } finally {await page.close();await app.close();}
});

test('cloud navigation preserves local position and refresh keeps the same repository skill', {timeout:120000},async()=>{
  const {app,page,workspace,run,errors}=await launch();
  const url='https://github.com/qa/continuity',preferences=path.join(run,'home/app/libraries.json');
  try {
    // Deterministic remote snapshots at the IPC boundary; all navigation uses real UI.
    await app.evaluate(({ipcMain},url)=>{
      let revision=0;
      ipcMain.removeHandler('asl:github-skills');
      ipcMain.handle('asl:github-skills',()=>{
        const snapshot='/snapshot/'+(++revision);
        return {ok:true,value:{repository:url,snapshot,commit:String(revision),modes:[],
          readme:{text:'# 仓库介绍\n\n![附件](https://github.com/user-attachments/assets/example)\n\n![文件](./cover.png)',url:url+'/blob/main/README.md'},
          skills:['first','second'].map(folder=>({id:'same-name',title:folder==='first'?'持续阅读':'同名技能',description:'仓库技能',repositoryPath:'skills/'+folder,source:snapshot+'/skills/'+folder,origin:url+'/tree/main/skills/'+folder}))}};
      });
      ipcMain.removeHandler('asl:source-document');
      ipcMain.handle('asl:source-document',(_,source)=>({ok:true,value:'# 技能正文\n\n'+(source.endsWith('/first')?'选中的技能。':'另一个同名技能。')}));
    },url);
    const state=JSON.parse(await fs.readFile(preferences,'utf8'));
    state.repositories=[url];
    await fs.writeFile(preferences,JSON.stringify(state));
    await page.reload();
    await page.locator('.mode-library-overview').waitFor();
    await page.locator('.source-tree button').filter({hasText:'Creator Studio'}).click();
    await page.locator('.mode-page').waitFor();
    await page.locator('.architecture-section g.node[role=button]').first().click();
    await page.locator('.skill-canvas-panel .markdown-content').waitFor();
    await page.locator('.cloud-source>.source-heading').click();
    await page.locator('.source-library .repository-tabs').waitFor();
    assert.equal(await page.locator('.inspector').count(),0,'云端阅读不能露出后台本地技能操作');
    assert.equal(await page.locator('.skill-canvas-panel').count(),0);
    await page.getByRole('button',{name:'工作模式',exact:true}).first().click();
    await page.locator('.skill-canvas-panel .markdown-content').waitFor();
    await page.getByRole('button',{name:'全部技能',exact:true}).first().click();
    await page.getByRole('textbox',{name:'搜索技能',exact:true}).fill('Product');
    await page.waitForFunction(async root=>{const r=await window.asl.initial();return r.value.views[root]?.query==='Product';},workspace);
    const local=JSON.parse(await fs.readFile(preferences,'utf8')).views[workspace];
    await page.locator('.cloud-source>.source-heading').click();
    assert.equal(await page.getByRole('img',{name:'附件',exact:true}).getAttribute('src'),'https://github.com/user-attachments/assets/example');
    assert.equal(await page.getByRole('img',{name:'文件',exact:true}).getAttribute('src'),'https://raw.githubusercontent.com/qa/continuity/main/cover.png');
    await page.getByRole('button',{name:'查看 2 个技能',exact:true}).click();
    await page.getByRole('button',{name:/持续阅读/}).click();
    await page.getByText('选中的技能。',{exact:true}).waitFor();
    await page.getByRole('button',{name:'刷新云端模式库',exact:true}).click();
    await page.getByText('选中的技能。',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'返回技能',exact:true}).count(),1);
    assert.deepEqual(JSON.parse(await fs.readFile(preferences,'utf8')).views[workspace],local);
    await page.getByRole('button',{name:'全部技能',exact:true}).first().click();
    assert.equal(await page.getByRole('textbox',{name:'搜索技能',exact:true}).inputValue(),'Product');
    await page.locator('.cloud-source>.source-heading').click();
    await page.locator('.source-library').waitFor();
    await page.waitForFunction(async()=>!!(await window.asl.initial()).value.activeSource);
    await page.reload();
    await page.locator('.source-library .repository-tabs').waitFor();
    await page.locator('.read-status').waitFor({state:'detached',timeout:60000});
    assert.deepEqual(JSON.parse(await fs.readFile(preferences,'utf8')).views[workspace],local,'恢复云端时不重置本地位置');
    await page.getByRole('button',{name:'全部技能',exact:true}).first().click();
    assert.equal(await page.getByRole('textbox',{name:'搜索技能',exact:true}).inputValue(),'Product');
    await page.screenshot({path:path.join(run,'local-position-restored.png')});
    assert.deepEqual(errors,[]);
    console.log('导航连贯性验收：'+run);
  } catch(error) {console.error('导航失败：'+run,await page.locator('body').innerText());throw error;}
  finally {await page.close();await app.close();}
});

test('a first connection that fails can be retried without losing explicit connection intent',{timeout:60000},async()=>{
  const {app,page,errors}=await launch({empty:true});
  const url='https://github.com/qa/retry';
  try {
    await app.evaluate(({ipcMain},url)=>{
      let attempt=0;
      ipcMain.removeHandler('asl:github-skills');
      ipcMain.handle('asl:github-skills',()=>++attempt===1?{ok:false,error:'暂时无法读取仓库'}:{ok:true,value:{repository:url,snapshot:'/retry',commit:'next',skills:[],modes:[],readme:{text:'# 重试成功',url:url+'/blob/main/README.md'}}});
      ipcMain.removeHandler('asl:connect-repository');
      ipcMain.handle('asl:connect-repository',(_,value,snapshot)=>({ok:snapshot==='/retry',value:[value]}));
    },url);
    await page.getByRole('button',{name:'发现',exact:true}).first().click();
    await page.getByRole('textbox',{name:'GitHub 仓库地址',exact:true}).fill(url);
    await page.getByRole('button',{name:'读取仓库',exact:true}).click();
    await page.getByRole('button',{name:'重试',exact:true}).click();
    await page.getByRole('heading',{name:'重试成功',exact:true}).waitFor();
    await page.locator('.cloud-source>.source-heading').waitFor();
    assert.deepEqual(errors,[]);
  } finally {await page.close();await app.close();}
});

test('first launch discovers local skills and a chosen Mode library without Agent configuration',{timeout:120000},async()=>{
  const {app,page,run,errors}=await launch({empty:true});
  try {
    const skill=path.join(run,'home/.agents/skills/product-analysis');
    await fs.mkdir(path.dirname(skill),{recursive:true});
    await fs.cp(path.resolve(__dirname,'../../examples/personal-environment/skills/product-analysis'),skill,{recursive:true});
    await page.getByRole('button',{name:'发现',exact:true}).first().click();
    await page.getByRole('button',{name:'本机技能',exact:true}).click();
    await page.getByRole('button',{name:'扫描本机',exact:true}).click();
    await page.locator('.discovered-skill').filter({hasText:'Product analysis'}).waitFor();
    await page.getByRole('button',{name:'查看内容',exact:true}).click();
    await page.locator('.editor-page .markdown-content h1').waitFor();
    assert.equal(await page.locator('.modal-backdrop').count(),0);
    assert.equal(await page.locator('.editor-page pre.repository-tree:visible').count(),0);
    const state=JSON.parse(await fs.readFile(path.join(run,'home/app/libraries.json'),'utf8'));
    assert.deepEqual(state.libraries,[],'reading does not silently create a work environment');
    await page.screenshot({path:path.join(run,'first-local-skill.png')});
    await page.locator('.editor-page-heading').getByRole('button',{name:'返回',exact:true}).click();
    await page.getByRole('button',{name:'本机工作模式',exact:true}).click();
    const library=path.join(run,'downloaded-library');
    await fs.cp(path.resolve(__dirname,'../../examples/personal-environment'),library,{recursive:true});
    await app.evaluate(({dialog},library)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[library]});},library);
    await page.getByRole('button',{name:'选择目录',exact:true}).click();
    await page.locator('.local-mode-row').filter({hasText:'Creator Studio'}).click();
    await page.locator('.mode-page h1').filter({hasText:'Creator Studio'}).waitFor();
    await page.locator('.architecture-section g.node[role=button]').click();
    await page.locator('.skill-canvas-panel .markdown-content').waitFor();
    await page.getByRole('button',{name:'发现',exact:true}).first().click();
    await page.getByRole('button',{name:'粘贴 GitHub 链接',exact:true}).click();
    await page.getByRole('textbox',{name:'GitHub 仓库地址',exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    console.log('空环境发现验收：'+run);
  } finally {await page.close();await app.close();}
});

test('reading stays visual and explicit source editing goes straight to the document', {timeout:120000},async()=>{
  const {app,page,workspace,run,errors}=await launch();
  try {
    await page.locator('.source-tree button').filter({hasText:'Creator Studio'}).click();
    await page.locator('.architecture-section .mermaid-drawing svg').waitFor();
    await page.locator('.architecture-section .mermaid-edit').click({button:'right',position:{x:8,y:70}});
    await page.getByRole('menuitem',{name:'编辑原文',exact:true}).click();
    const editor=page.getByRole('textbox',{name:'模式说明',exact:true});
    await editor.waitFor({timeout:3000});
    await editor.fill('[查看要点](#核心要点)\n\n## 概览\n\n'+Array(40).fill('阅读内容。\n').join('\n')+'\n## 核心要点\n\n内容不应丢失。\n\n```mermaid\nflowchart LR\n A[阅读] --> B[理解]\n```');
    await page.locator('.mode-workspace-document-toolbar').getByRole('button',{name:'预览',exact:true}).click();
    await page.getByRole('link',{name:'查看要点',exact:true}).click();
    const heading=page.getByRole('heading',{name:'核心要点',exact:true});
    assert.ok(await heading.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),'目录应定位到标题');
    await page.locator('.mode-workspace-document-preview .mermaid-drawing').dblclick();
    assert.equal(await editor.count(),0,'图内手势不进入整篇源码');
    await heading.dblclick();
    await editor.waitFor();
    await page.getByRole('button',{name:'保存',exact:true}).click();
    await page.locator('.editor-page').waitFor({state:'detached',timeout:60000});
    assert.match(await fs.readFile(path.join(workspace,'modes/creator-studio/MODE.md'),'utf8'),/核心要点/);
    await page.getByRole('button',{name:'发现',exact:true}).first().click();
    await page.getByRole('button',{name:'图示',exact:true}).click();
    await page.locator('.diagram-examples .mermaid-drawing svg').waitFor();
    await page.locator('.diagram-examples .mermaid-edit').click({button:'right',position:{x:8,y:70}});
    assert.equal(await page.getByRole('textbox',{name:'图示原文',exact:true}).count(),0);
    await page.getByRole('menuitem',{name:'编辑原文',exact:true}).click();
    await page.getByRole('textbox',{name:'图示原文',exact:true}).waitFor();
    await page.getByRole('button',{name:'返回图示',exact:true}).click();
    assert.equal(await page.getByRole('textbox',{name:'图示原文',exact:true}).count(),0);
    await page.screenshot({path:path.join(run,'reading-visual.png')});
    assert.deepEqual(errors,[]);
    console.log('阅读交互验收：'+run);
  } catch(error) {console.error('阅读失败：'+run,await page.locator('body').innerText());throw error;}
  finally {await page.close();await app.close();}
});
