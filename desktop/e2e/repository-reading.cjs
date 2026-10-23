const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {launch,dispose}=require('./fixture.cjs');

test('authored languages, cross-ref links and reading choices stay inside the App',{timeout:120000},async()=>{
  const {app,page,run,errors}=await launch();
  const url='https://github.com/qa/multilingual';
  try{
    await app.evaluate(async({app,ipcMain},url)=>{
      const path=process.getBuiltinModule('node:path');
      const require=process.getBuiltinModule('node:module').createRequire(path.join(app.getAppPath(),'package.json'));
      await require('./library.cjs').updatePreferences(path.join(app.getPath('userData'),'libraries.json'),state=>({...state,repositories:[url]}));
      const english='# A readable skill library\n\n[中文](README.zh-CN.md) · [Other version]('+url+'/blob/release/docs/use.md)\n\nRead the original instructions here.';
      globalThis.readingProbe={external:0,requests:[],offline:false};
      const document=(file,ref='abc123')=>({file,url:url+'/blob/'+ref+'/'+file,text:file==='README.zh-CN.md'?'# 清晰管理你的技能\n\n这是作者提供的中文说明。\n\n[其他版本]('+url+'/blob/release/docs/use.md)':file==='README.en.md'?english:file==='README.ja.md'?'# スキルを整理する':'# Release instructions\n\nThis is the requested release, not the preview.'});
      ipcMain.removeHandler('asl:github-skills');ipcMain.handle('asl:github-skills',()=>({ok:true,value:{repository:url,snapshot:'isolated-snapshot',commit:'abc123',modes:[],skills:[],repositoryFiles:['README.md','README.en.md','README.zh-CN.md','README.ja.md'],readme:{file:'README.md',url:url+'/blob/abc123/README.md',text:english}}}));
      ipcMain.removeHandler('asl:repository-overview');ipcMain.handle('asl:repository-overview',(_event,_url,value)=>{
        if(!value)return {ok:true,value:null};
        globalThis.readingProbe.requests.push(value);
        return {ok:true,value:document(value.file,value.ref)};
      });
      ipcMain.removeHandler('asl:repository-document');ipcMain.handle('asl:repository-document',(_event,_root,file)=>{
        globalThis.readingProbe.requests.push({file,ref:'abc123'});
        return globalThis.readingProbe.offline?{ok:false,error:'network unavailable'}:{ok:true,value:document(file)};
      });
      ipcMain.removeHandler('asl:external');ipcMain.handle('asl:external',()=>{globalThis.readingProbe.external++;return {ok:true};});
    },url);
    await page.reload();await page.locator('.cloud-source>.source-heading').click();
    await page.locator('.repository-readme .markdown-content').waitFor();
    await page.screenshot({path:path.join(run,'repository-reading-before.png')});
    const language=page.getByRole('combobox',{name:'阅读语言',exact:true});
    await language.waitFor();
    await page.getByRole('heading',{name:'清晰管理你的技能',exact:true}).waitFor();
    await language.selectOption('abc123:README.en.md');
    await page.getByRole('heading',{name:'A readable skill library',exact:true}).waitFor();
    await page.reload();await page.getByRole('heading',{name:'A readable skill library',exact:true}).waitFor();
    await page.getByRole('link',{name:'Other version',exact:true}).click();
    await page.getByRole('heading',{name:'Release instructions',exact:true}).waitFor();
    await page.getByText('其他版本 · release',{exact:true}).waitFor();
    const request=await app.evaluate(()=>globalThis.readingProbe.requests.at(-1));
    assert.deepEqual(request,{file:'docs/use.md',ref:'release'});
    await page.getByRole('button',{name:'返回文档',exact:true}).click();
    await page.getByRole('heading',{name:'A readable skill library',exact:true}).waitFor();
    await app.evaluate(()=>{globalThis.readingProbe.offline=true;});
    await language.selectOption('abc123:README.ja.md');
    await page.getByRole('button',{name:'重新读取',exact:true}).waitFor();
    await page.getByRole('heading',{name:'A readable skill library',exact:true}).waitFor();
    await page.getByText('暂时保留上次读到的内容。',{exact:true}).waitFor();
    await app.evaluate(()=>{globalThis.readingProbe.offline=false;});
    await page.getByRole('button',{name:'重新读取',exact:true}).click();
    await page.getByRole('heading',{name:'スキルを整理する',exact:true}).waitFor();
    await language.selectOption('abc123:README.zh-CN.md');
    await page.getByRole('heading',{name:'清晰管理你的技能',exact:true}).waitFor();
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(920,740));
    await page.screenshot({path:path.join(run,'repository-reading-chinese-narrow.png')});
    const overflow=await page.locator('.repository-document').evaluate(el=>el.scrollWidth>el.clientWidth+1);
    assert.equal(overflow,false);assert.equal(await app.evaluate(()=>globalThis.readingProbe.external),0);
    assert.deepEqual(errors,[]);console.log('仓库多语言阅读：'+run);
  }catch(error){await page.screenshot({path:path.join(run,'repository-reading-failure.png')});console.error(run);throw error;}
  finally{await dispose(app);}
});
