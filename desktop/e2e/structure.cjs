const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {launch}=require('./fixture.cjs');

test('native diagrams edit in place and persist semantic drag, context actions and history', {timeout:180000},async()=>{
  const {app,page,workspace,run,errors}=await launch();
  const file=path.join(workspace,'modes/creator-studio/MODE.md');
  async function source(text){
    await page.getByRole('button',{name:'编辑模式',exact:true}).click();
    await page.getByRole('tab',{name:'文档',exact:true}).click();
    await page.locator('.mode-workspace-document-toolbar').getByRole('button',{name:'编辑',exact:true}).click();
    await page.getByRole('textbox',{name:'模式说明',exact:true}).fill('## 协作\n\n```mermaid\n'+text+'\n```');
    await page.getByRole('button',{name:'保存',exact:true}).click();
    await page.locator('.editor-page').waitFor({state:'detached',timeout:60000});
    await page.locator('.architecture-section .mermaid-drawing>svg').waitFor();
  }
  async function edit(locator,value){
    await locator.dblclick();
    const textbox=page.locator('.mermaid-label-editor [role=textbox]');await textbox.waitFor({timeout:2000});
    await textbox.fill(value);await textbox.press('Enter');
    await page.waitForFunction(()=>!document.querySelector('.mermaid-label-editor'),{},{timeout:30000});
    await savedMatches(new RegExp(value));
  }
  async function drag(from,to,relative={x:.5,y:.1}){
    await page.waitForFunction(()=>!document.querySelector('.mermaid-edit[aria-busy="true"],.mermaid-viewport[inert]'));
    await from.scrollIntoViewIfNeeded();
    const a=await from.boundingBox(),b=await to.boundingBox();
    await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
    await page.mouse.move(b.x+b.width*relative.x,b.y+b.height*relative.y,{steps:12});await page.mouse.up();
  }
  async function savedMatches(pattern){
    const deadline=Date.now()+30000;
    while(Date.now()<deadline){const text=await fs.readFile(file,'utf8');if(pattern.test(text))return text;await new Promise(resolve=>setTimeout(resolve,100));}
    assert.match(await fs.readFile(file,'utf8'),pattern);
  }
  try {
    await page.locator('.source-tree button').filter({hasText:'Creator Studio'}).first().click();
    await source('sequenceDiagram\n participant skill_product_analysis as 分析\n participant skill_source_research as 检索\n alt 有材料\n skill_product_analysis->>skill_source_research: 核对\n Note over skill_product_analysis,skill_source_research: 事实\n skill_source_research-->>skill_product_analysis: 返回\n else 材料不足\n skill_product_analysis->>skill_source_research: 补充\n end');
    await page.getByRole('button',{name:'放大图',exact:true}).click();
    await edit(page.locator('g[data-et="participant"][data-id="skill_product_analysis"]').first(),'产品分析');
    assert.ok(await page.locator('.mermaid-drawing').evaluate(el=>parseFloat(el.style.width)/el.querySelector('svg').viewBox.baseVal.width>1.1),'编辑后保留缩放');
    await edit(page.locator('text.messageText').filter({hasText:'核对'}),'核对来源');
    await edit(page.locator('text.noteText'),'事实与证据');
    await edit(page.locator('text.loopText').filter({hasText:'有材料'}),'证据齐备');
    await edit(page.locator('text.sectionTitle').filter({hasText:'材料不足'}),'继续检索');
    await drag(page.locator('text.messageText').filter({hasText:'返回'}),page.locator('text.messageText').filter({hasText:'核对来源'}));
    await page.waitForFunction(()=>document.querySelector('text.messageText')?.textContent==='返回');
    let saved=await fs.readFile(file,'utf8');assert.ok(saved.indexOf(': 返回')<saved.indexOf(': 核对来源'));
    await drag(page.locator('g[data-et="participant"][data-id="skill_source_research"]').first(),page.locator('g[data-et="participant"][data-id="skill_product_analysis"]').first(),{x:.1,y:.5});
    await savedMatches(/participant skill_source_research[\s\S]*participant skill_product_analysis/);
    await page.locator('text.noteText').click({button:'right'});
    await page.getByRole('menuitem',{name:'移除',exact:true}).click();
    await page.locator('text.noteText').waitFor({state:'detached'});
    assert.ok(!(await fs.readFile(file,'utf8')).includes('Note over'));
    await page.locator('.content>.read-status').waitFor({state:'detached',timeout:60000});
    await page.screenshot({path:path.join(run,'sequence-structure.png')});
    await source('mindmap\n root((协作))\n  skill_product_analysis[分析]\n  skill_source_research[检索]\n   evidence[证据]');
    await edit(page.locator('g.node[data-asl-node="evidence"]'),'证据资料');
    await drag(page.locator('g.node[data-asl-node="skill_source_research"]'),page.locator('g.node[data-asl-node="skill_product_analysis"]'),{x:.5,y:.5});
    await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'));
    // The file is the source of truth, not the transient SVG transform.
    await savedMatches(/\n    skill_source_research/);
    saved=await fs.readFile(file,'utf8');assert.match(saved,/\n     evidence\[证据资料\]/);
    await page.screenshot({path:path.join(run,'mindmap-structure.png')});
    await page.getByRole('button',{name:'编辑模式',exact:true}).click();
    const evidence=page.locator('.mode-workspace-native g.node[data-asl-node="evidence"]');
    await evidence.click({button:'right'});
    await page.getByRole('menuitem',{name:'移除分支',exact:true}).click();
    await evidence.waitFor({state:'detached'});
    await page.getByRole('button',{name:'撤销',exact:true}).click();
    await evidence.waitFor();
    await page.getByRole('button',{name:'重做',exact:true}).click();
    await evidence.waitFor({state:'detached'});
    await page.getByRole('button',{name:'保存',exact:true}).click();
    await page.locator('.editor-page').waitFor({state:'detached',timeout:60000});
    assert.ok(!(await fs.readFile(file,'utf8')).includes('evidence['));
    await source('stateDiagram-v2\n state "分析" as skill_product_analysis\n state "检索" as skill_source_research\n skill_product_analysis --> skill_source_research: 核对');
    await edit(page.locator('.architecture-section .mermaid-drawing g.node[id*="state-skill_product_analysis-"]'),'事实研究');
    await page.waitForFunction(()=>!document.querySelector('.mermaid-edit[aria-busy="true"],.mermaid-viewport[inert]'));
    await page.locator('.architecture-section .mermaid-drawing g.node[id*="state-skill_source_research-"]').click();
    await page.locator('.skill-canvas-panel .markdown-content').waitFor();
    await page.getByRole('button',{name:'技能逻辑架构',exact:true}).click();
    await page.locator('.skill-canvas-graph').evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
    await page.screenshot({path:path.join(run,'state-edit.png')});
    assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(run,'result.json'),JSON.stringify({ok:true,checks:['sequence-inline-labels','zoom-retained','message-drag','participant-drag','note-remove','mindmap-subtree-drag','mindmap-remove-undo-redo','state-inline-label','state-skill-open'],errors},null,2));
    console.log('结构编辑验收：'+run);
  }catch(error){console.error('结构编辑验收：'+run,errors);await page.screenshot({path:path.join(run,'structure-failure.png')});await fs.writeFile(path.join(run,'structure-failure.html'),await page.locator('body').innerHTML());throw error;}
  finally {await page.close();await app.close();}
});
