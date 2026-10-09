const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const {execFile}=require('node:child_process');
const {launch,packagedCore,dispose}=require('./fixture.cjs');

test('packaged App and its native CLI share the real Mermaid write gate',{timeout:120000},async t=>{
  assert.equal(typeof dispose,'function','isolated tests need one safe disposal path');
  assert.ok(process.env.ASL_TEST_EXE,'Set ASL_TEST_EXE to the packaged native App');
  const {app,page,workspace,run}=await launch();
  const child=app.process();
  t.after(()=>dispose(app));
  const native=packagedCore(),programs=[];
  const runtime=await app.evaluate(({app})=>({packaged:app.isPackaged,executable:process.execPath,resources:process.resourcesPath}));
  console.log('[packaged-renderer] runtime '+JSON.stringify({...runtime,native}));
  await app.evaluate(()=>{
    globalThis.aslRendererPrograms=[];
    const {ChildProcess}=process.getBuiltinModule('node:child_process'),spawn=ChildProcess.prototype.spawn;
    ChildProcess.prototype.spawn=function(options){
      globalThis.aslRendererPrograms.push({program:options.file,args:options.args,cwd:options.cwd});
      return spawn.call(this,options);
    };
  });
  const catalog=await page.evaluate(workspace=>window.asl.run('catalog',{workspace}),workspace);
  programs.push(...await app.evaluate(()=>globalThis.aslRendererPrograms.splice(0)));
  console.log('[packaged-renderer] catalog '+JSON.stringify({ok:catalog.ok,error:catalog.error,code:catalog.code,details:catalog.details,programs}));
  assert.equal(runtime.packaged,true,'native App must not select the development Python runtime');
  assert.ok(catalog.ok,JSON.stringify(catalog));
  assert.ok(programs.some(entry=>path.resolve(entry.program)===path.resolve(native)),'App must invoke its bundled CLI');
  const mode=catalog.value.modes[0],file=path.join(workspace,'modes',mode.id,'MODE.md');
  const before=await fs.readFile(file),view=await fs.readFile(path.join(workspace,'WORKSPACE.md'));
  const reports=[];
  for(const [kind,diagram] of [['valid','flowchart LR\n A[资料] --> B[判断]'],['invalid','flowchart LR\n A -->[']]){
    const request={operation:'mode.save',id:mode.id,expected:mode.fingerprint,skills:mode.roots,document:'# 验收\n\n```mermaid\n'+diagram+'\n```\n'};
    const external=await new Promise(resolve=>{
      const child=execFile(native,['environment.edit','--workspace',workspace,'--check'],{timeout:55000,windowsHide:true,encoding:'utf8'},(error,stdout,stderr)=>{
        try{resolve({exitCode:error?.code??0,report:JSON.parse(stdout),stderr});}
        catch{resolve({exitCode:error?.code??0,stdout,stderr});}
      });
      child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(request));
    });
    const internal=await page.evaluate(({workspace,request})=>window.asl.run('edit',{workspace,request,apply:false}),{workspace,request});
    const calls=await app.evaluate(()=>globalThis.aslRendererPrograms.splice(0));
    const evidence={kind,external,internal,programs:calls};reports.push(evidence);
    console.log('[packaged-renderer] '+JSON.stringify(evidence));
  }
  await fs.writeFile(path.join(run,'packaged-renderer.json'),JSON.stringify({runtime,native,reports},null,2));
  assert.deepEqual(await fs.readFile(file),before,'check-only requests must preserve the Mode');
  assert.deepEqual(await fs.readFile(path.join(workspace,'WORKSPACE.md')),view,'check-only requests must preserve its generated view');
  assert.equal(reports[0].external.report?.ok,true,JSON.stringify(reports[0].external));
  assert.equal(reports[0].internal.ok,true,JSON.stringify(reports[0].internal));
  assert.equal(reports[0].external.report.diagrams.rendered,1);
  assert.equal(reports[0].internal.value.diagrams.rendered,1);
  assert.equal(reports[1].external.report?.error?.code,'MERMAID_RENDER_FAILED',JSON.stringify(reports[1].external));
  assert.equal(reports[1].internal.code,'MERMAID_RENDER_FAILED',JSON.stringify(reports[1].internal));
  // Leave a real draft: disposal must not invoke the native unsaved-content confirmation.
  await page.getByRole('button',{name:'新建模式',exact:true}).first().click();
  await page.getByRole('textbox',{name:'模式名称',exact:true}).fill('只用于验证退出的草稿');
  await dispose(app);
  assert.ok(child.exitCode!==null||child.signalCode!==null);
  console.log('[packaged-renderer] disposed isolated draft '+run);
});
