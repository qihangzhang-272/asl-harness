const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs/promises');
const {launch,dispose}=require('./fixture.cjs');

test('DeepSeek sync acknowledges progress, keeps failures recoverable and shows the verified result',{timeout:90000},async()=>{
  const {app,page,workspace,run,errors}=await launch();
  try{
    await app.evaluate(({ipcMain},workspace)=>{
      const path=process.getBuiltinModule('node:path');
      const hosts=[{id:'deepseek-harness',name:'DeepSeek Harness',scopes:['preset'],configured:true}];
      const native={hosts,presets:[{name:'standard',path:path.join(workspace,'standard'),managed:false}],connections:[],mcpSources:[],projects:[],assistants:[]};
      globalThis.syncProbe={attempts:0,complete:null,native};
      const read=ipcMain._invokeHandlers.get('asl:read');ipcMain.removeHandler('asl:read');
      ipcMain.handle('asl:read',(event,id,method,args)=>method==='native'?{ok:true,value:native}:read(event,id,method,args));
      for(const method of ['asl:native','asl:native-locations']){ipcMain.removeHandler(method);ipcMain.handle(method,()=>({ok:true,value:native}));}
      ipcMain.removeHandler('asl:preset-target');ipcMain.handle('asl:preset-target',()=>({ok:true,value:path.join(workspace,'preset')}));
      const core=ipcMain._invokeHandlers.get('asl:run');ipcMain.removeHandler('asl:run');
      ipcMain.handle('asl:run',(_event,action,values)=>{
        if(action==='readiness')return {ok:true,value:{checks:[],setupNotes:[],hooks:{coverage:'preset',commandFound:false}}};
        if(action!=='preset')return core(_event,action,values);
        globalThis.syncProbe.attempts++;
        return new Promise(resolve=>{globalThis.syncProbe.complete=success=>{
          if(success)native.connections=[{id:'isolated-preset',host:'deepseek-harness',title:'Creator Studio',workspace,mode:'creator-studio',scope:'preset',project:values.output,location:values.output,skills:['product-analysis'],status:'configured',issues:[]}];
          resolve(success?{ok:true,value:{presetRegistered:true}}:{ok:false,error:'隔离测试：同步未完成，请重试'});
        };});
      });
    },workspace);
    await page.reload();await page.getByRole('button',{name:'Agent 配置',exact:true}).first().click();
    await page.getByRole('tab',{name:/DeepSeek Harness/}).click();
    await page.getByRole('button',{name:'添加工作模式',exact:true}).click();
    await page.getByRole('button',{name:'配置到 DeepSeek Harness',exact:true}).click();
    await page.getByRole('button',{name:'正在同步…',exact:true}).waitFor({timeout:2000});
    await app.evaluate(()=>globalThis.syncProbe.complete(false));
    await page.getByRole('button',{name:'配置到 DeepSeek Harness',exact:true}).waitFor();
    await page.getByRole('button',{name:'配置到 DeepSeek Harness',exact:true}).click();
    await page.getByRole('button',{name:'正在同步…',exact:true}).waitFor();
    await app.evaluate(()=>globalThis.syncProbe.complete(true));
    await page.getByText('已添加到 DeepSeek，请在新会话中选择这个工作模式。',{exact:true}).first().waitFor();
    await page.getByRole('button',{name:'关闭',exact:true}).click();
    await page.locator('.installed-mode').getByText('Creator Studio',{exact:true}).waitFor();
    await page.locator('.installed-mode').getByText('配置已核对',{exact:true}).waitFor();
    assert.equal(await app.evaluate(()=>globalThis.syncProbe.attempts),2);assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(run,'deepseek-sync-result.png')});console.log('DeepSeek同步反馈：'+run);
  }finally{await dispose(app);}
});

