const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {launch}=require('./fixture.cjs');

test('isolated Electron: native create/edit, complete skill, rejection and navigation', {timeout:180000},async()=>{
  const {app,page,workspace,run,errors}=await launch();
  try{
    await page.getByRole('button',{name:'新建模式',exact:true}).first().click();
    await page.getByRole('textbox',{name:'模式名称',exact:true}).fill('验收模式');
    await page.locator('.graph-pane-skills').getByRole('button',{name:'加入 Product analysis',exact:true}).click();
    await page.locator('.mode-workspace-native g.node').waitFor();
    await page.getByRole('button',{name:'撤销',exact:true}).click();
    assert.equal(await page.locator('.graph-skill-group').filter({hasText:'当前'}).count(),0);
    await page.getByRole('button',{name:'重做',exact:true}).click();
    await page.locator('.mode-workspace-native g.node').waitFor();
    page.removeAllListeners('dialog');page.on('dialog',dialog=>dialog.dismiss());
    let leavePrompts=0;
    page.removeAllListeners('dialog');page.on('dialog',dialog=>{leavePrompts++;return dialog.dismiss();});
    await page.locator('.mode-workspace-native .mermaid-edit').click({button:'right',position:{x:8,y:8}});
    await page.getByRole('menuitem',{name:'添加技能',exact:true}).click();
    await page.getByRole('menuitem',{name:'Source research',exact:true}).click();
    assert.equal(leavePrompts,0,'画板菜单不是离开编辑页');
    await page.locator('.mode-workspace-native g.node').filter({hasText:'Source research'}).waitFor();
    await page.locator('.editor-page-heading').getByRole('button',{name:'返回',exact:true}).click();
    assert.equal(await page.getByRole('textbox',{name:'模式名称',exact:true}).inputValue(),'验收模式');
    page.removeAllListeners('dialog');page.on('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'保存',exact:true}).click();
    await page.locator('.editor-page').waitFor({state:'detached',timeout:60000});
    await page.locator('.architecture-section .mermaid-drawing svg').waitFor();
    const modes=await fs.readdir(path.join(workspace,'modes'));
    const id=modes.find(id=>id.startsWith('mode-'));assert.ok(id);
    const file=path.join(workspace,'modes',id,'MODE.md');
    assert.match(await fs.readFile(file,'utf8'),/```mermaid/);
    await page.locator('.architecture-section g.node[role=button]').first().click();
    await page.locator('.skill-canvas-panel .markdown-content').waitFor();
    assert.equal(await page.locator('.skill-file-panel').count(),0);
    await page.getByRole('button',{name:'技能逻辑架构',exact:true}).click();
    await page.getByRole('button',{name:'编辑模式',exact:true}).click();
    await page.getByRole('tab',{name:'文档',exact:true}).click();
    await page.locator('.mode-workspace-document-toolbar').getByRole('button',{name:'编辑',exact:true}).click();
    const editor=page.getByRole('textbox',{name:'模式说明',exact:true});
    const before=await fs.readFile(file,'utf8');
    await editor.fill('```mermaid\nnot-a-diagram\n```');
    await page.getByRole('button',{name:'保存',exact:true}).click();
    await page.locator('.graph-notice').waitFor();
    assert.equal(await fs.readFile(file,'utf8'),before,'坏图不能写入');
    await editor.fill('## 协作\n\n```mermaid\nsequenceDiagram\n participant skill_product_analysis as 分析\n participant skill_source_research as 检索\n skill_product_analysis->>skill_source_research: 核对材料\n```');
    await page.getByRole('button',{name:'保存',exact:true}).click();
    await page.locator('.editor-page').waitFor({state:'detached',timeout:60000});
    await page.locator('svg[aria-roledescription="sequence"]').waitFor();
    assert.match(await fs.readFile(file,'utf8'),/sequenceDiagram/);
    await page.screenshot({path:path.join(run,'native-sequence.png')});
    for(const [type,source] of [
      ['stateDiagram','stateDiagram-v2\n state "分析" as skill_product_analysis\n state "检索" as skill_source_research\n skill_product_analysis --> skill_source_research: 核对'],
      ['mindmap','mindmap\n skill_product_analysis((分析))\n  skill_source_research[检索]'],
    ]){
      await page.getByRole('button',{name:'编辑模式',exact:true}).click();
      await page.getByRole('tab',{name:'文档',exact:true}).click();
      await page.locator('.mode-workspace-document-toolbar').getByRole('button',{name:'编辑',exact:true}).click();
      await page.getByRole('textbox',{name:'模式说明',exact:true}).fill('技能协作。\n\n## 协作\n\n```mermaid\n'+source+'\n```');
      await page.getByRole('button',{name:'保存',exact:true}).click();
      await page.locator('.editor-page').waitFor({state:'detached',timeout:60000});
      await page.locator('.architecture-section .mermaid-drawing svg').waitFor();
      assert.ok((await fs.readFile(file,'utf8')).includes(source));
      await page.locator('.architecture-section g[data-asl-node="skill_product_analysis"],.architecture-section g[id*="state-skill_product_analysis-"]').first().click();
      await page.locator('.skill-canvas-panel .markdown-content').waitFor();
      await page.getByRole('button',{name:'技能逻辑架构',exact:true}).click();
      await page.locator('.skill-canvas-graph').evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
      await page.screenshot({path:path.join(run,'native-'+type+'.png')});
    }
    await page.getByRole('button',{name:'工作模式',exact:true}).first().click();
    await page.locator('.mode-library-overview').waitFor();
    const legacyFile=path.join(workspace,'modes/creator-studio/MODE.md'),legacyBefore=await fs.readFile(legacyFile,'utf8');
    await page.locator('.source-tree button').filter({hasText:'Creator Studio'}).first().click();
    await page.getByRole('button',{name:'编辑模式',exact:true}).click();
    await page.locator('.diagram-edit-toolbar').getByRole('button',{name:'通用能力',exact:true}).click();
    assert.equal(await page.getByRole('tab',{name:/通用能力/}).getAttribute('aria-selected'),'true','选图时归属同步');
    await page.getByRole('tab',{name:/产品分析示例/}).click();
    assert.equal(await page.locator('.diagram-edit-toolbar .active').innerText(),'产品分析示例','选归属时图同步');
    await page.locator('.editor-page-heading').getByRole('button',{name:'返回',exact:true}).click();
    assert.equal(await fs.readFile(legacyFile,'utf8'),legacyBefore,'仅打开旧格式不能写入转换');
    assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(run,'result.json'),JSON.stringify({ok:true,checks:['create-native','undo-redo','context-add','draft-guard','save-readback','skill-focus','bad-diagram-rejected','sequence-source-edit','state-source-edit','mindmap-source-edit','back-to-library','legacy-scope-navigation','legacy-open-no-write'],errors},null,2));
    console.log('验收证据：'+run);
  }catch(error){await page.screenshot({path:path.join(run,'failure.png')});console.error('验收证据：'+run,errors);throw error;}
  finally{await page.close();await app.close();}
});
