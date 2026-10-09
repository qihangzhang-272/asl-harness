const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {launch,dispose}=require('./fixture.cjs');

test('Agent results preserve drift, Hook scope, runtime sources and conflict protection',{timeout:120000},async()=>{
  const {app,page,workspace,run,errors}=await launch();
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
    },workspace);
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
    await dialog.getByText(/下一步：在 WorkBuddy 中打开此项目并开始新会话/).waitFor();
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