test('owned Agent session receipts update in place without relaunch or a model call',{timeout:90000},async()=>{
  const {app,page,run,errors}=await launch();
  try{
    await app.evaluate(({ipcMain})=>{
      globalThis.sessionProbe={status:'opened',starts:0,reads:0};
      ipcMain.removeHandler('asl:assistants');
      ipcMain.handle('asl:assistants',()=>({ok:true,value:[{id:'codex-app',name:'Codex CLI',available:true}]}));
      ipcMain.removeHandler('asl:organize');
      ipcMain.handle('asl:organize',()=>{globalThis.sessionProbe.starts++;return {ok:true,value:{id:'isolated-session',assistant:'codex-app',status:'opened'}};});
      ipcMain.removeHandler('asl:setup-status');
      ipcMain.handle('asl:setup-status',()=>{
        globalThis.sessionProbe.reads++;
        return globalThis.sessionProbe.status==='unavailable'?{ok:false,error:'temporary read failure'}:{ok:true,value:{id:'isolated-session',status:globalThis.sessionProbe.status}};
      });
    });
    await page.locator('.source-tree button').filter({hasText:'Creator Studio'}).first().click();
    await page.getByRole('button',{name:'交给 AI 整理',exact:true}).first().click();
    await page.getByRole('button',{name:'在 Codex 中继续',exact:true}).click();
    await page.locator('.assistant-session').getByText('Codex · 会话已打开',{exact:true}).waitFor();
    await page.screenshot({path:path.join(run,'assistant-opened.png')});
    await app.evaluate(()=>{globalThis.sessionProbe.status='unavailable';});
    await page.locator('.assistant-session').getByText('Codex · 状态暂不可用',{exact:true}).waitFor();
    await app.evaluate(({BrowserWindow})=>{globalThis.sessionProbe.status='ended';BrowserWindow.getAllWindows()[0].setContentSize(920,740);});
    await page.locator('.assistant-session').getByText('Codex · 会话已结束',{exact:true}).waitFor();
    const box=await page.locator('.assistant-session').boundingBox();
    assert.ok(box.x>=0&&box.x+box.width<=920&&box.y>=0&&box.y+box.height<=740);
    assert.equal(await app.evaluate(()=>globalThis.sessionProbe.starts),1);
    assert.ok(await app.evaluate(()=>globalThis.sessionProbe.reads)>=3);
    assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(run,'assistant-ended-narrow.png')});
    await page.locator('.editor-page-heading').getByRole('button',{name:'返回',exact:true}).click();
    await page.getByRole('button',{name:'Agent 配置',exact:true}).first().click();
    await page.getByRole('tab',{name:/Codex/}).click();
    await page.locator('.agent-manager .assistant-session').getByText('Codex · 会话已结束',{exact:true}).waitFor();
    await page.reload();
    await page.locator('.agent-manager .assistant-session').getByText('Codex · 会话已结束',{exact:true}).waitFor();
    assert.equal(await app.evaluate(()=>globalThis.sessionProbe.starts),1,'返回和重开只读取原回执，不再次启动 Agent');
    console.log('会话自动状态验收：'+run);
  }finally{await dispose(app);}
});

