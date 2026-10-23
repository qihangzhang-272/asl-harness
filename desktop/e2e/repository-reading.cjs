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
      const english='# A readable skill library\n\n[中文](README.zh-CN.md) · [Other version]('+url+'/blob/release/docs/use.md) · [Slash branch]('+url+'/blob/feature/readme/docs/README.md)\n\nRead the original instructions here.';
      globalThis.readingProbe={external:0,requests:[],offline:false};
      const document=(file,ref='abc123')=>({file,url:url+'/blob/'+ref+'/'+file,text:file==='README.zh-CN.md'?'# 清晰管理你的技能\n\n这是作者提供的中文说明。\n\n[其他版本]('+url+'/blob/release/docs/use.md)':file==='README.en.md'?english:file==='README.ja.md'?'# スキルを整理する':'# Release instructions\n\nThis is the requested release, not the preview.'});
      ipcMain.removeHandler('asl:github-skills');ipcMain.handle('asl:github-skills',()=>({ok:true,value:{repository:url,snapshot:'isolated-snapshot',commit:'abc123',modes:[],skills:[],repositoryFiles:['README.md','README.en.md','README.zh-CN.md','README.ja.md'],readme:{file:'README.md',url:url+'/blob/abc123/README.md',text:english}}}));
      ipcMain.removeHandler('asl:repository-overview');ipcMain.handle('asl:repository-overview',async(_event,_url,value)=>{
        if(!value)return {ok:true,value:null};
        globalThis.readingProbe.requests.push(value);
        if(value.ref==='feature')return{ok:true,value:await require('./repository-import.cjs').readOverview(_url,async endpoint=>{
          if(endpoint.endsWith('/commits/feature%2Freadme'))return{ok:true,text:async()=>JSON.stringify({sha:'b'.repeat(40)})};
          if(endpoint.endsWith('/contents/docs/README.md?ref='+'b'.repeat(40)))return{ok:true,text:async()=>JSON.stringify({path:'docs/README.md',html_url:url+'/blob/'+'b'.repeat(40)+'/docs/README.md',content:Buffer.from('# Slash branch instructions').toString('base64'),encoding:'base64'})};
          if(endpoint.endsWith('/contents/readme/docs/README.md?ref=feature'))return{ok:true,text:async()=>JSON.stringify({path:'readme/docs/README.md',html_url:url+'/blob/feature/readme/docs/README.md',content:Buffer.from('# Wrong branch instructions').toString('base64'),encoding:'base64'})};
          return{ok:false,status:404};
        },undefined,value)};
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
    await page.getByRole('link',{name:'Slash branch',exact:true}).click();
    await page.getByRole('heading',{name:'Slash branch instructions',exact:true}).waitFor();
    await page.getByText('其他版本 · feature/readme',{exact:true}).waitFor();
    assert.equal(await page.getByRole('heading',{name:'Wrong branch instructions',exact:true}).count(),0);
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

for(const explicit of [false,true])test(`finishing the repository snapshot preserves ${explicit?'an explicit version':'the selected preview document'} and reading position`,{timeout:90000},async()=>{
  const {app,page,run,errors}=await launch();
  const url='https://github.com/qa/early-reader',commit='c'.repeat(40);
  try{
    await app.evaluate(async({app,ipcMain},{url,commit})=>{
      const path=process.getBuiltinModule('node:path');
      const require=process.getBuiltinModule('node:module').createRequire(path.join(app.getAppPath(),'package.json'));
      await require('./library.cjs').updatePreferences(path.join(app.getPath('userData'),'libraries.json'),state=>({...state,repositories:[url]}));
      const text='# 仓库介绍\n\n[使用说明](docs/use.md) · [另一版本]('+url+'/blob/release/docs/release.md)';
      globalThis.earlyReading={requests:[]};
      const document=(file,ref)=>({file,ref,url:url+'/blob/'+ref+'/'+file,text:'# '+(file==='docs/use.md'?'使用说明':'版本说明')+'\n\n'+Array.from({length:70},(_,i)=>'阅读段落 '+i+'：保留正在查看的资料。').join('\n\n')});
      const report={repository:url,snapshot:'early-snapshot',commit,modes:[],skills:[],repositoryFiles:['README.md','docs/use.md'],readme:{file:'README.md',url:url+'/blob/'+commit+'/README.md',text}};
      const pending=new Promise(resolve=>{globalThis.releaseEarlyReading=()=>resolve({ok:true,value:report});});
      ipcMain.removeHandler('asl:github-skills');ipcMain.handle('asl:github-skills',()=>pending);
      const read=ipcMain._invokeHandlers.get('asl:read');ipcMain.removeHandler('asl:read');
      ipcMain.handle('asl:read',(event,id,method,args)=>method==='repositoryOverview'?{ok:true,value:{file:'README.md',url:url+'/blob/main/README.md',text}}:read(event,id,method,args));
      ipcMain.removeHandler('asl:repository-overview');ipcMain.handle('asl:repository-overview',(_event,_url,route)=>{
        globalThis.earlyReading.requests.push({file:route.file,ref:route.ref});
        return{ok:true,value:document(route.file,route.ref)};
      });
      ipcMain.removeHandler('asl:repository-document');ipcMain.handle('asl:repository-document',(_event,_root,file)=>{
        globalThis.earlyReading.requests.push({file,ref:commit});return{ok:true,value:document(file,commit)};
      });
    },{url,commit});
    await page.reload();await page.locator('.cloud-source>.source-heading').click();
    await page.getByRole('heading',{name:'仓库介绍',exact:true}).waitFor();
    await page.getByRole('link',{name:explicit?'另一版本':'使用说明',exact:true}).click();
    const heading=page.getByRole('heading',{name:explicit?'版本说明':'使用说明',exact:true});
    await heading.waitFor();
    const scroll=()=>page.locator('.repository-document').evaluate(reader=>{let el=reader;while(el&&!['auto','scroll'].includes(getComputedStyle(el).overflowY))el=el.parentElement;return el?.scrollTop||0;});
    await page.locator('.repository-document').evaluate(reader=>{let el=reader;while(el&&!['auto','scroll'].includes(getComputedStyle(el).overflowY))el=el.parentElement;el.scrollTop=960;el.dispatchEvent(new Event('scroll'));});
    const beforeScroll=await scroll();
    const beforeTop=await heading.evaluate(el=>el.getBoundingClientRect().top);
    assert.ok(beforeScroll>=900,'the probe must start away from the top');
    await app.evaluate(()=>globalThis.releaseEarlyReading());
    await page.getByRole('button',{name:'查看 0 个技能',exact:true}).waitFor();
    await heading.waitFor({timeout:4000});
    assert.ok(Math.abs(await heading.evaluate(el=>el.getBoundingClientRect().top)-beforeTop)<8,'loading placeholders can change scrollTop, but the same content must stay at the same visible position');
    const requests=await app.evaluate(()=>globalThis.earlyReading.requests);
    assert.equal(requests.at(-1).ref,explicit?'release':commit,'only preview-relative links follow the inspected snapshot');
    if(explicit)await page.getByText('其他版本 · release',{exact:true}).waitFor();
    else assert.equal(await page.locator('.repository-document-version').count(),0);
    await page.reload();await page.locator('.cloud-source>.source-heading').click();
    await heading.waitFor();
    assert.ok(Math.abs(await heading.evaluate(el=>el.getBoundingClientRect().top)-beforeTop)<8,'reopen must restore the same document and reading position');
    await page.getByRole('button',{name:'返回文档',exact:true}).click();
    await page.getByRole('heading',{name:'仓库介绍',exact:true}).waitFor();
    await page.screenshot({path:path.join(run,'early-reader-handoff.png')});
    assert.deepEqual(errors,[]);console.log('介绍与快照衔接：'+run);
  }catch(error){await page.screenshot({path:path.join(run,'early-reader-failure.png')});console.error(run);throw error;}
  finally{await dispose(app);}
});
