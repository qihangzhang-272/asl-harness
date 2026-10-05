const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {launch}=require('./fixture.cjs');
const {runCore}=require('../bridge.cjs');

test('flow nodes follow the pointer; ports snap, edges delete, and geometry round-trips',{timeout:240000},async()=>{
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'asl-direct-canvas-')),library=path.join(output,'library');
 await fs.cp(path.join(__dirname,'../../examples/personal-environment'),library,{recursive:true});
 const file=path.join(library,'modes/creator-studio/MODE.md');
 await fs.appendFile(file,'\n## 直接操作验收\n\n```mermaid\nflowchart LR\n company[公司画像]\n pitch[投行推介材料]\n company -->|事实| pitch\n```\n');
 const {app,page,run,workspace,errors}=await launch({library,output});
 const {diagramsIn,readLayout,flowchartItems}=await import('../src/mermaid-document.mjs');
 const node=id=>page.locator(`.architecture-section g.node[data-canvas-node="${id}"]`);
 const ready=()=>page.waitForFunction(()=>!document.querySelector('.mermaid-viewport[inert],.mermaid-edit[aria-busy="true"]'));
 const diagram=async()=>diagramsIn(await fs.readFile(file,'utf8')).find(d=>d.title==='直接操作验收').source;
 const center=async locator=>{const r=await locator.boundingBox();assert.ok(r);return {x:r.x+r.width/2,y:r.y+r.height/2};};
 async function drag(id,dx,dy,cancel=false,rejected=false){
  const el=node(id);await el.scrollIntoViewIfNeeded();const before=await center(el),startPath=await page.locator('path.flowchart-link').first().getAttribute('d');
  await page.mouse.move(before.x,before.y);await page.mouse.down();await page.mouse.move(before.x+dx,before.y+dy,{steps:12});
  const during=await center(el);assert.ok(Math.abs(during.x-before.x-dx)<1&&Math.abs(during.y-before.y-dy)<1,'拖动实时跟手，包含缩放换算');
  assert.notEqual(await page.locator('path.flowchart-link').first().getAttribute('d'),startPath,'关联连线随动');
  if(cancel)await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await page.mouse.up();await ready();
  const after=await center(el),expected=cancel||rejected?before:during;
  assert.ok(Math.abs(after.x-expected.x)<1&&Math.abs(after.y-expected.y)<1,'取消还原；保存不能跳动');
 }
 async function connect(from,to,sourceId='company',targetId='pitch'){
  await node(sourceId).hover();const a=await center(node(sourceId).locator(`[data-port="${from}"]`)),b=await center(node(targetId).locator(`[data-port="${to}"]`));
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x+7,b.y+5,{steps:12});
  assert.equal(await page.locator('.is-snapped').getAttribute('data-port'),to,'靠近目标就吸附，不要求压中圆点');
  const tip=await page.locator('.mermaid-connection-preview').evaluate(p=>{const at=p.getPointAtLength(p.getTotalLength()).matrixTransform(p.getScreenCTM());return {x:at.x,y:at.y};});
  assert.ok(Math.hypot(tip.x-b.x,tip.y-b.y)<1,'预览终点对准端口');await page.mouse.up();await ready();
  const source=await diagram(),model=flowchartItems(source),layout=readLayout(source);
  assert.deepEqual(layout.edges[model.edges.at(-1).renderId],{from,to});
  return model.edges.at(-1).renderId;
 }
 try{
  await page.locator('.source-tree button').filter({hasText:'Creator Studio'}).first().click();
  await page.getByRole('tab',{name:'直接操作验收',exact:true}).click();await node('company').waitFor();await ready();
  await drag('company',40,55);const saved=await diagram();
  await drag('company',30,-20,true);assert.equal(await diagram(),saved,'取消不得写入');
  if(process.platform==='win32'){
   await fs.chmod(file,0o444);
   try{await drag('company',20,20,false,true);assert.equal(await diagram(),saved,'写入失败不改原文');await page.locator('.mermaid-edit [role=alert]').waitFor();}
   finally{await fs.chmod(file,0o666);}
  }
  await page.getByRole('button',{name:'缩小图',exact:true}).click();await drag('company',28,20);
  await page.getByRole('button',{name:'全屏编辑画板',exact:true}).click();await ready();
  const connected=await connect('top','top');
  const pathSelector=`.architecture-section path.flowchart-link[data-id="${connected}"]`;
  // Fit exposes the complete arch before targeting its actual rendered stroke.
  await page.getByRole('button',{name:'适应宽度',exact:true}).click();await ready();
  const line=page.locator(pathSelector);await line.waitFor();
  const point=await line.evaluate(p=>{const at=p.getPointAtLength(p.getTotalLength()/2).matrixTransform(p.getScreenCTM());return {x:at.x,y:at.y};});
  await page.mouse.click(point.x,point.y+4,{button:'right'});
  await page.getByRole('menuitem',{name:'删除连线',exact:true}).click();await ready();
  assert.equal(flowchartItems(await diagram()).edges.length,1);assert.ok((await diagram()).includes('|事实|'),'只删除选中平行边');
  await connect('right','bottom');
  const beforeReload=readLayout(await diagram());await page.reload();await node('company').waitFor();await ready();
  assert.deepEqual(readLayout(await diagram()),beforeReload);
  const geometry=await node('company').evaluate(el=>{const svg=el.closest('svg'),box=el.querySelector('rect').getBBox();const p=new DOMPoint(box.x+box.width/2,box.y+box.height/2).matrixTransform(svg.getCTM().inverse().multiply(el.getCTM()));return {x:p.x,y:p.y};});
  assert.ok(Math.hypot(geometry.x-beforeReload.nodes.company.x,geometry.y-beforeReload.nodes.company.y)<1,'重开还原保存的位置');
  await page.screenshot({path:path.join(run,'direct-canvas.png')});
  await page.getByRole('button',{name:'全屏编辑画板',exact:true}).click();await ready();
  const company=await center(node('company')),pitch=await center(node('pitch'));
  await drag('pitch',0,company.y-pitch.y);
  const parallel=await connect('right','left');
  const midpoint=async id=>page.locator(`path.flowchart-link[data-id="${id}"]`).evaluate(p=>{const at=p.getPointAtLength(p.getTotalLength()/2).matrixTransform(p.getScreenCTM());return {x:at.x,y:at.y};});
  const firstPoint=await midpoint('L_company_pitch_0'),otherPoint=await midpoint(parallel);
  assert.ok(Math.hypot(firstPoint.x-otherPoint.x,firstPoint.y-otherPoint.y)>18,'同排平行线不能共线');
  await page.mouse.click(firstPoint.x,firstPoint.y,{button:'right'});await page.getByRole('menuitem',{name:'删除连线',exact:true}).click();await ready();
  assert.ok(!(await diagram()).includes('|事实|'),'命中第一条不能误删最后一条');
  await connect('bottom','left');await connect('left','left');
  const reverse=await connect('left','right','pitch','company');
  const forwardPoint=await midpoint(flowchartItems(await diagram()).edges[0].renderId),reversePoint=await midpoint(reverse);
  assert.ok(Math.hypot(forwardPoint.x-reversePoint.x,forwardPoint.y-reversePoint.y)>18,'反向边也必须独立可选');
  const core=process.env.ASL_TEST_EXE?{executable:path.join(path.dirname(process.env.ASL_TEST_EXE),'resources/core/asl-harness.exe')}:{};
  const mode=(await runCore('catalog',{workspace},core)).modes.find(m=>m.id==='creator-studio');
  const invalid=mode.document.replace(/%% asl-layout [^\r\n]+/,'%% asl-layout {"nodes":{"foreign":{"x":0,"y":0}},"edges":{}}');
  const before=await fs.readFile(file,'utf8');
  await assert.rejects(runCore('edit',{workspace,request:{operation:'mode.save',id:mode.id,expected:mode.fingerprint,document:invalid,skills:mode.roots},apply:true},core));
  assert.equal(await fs.readFile(file,'utf8'),before,'CLI 渲染门控拒绝坏布局，不污染原文');
  assert.deepEqual(errors,[]);console.log('直接操作验收：'+run);
 }catch(error){console.error(run,errors);await page.screenshot({path:path.join(run,'failure.png')});throw error;}
 finally{await app.close();}
});