test('Agent results preserve drift, Hook scope, runtime sources and conflict protection',{timeout:120000},async()=>{
  const {app,page,workspace,run,errors}=await launch();
  const canonicalWorkspace=await fs.realpath(workspace);
  try{
    await app.evaluate(({ipcMain},workspace)=>{
      const path=process.getBuiltinModule('node:path');
      globalThis.agentResultsProbe={writes:0,starts:0,copies:0};
      const hosts=[['codex-app','Codex',['user','project']],['claude-code','Claude Code',['user','project']],['deepseek-harness','DeepSeek Harness',['preset']],['workbuddy','WorkBuddy',['project']]].map(([id,name,scopes])=>({id,name,scopes,configured:true}));
      const native={hosts,projects:[workspace],presets:[],mcpSources:[],assistants:[],connections:hosts.map(host=>({
        id:host.id,host:host.id,title:host.name+' 测试模式',workspace,mode:'creator-studio',
        scope:host.id==='codex-app'?'user':host.id==='deepseek-harness'?'preset':'project',
        project:workspace,location:workspace,skills:['product-analysis'],
        status:host.id==='codex-app'?'outdated':host.id==='workbuddy'?'attention':'configured',
        issues:host.id==='codex-app'?['来源内容已变化，请重新同步。']:host.id==='workbuddy'?['受管配置已修改']:[],
        ...(host.id==='workbuddy'?{diagnostic:{code:'HOST_PROJECTION_MODIFIED',message:'受管配置已修改',details:{file:'.codebuddy/CODEBUDDY.md',action:'保留修改后重新核对'}}}:{}),
      }))};
      const read=ipcMain._invokeHandlers.get('asl:read');ipcMain.removeHandler('asl:read');
      ipcMain.handle('asl:read',(event,id,method,args)=>method==='native'?{ok:true,value:native}:read(event,id,method,args));
      ipcMain.removeHandler('asl:native');ipcMain.handle('asl:native',()=>({ok:true,value:native}));
      ipcMain.removeHandler('asl:native-locations');ipcMain.handle('asl:native-locations',()=>({ok:true,value:native}));
      ipcMain.removeHandler('asl:choose');ipcMain.handle('asl:choose',()=>({ok:true,value:workspace}));
      ipcMain.removeHandler('asl:copy-text');ipcMain.handle('asl:copy-text',()=>{globalThis.agentResultsProbe.copies++;return {ok:true,value:true};});
      const run=ipcMain._invokeHandlers.get('asl:run');ipcMain.removeHandler('asl:run');
      ipcMain.handle('asl:run',(event,action,values)=>{
        if(action==='project'){
          globalThis.agentResultsProbe.writes++;
          return {ok:true,value:{ok:true,activation:{openProject:workspace,instructionFile:'.codebuddy/CODEBUDDY.md',hookActivation:'unsupported',hookIntegration:null}}};
        }
        if(action!=='readiness'){if(values?.apply||['project','preset'].includes(action))globalThis.agentResultsProbe.writes++;return run(event,action,values);}
        return {ok:true,value:{checks:values.host==='deepseek-harness'?[{kind:'binary',name:'测试工具',skills:['product-analysis'],status:'missing'}]:[],setupNotes:[{skill:'product-analysis',path:path.join(workspace,'skills/product-analysis/SOURCE.md')}],userPaths:{skills:path.join(workspace,'.agents/skills'),instructions:path.join(workspace,'AGENTS.md')},
          hooks:{coverage:values.host==='workbuddy'||values.scope==='user'?'none':values.scope,command:'asl-harness-hook',commandFound:values.host==='deepseek-harness',commandPath:null,verified:false},brief:'隔离验收材料'}};
      });
      ipcMain.removeHandler('asl:setup');ipcMain.handle('asl:setup',()=>{globalThis.agentResultsProbe.starts++;throw Error('测试禁止启动真实模型');});
    },canonicalWorkspace);
    await page.reload();await page.locator('.mode-library-overview').waitFor();
    await page.getByRole('button',{name:'Agent 配置',exact:true}).first().click();
    await page.getByText('配置详情',{exact:true}).click();
    await page.getByText('来源内容已变化，请重新同步。',{exact:true}).waitFor();
    await page.getByRole('button',{name:'运行检查',exact:true}).click();
    const dialog=page.locator('dialog[open]');
    await dialog.getByText('自动检查 · 未覆盖',{exact:true}).waitFor();
    assert.equal(await dialog.getByText(/默认模式不在项目 Hook 覆盖范围内/).isVisible(),false,'技术范围默认折叠');
    await dialog.getByText('自动检查 · 未覆盖',{exact:true}).click();
    await dialog.getByText(/默认模式不在项目 Hook 覆盖范围内/).waitFor();
    await dialog.getByText('技能中的运行说明',{exact:true}).click();
    await dialog.getByRole('button',{name:'product-analysis · SOURCE.md'}).click();
    await page.locator('.editor-page .package-rendered').waitFor();
    await page.locator('.package-tree').getByRole('button',{name:'SOURCE.md',exact:true}).waitFor();
    await page.getByRole('button',{name:'关闭',exact:true}).last().click();
    await page.getByRole('button',{name:'Agent 配置',exact:true}).first().click();
    for(const [host,status,detail] of [
      ['Claude Code','待配置','未找到检查命令'],
      ['DeepSeek Harness','尚未实测','原生 Hook 是否启用及真实触发尚未核实'],
      ['WorkBuddy','未覆盖','此 Agent 尚未接入自动检查'],
    ]){
      await page.getByRole('tab',{name:new RegExp(host)}).click();
      if(host==='WorkBuddy'){
        assert.equal(await page.getByRole('button',{name:'更新内容',exact:true}).isDisabled(),true);
        assert.equal(await page.getByRole('button',{name:'停用',exact:true}).isDisabled(),true);
        await page.getByText('检查配置',{exact:true}).click();await page.getByText('完整诊断',{exact:true}).click();
        await page.locator('.connection-details pre').filter({hasText:'HOST_PROJECTION_MODIFIED'}).waitFor();
      }
      await page.getByRole('button',{name:'运行检查',exact:true}).click();
      if(host==='DeepSeek Harness'){
        await dialog.getByText('1 项需要处理',{exact:true}).waitFor();
        assert.equal(await dialog.getByText('测试工具',{exact:true}).isVisible(),false,'检查项按需展开');
        await dialog.getByText('检查项 · 1',{exact:true}).click();await dialog.getByText('测试工具',{exact:true}).waitFor();
      }
      if(['DeepSeek Harness','WorkBuddy'].includes(host)){
        assert.equal(await dialog.getByRole('button',{name:'在 Codex 中继续',exact:true}).count(),0);
        await dialog.getByRole('button',{name:'复制给 '+host,exact:true}).click();
        await dialog.getByText('已复制。在 '+host+' 新会话中粘贴并发送。',{exact:true}).waitFor();
      }
      await dialog.getByText('自动检查 · '+status,{exact:true}).click();await dialog.getByText(new RegExp(detail)).waitFor();
      if(host==='Claude Code')await page.screenshot({path:path.join(run,'agent-results-wide.png')});
      if(host==='WorkBuddy'){
        await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.isVisible()).setSize(920,800));
        await page.screenshot({path:path.join(run,'agent-results-narrow.png')});
        assert.ok(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1),'检查内容不能横向溢出');
      }
      await dialog.getByRole('button',{name:'关闭',exact:true}).click();
    }
    assert.deepEqual(await app.evaluate(()=>globalThis.agentResultsProbe),{writes:0,starts:0,copies:2});
    await page.getByRole('button',{name:'添加工作模式',exact:true}).click();
    await page.getByRole('button',{name:'选择项目文件夹',exact:true}).click();
    await page.getByRole('button',{name:'配置到 WorkBuddy',exact:true}).click();
    await dialog.getByText('自动检查 · 未覆盖',{exact:true}).waitFor();
    await dialog.getByText(`下一步：在 WorkBuddy 中打开项目「${path.basename(workspace)}」，开始新会话并说明要完成的任务。`,{exact:true}).waitFor();
    assert.equal(await dialog.getByText(workspace,{exact:false}).first().isVisible(),false,'配置文件路径不占据主界面');
    await dialog.getByText('配置位置',{exact:true}).click();
    await dialog.getByText(workspace,{exact:false}).first().waitFor();
    await dialog.getByText(/\.codebuddy\/CODEBUDDY.md/).waitFor();
    assert.equal(await dialog.getByText('正在检查本机环境…',{exact:true}).count(),0,'保存后的初始检查不能被写门吞掉');
    assert.deepEqual(await app.evaluate(()=>globalThis.agentResultsProbe),{writes:1,starts:0,copies:2},'配置调用仅在隔离IPC替身中计数，不改真实投影');
    assert.deepEqual(errors,[]);console.log('Agent配置结果验收：'+run);
  }catch(error){await page.screenshot({path:path.join(run,'agent-results-failure.png')});console.error(run);throw error;}
  finally{await dispose(app);}
});
