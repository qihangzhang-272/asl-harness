const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {launch,packagedCore,dispose}=require('./fixture.cjs');
const {runCore}=require('../bridge.cjs');

test('canvas templates and structure can be created and edited without source or modifier keys',{timeout:240000},async()=>{
  const {app,page,workspace,run,errors}=await launch();
  const file=path.join(workspace,'modes/creator-studio/MODE.md');
  const original=await fs.readFile(file,'utf8');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1024,720));
  async function ready(){await page.waitForFunction(()=>!document.querySelector('.mode-workspace-native [aria-busy="true"],.mode-workspace-native .mermaid-viewport[inert]'));}
  async function blank(button='left',selector='.mode-workspace-native .mermaid-edit'){
    const canvas=page.locator(selector);await canvas.scrollIntoViewIfNeeded();
    const point=await canvas.evaluate(element=>{
      const box=element.getBoundingClientRect(),viewport=element.querySelector('.mermaid-viewport').getBoundingClientRect();
      const toolbar=element.closest('.mode-workspace-native')?.querySelector('.diagram-edit-toolbar')?.getBoundingClientRect();
      return {x:Math.max(box.left,viewport.left)+8,y:Math.max(box.top,viewport.top,toolbar?.bottom||0)+12};
    });
    assert.ok(await page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('.mermaid-edit'),point),'落点必须在可见画板内');
    await page.mouse.click(point.x,point.y,{button});
  }
  async function menu(){await ready();await blank('right');}
  async function create(title){await menu();await page.getByRole('menuitem',{name:'新建图表',exact:true}).click();await page.getByRole('menuitem',{name:title,exact:true}).click();await page.locator('.mode-workspace-native .diagram-edit-toolbar button.active').filter({hasText:title}).waitFor();await page.locator('.mode-workspace-native .mermaid-drawing>svg').waitFor();await ready();}
  async function edit(node,text){await node.dblclick();await page.locator('.mermaid-label-editor [role=textbox]').fill(text);await blank();await page.locator('.mermaid-label-editor').waitFor({state:'detached'});}
  async function drag(from,to,x=.5,y=.5){
    await from.scrollIntoViewIfNeeded();const a=await from.boundingBox(),b=await to.boundingBox();
    const target={x:b.x+b.width*x,y:b.y+b.height*y};
    const hit=await to.evaluate((element,{x,y})=>element.contains(document.elementFromPoint(x,y)),target);
    assert.ok(hit,'拖拽落点必须在目标元素的可见区域：'+JSON.stringify({a,b,target}));
    await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width*x,b.y+b.height*y,{steps:16});await page.mouse.up();
  }
  try {
    await page.locator('.source-tree button').filter({hasText:'Creator Studio'}).first().click();
    await page.getByRole('button',{name:'编辑模式',exact:true}).click();
    await create('时序图');
    await edit(page.locator('text.messageText').filter({hasText:'提交材料'}),'复核资料');
    const messageBox=await page.locator('[data-et="message"]').first().boundingBox();
    await page.mouse.click(messageBox.x+messageBox.width/2,messageBox.y+5,{button:'right'});
    await page.getByRole('menuitem',{name:'修改备注',exact:true}).click();
    await page.locator('.mermaid-label-editor [role=textbox]').fill('复核资料');
    await blank();
    await page.locator('g[data-et="participant"][data-id="A"]').first().click({button:'right'});
    await page.getByRole('menuitem',{name:'发送消息',exact:true}).click();
    await page.locator('g[data-et="participant"][data-id="B"]').first().click();
    await page.locator('text.messageText').filter({hasText:'消息'}).waitFor();
    await page.locator('text.messageText').filter({hasText:'消息'}).click({button:'right'});
    await page.getByRole('menuitem',{name:'添加条件',exact:true}).click();
    await page.locator('text.loopText').filter({hasText:'条件成立'}).waitFor();
    await ready();
    await page.getByRole('button',{name:'缩小图',exact:true}).click();
    await page.getByRole('button',{name:'缩小图',exact:true}).click();
    await drag(page.locator('text.loopText').filter({hasText:'条件成立'}),page.locator('text.messageText').filter({hasText:'复核资料'}),.5,.1);
    await ready();
    await page.locator('text.loopText').filter({hasText:'条件成立'}).click({button:'right'});
    await page.getByRole('menuitem',{name:'添加分支',exact:true}).click();
    await page.locator('text.sectionTitle').filter({hasText:'其他情况'}).waitFor();
    await page.locator('text.sectionTitle').filter({hasText:'其他情况'}).click({button:'right'});
    await page.getByRole('menuitem',{name:'移除分支及内容',exact:true}).click();
    await page.locator('text.sectionTitle').filter({hasText:'其他情况'}).waitFor({state:'detached'});
    await menu();await page.getByRole('menuitem',{name:'添加参与者',exact:true}).click();
    const participant=page.locator('g[data-et="participant"][data-id="node1"]');await participant.waitFor();
    await participant.click({button:'right'});await page.getByRole('menuitem',{name:'添加备注',exact:true}).click();
    await edit(page.locator('text.noteText').filter({hasText:'备注'}),'新的备注');
    await page.locator('text.messageText').filter({hasText:'复核资料'}).click({button:'right'});
    await page.getByRole('menuitem',{name:'更换接收者',exact:true}).click();await participant.click();
    await page.locator('[data-et="message"][data-from="A"][data-to="node1"]').waitFor({state:'attached'});await ready();
    await participant.click({button:'right'});await page.getByRole('menuitem',{name:'移除参与者及关联内容',exact:true}).click();
    await participant.waitFor({state:'detached'});
    assert.equal(await page.locator('text.messageText').filter({hasText:'复核资料'}).count(),0);
    assert.equal(await page.locator('text.noteText').filter({hasText:'新的备注'}).count(),0);
    await page.getByRole('button',{name:'撤销',exact:true}).click();await participant.waitFor();
    await page.screenshot({path:path.join(run,'sequence-mouse.png')});
    await create('思维导图');
    const node=id=>page.locator(`g.node[data-asl-node="${id}"]`);
    await drag(node('output'),node('research'),.5,.05);
    await menu();await page.getByRole('menuitem',{name:'添加节点',exact:true}).click();
    await page.locator('.mermaid-drawing [aria-label="新节点"]').waitFor();
    await page.getByRole('button',{name:'撤销',exact:true}).click();
    await page.locator('.mermaid-drawing [aria-label="新节点"]').waitFor({state:'detached'});
    await page.getByRole('button',{name:'重做',exact:true}).click();
    await page.locator('.mermaid-drawing [aria-label="新节点"]').waitFor();
    await page.screenshot({path:path.join(run,'mindmap-mouse.png')});
    await create('流程图');
    await menu();await page.getByRole('menuitem',{name:'添加节点',exact:true}).click();
    await edit(page.locator('.mermaid-drawing [aria-label="新节点"]'),'补充证据');
    await page.getByRole('button',{name:'全屏编辑画板',exact:true}).click();
    const flow=id=>page.locator(`g.node[data-canvas-node="${id}"]`);
    await drag(flow('node1'),flow('work'),.5,.1);await ready();
    await menu();await page.getByRole('menuitem',{name:'纵向排列',exact:true}).click();await ready();
    await flow('node1').hover();
    await drag(flow('node1').locator('.mermaid-port').nth(1),flow('result'));await ready();
    await page.getByRole('button',{name:'退出全屏画板',exact:true}).click();
    await page.getByRole('button',{name:'保存',exact:true}).click();
    await page.locator('.editor-page').waitFor({state:'detached',timeout:60000});
    const saved=await fs.readFile(file,'utf8');
    for(const content of ['sequenceDiagram','mindmap','复核资料','补充证据','条件成立'])assert.ok(saved.includes(content),content);
    assert.ok(saved.replaceAll('\r\n','\n').includes(original.replaceAll('\r\n','\n').trim()),'原正文未丢失');
    assert.ok(saved.indexOf('output[表达]')<saved.indexOf('research[研究]'),'不用 Shift 调整同级顺序');
    assert.match(saved,/flowchart TD/);assert.match(saved,/node1 --> result/);
    assert.ok(saved.indexOf('alt 条件成立')<saved.indexOf(': 复核资料'),'整个条件组移动，不拆散分支');
    await page.reload();await page.locator('.architecture-section .mermaid-drawing>svg').waitFor({timeout:60000});
    await page.getByRole('tab',{name:'时序图',exact:true}).click();
    await page.locator('text.messageText').filter({hasText:'复核资料'}).waitFor();
    // A caller such as an Agent submits ordinary Mermaid through the real CLI.
    const core={executable:packagedCore()};
    const catalog=await runCore('catalog',{workspace},core),mode=catalog.modes.find(m=>m.id==='creator-studio');
    const document=mode.document+'\n## Agent 草稿\n\n```mermaid\nmindmap\n root((协作))\n  review[复核]\n  improve[改进]\n```\n';
    const request={operation:'mode.save',id:mode.id,expected:mode.fingerprint,skills:mode.roots,document};
    await runCore('edit',{workspace,request},core);
    assert.equal(await fs.readFile(file,'utf8'),saved,'CLI 预检不写盘');
    await runCore('edit',{workspace,request,apply:true},core);
    await page.getByRole('tab',{name:'Agent 草稿',exact:true}).click();
    const agentNode=page.locator('g.node[data-asl-node="review"]');
    await agentNode.dblclick();await page.locator('.mermaid-label-editor [role=textbox]').fill('用户复核');
    await blank('left','.architecture-section .mermaid-edit');
    await page.waitForFunction(()=>!document.querySelector('.mermaid-label-editor,.mermaid-viewport[inert]'));
    assert.ok((await fs.readFile(file,'utf8')).includes('review[用户复核]'),'Agent 草稿可由用户继续编辑');
    const beforeAppend=await fs.readFile(file,'utf8');
    await blank('right','.architecture-section .mermaid-edit');
    await page.getByRole('menuitem',{name:'新建图表',exact:true}).click();await page.getByRole('menuitem',{name:'流程图',exact:true}).click();
    await page.locator('.paradigm-tabs [aria-selected="true"]').filter({hasText:'流程图 2'}).waitFor();
    assert.ok((await fs.readFile(file,'utf8')).startsWith(beforeAppend),'阅读页新建追加而不覆盖已有图');
    const modeFolders=await fs.readdir(path.join(workspace,'modes'));
    await page.getByRole('button',{name:'新建模式',exact:true}).first().click();
    await create('时序图');
    await page.getByRole('button',{name:'取消',exact:true}).click();
    assert.deepEqual(await fs.readdir(path.join(workspace,'modes')),modeFolders,'空白 Mode 取消不创建文件');
    assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(run,'result.json'),JSON.stringify({ok:true,checks:['three-templates','inline-blur','message-connect-retarget','condition-add-drag','branch-add-remove','participant-note-add-remove','mindmap-sibling-drag','undo-redo','new-node','flow-drag-direction-connect','fullscreen','save-reopen','agent-cli-roundtrip','reading-append','empty-mode-cancel'],errors},null,2));
    console.log('鼠标画板验收：'+run);
  }catch(error){console.error(run,errors,error.stack);await page.screenshot({path:path.join(run,'failure.png')});await fs.writeFile(path.join(run,'failure.html'),await page.locator('body').innerHTML());throw error;}
  finally{await dispose(app);}
});
