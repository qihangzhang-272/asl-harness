const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {launch}=require('./fixture.cjs');

test('archive browsing, restore, conflicts and canceled cleanup preserve content',{timeout:120000},async()=>{
  const {app,page,workspace,run,errors}=await launch();
  const feedback='feedback-'+'a'.repeat(32),mode='mode-creator-studio-20261008T120000-aabbcc';
  try{
    await fs.mkdir(path.join(workspace,'archive',feedback),{recursive:true});
    await fs.writeFile(path.join(workspace,'archive',feedback,'review.md'),'# 保留记录\n\n已确认的修改理由。\n');
    await fs.mkdir(path.join(workspace,'archive','old-assets'),{recursive:true});
    await fs.writeFile(path.join(workspace,'archive','old-assets','notes.md'),'# 历史资料\n\n原有内容。');
    await fs.writeFile(path.join(workspace,'archive','old-assets','asset.bin'),Buffer.from([0,255,1]));
    const original=await fs.readFile(path.join(workspace,'modes/creator-studio/mode.yaml'));
    await fs.cp(path.join(workspace,'modes/creator-studio'),path.join(workspace,'archive',mode),{recursive:true});
    await app.evaluate(({ipcMain,dialog})=>{
      globalThis.archiveCleanupCalls=[];
      dialog.showMessageBox=async()=>({response:1});
      ipcMain.removeHandler('asl:trash-archive');
      ipcMain.handle('asl:trash-archive',(_event,values)=>{globalThis.archiveCleanupCalls.push(values);return {ok:true,value:{canceled:true}};});
    });
    await page.getByRole('button',{name:'归档',exact:true}).click();
    const screen=page.locator('.editor-page');
    await screen.getByRole('button',{name:/^保留记录/}).click();
    await screen.getByRole('heading',{name:'保留记录',exact:true}).waitFor();
    await screen.getByRole('button',{name:'恢复到工作库',exact:true}).click();
    await screen.getByText('已恢复到工作库',{exact:true}).waitFor();
    assert.match(await fs.readFile(path.join(workspace,'feedback/review.md'),'utf8'),/已确认的修改理由/);
    await assert.rejects(fs.stat(path.join(workspace,'archive',feedback)),{code:'ENOENT'});
    await screen.getByRole('button',{name:/^old-assets/}).click();
    await screen.getByLabel('归档文件',{exact:true}).selectOption('notes.md');
    await screen.getByRole('heading',{name:'历史资料',exact:true}).waitFor();
    assert.equal(await screen.getByRole('button',{name:'恢复到工作库',exact:true}).count(),0);
    assert.equal(await screen.getByRole('button',{name:'移到回收站',exact:true}).count(),0);
    await screen.getByLabel('归档文件',{exact:true}).selectOption('asset.bin');
    await screen.getByText('此文件暂不支持预览。',{exact:true}).waitFor();
    await screen.getByRole('button',{name:/^Creator Studio/}).click();
    await screen.getByRole('button',{name:'恢复到工作库',exact:true}).click();
    await screen.getByRole('alert').filter({hasText:'原位置已有同名内容，未覆盖。'}).waitFor();
    assert.deepEqual(await fs.readFile(path.join(workspace,'modes/creator-studio/mode.yaml')),original);
    await screen.getByRole('button',{name:'移到回收站',exact:true}).click();
    assert.equal((await app.evaluate(()=>globalThis.archiveCleanupCalls)).length,1);
    assert.deepEqual(await fs.readFile(path.join(workspace,'archive',mode,'mode.yaml')),original,'取消清理不删除归档');
    assert.equal(await screen.getByText('已移到回收站',{exact:true}).count(),0);
    await app.evaluate(({BrowserWindow},workspace)=>BrowserWindow.getAllWindows().find(window=>window.isVisible()).webContents.send('asl:environment-changed',{workspace}),workspace);
    await screen.getByText('归档有新变化，请重新读取。',{exact:true}).waitFor();
    assert.equal(await screen.getByRole('button',{name:'恢复到工作库',exact:true}).isDisabled(),true);
    await screen.getByRole('button',{name:'重新读取',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('.archive-browser .package-rendered [role=status]'));
    assert.equal(await screen.getByRole('button',{name:'恢复到工作库',exact:true}).isEnabled(),true);
    await page.screenshot({path:path.join(run,'archive-browser.png')});
    assert.deepEqual(errors,[]);console.log('归档浏览验收：'+run);
  }catch(error){await page.screenshot({path:path.join(run,'archive-browser-failure.png')});console.error(run);throw error;}
  finally{await page.close();await app.close();}
});
