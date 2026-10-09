const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

// Exercise the actual IPC handlers. Native Windows dialogs are separately checked in the packaged App.
async function desktop(t, {missingDocuments=false,coreError=null,coreWait,repositoryReader,agentCalls,coreReply}={}) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "asl-ipc-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const directory = path.resolve(__dirname, "..");
  const localRequire = createRequire(path.join(directory, "main.cjs"));
  const handlers = new Map(), calls = [], events=new Map();
  let focused=0;
  const nativeEvents=new Map(),windowEvents=new Map();
  const webContents = { on(name,fn) {nativeEvents.set(name,fn);}, setWindowOpenHandler() {}, session: { setPermissionRequestHandler() {} } };
  let page;
  const dialog = {
    next: { canceled: true }, confirm: 0,
    async showOpenDialog(_window, options) { calls.push(options); return this.next; },
    async showSaveDialog(_window, options) { calls.push(options); return this.next; },
    async showMessageBox(_window,options) {calls.push(options);return { response: this.confirm }; },
    showMessageBoxSync(_window,options) {calls.push(options);return this.confirm;},
  };
  // Electron 44's clipboard is promise-based and only holds the text once writeText resolves;
  // a synchronous stand-in would hide that contract from every test below.
  // `drops` is how many incoming writes it silently loses.
  const clipboard = { text: '', writes: 0, reads: 0, drops: 0, fail: '',
    writeText(value) { this.writes++; return Promise.resolve().then(() => {
      if (this.fail) throw new Error(this.fail);
      if (this.drops > 0) { this.drops--; return; } this.text = value; }); },
    readText() { this.reads++; return Promise.resolve(this.text); } };
  const electron = {
    Menu: {choose:false,items:[],buildFromTemplate:items=>{electron.Menu.items=items;return {popup:options=>{if(electron.Menu.choose)items[0].click();options.callback();}};}},
    app: { isPackaged: false, whenReady: () => Promise.resolve(), on(name,fn) {events.set(name,fn);}, quit() {},
      commandLine:{hasSwitch:()=>true}, setName() {},setPath() {},getVersion:()=> '0.2.0',requestSingleInstanceLock:()=>true,
      getPath: name => {if(name==='documents'&&missingDocuments)throw new Error("Failed to get 'documents' path");return name === "documents" ? path.join(home, "missing", "Desktop") : home;} },
    BrowserWindow: class { constructor() { this.webContents = webContents; } on(name,fn){windowEvents.set(name,fn);} isMinimized(){return false;} show(){} focus(){focused++;} removeMenu() {} loadFile(file) { page = require("node:url").pathToFileURL(file).href; } },
    dialog, clipboard, ipcMain: { handle: (key, fn) => handlers.set(key, fn) }, shell: {}, net: {},
  };
  const executed = [];
  vm.runInNewContext(await fs.readFile(path.join(directory, "main.cjs"), "utf8"), {
    __dirname: directory, process: { ...process, argv: [] }, URL,
    require: name => name === "electron" ? electron : name === "./bridge.cjs"
      ? { ...localRequire(name), runCore: async (...args) => { executed.push(args); if(coreError)throw coreError; if(coreWait)await coreWait;return coreReply?coreReply(...args):{}; } }
      : name==='./assistant.cjs'&&agentCalls?{...localRequire(name),assistantInventory:async()=>[{id:'codex-app',name:'Codex CLI',available:true,executable:path.join(home,'codex.cmd')}],launchAssistant:async request=>{agentCalls.push(request);return{id:'test-session',status:'opened'};}}
      : name==='./repository-import.cjs'&&repositoryReader?{...localRequire(name),readRepository:repositoryReader}:localRequire(name),
  });
  await new Promise(resolve => setImmediate(resolve));
  return { home, dialog, clipboard, calls, executed, events,nativeEvents,windowEvents,menu:electron.Menu,focused:()=>focused, invoke: (method, ...args) => handlers.get(`asl:${method}`)(
    { sender: webContents, senderFrame: { url: page } }, ...args) };
}

test('startup consumers share one in-flight MCP inventory without sharing cancellation',async t=>{
  let release;const wait=new Promise(resolve=>release=resolve);
  const app=await desktop(t,{coreWait:wait,coreReply:action=>action==='nativeMcp'?{projects:[],sources:[]}: {modes:[],issues:[]}});
  const first=app.invoke('read','native-one','native',[]),second=app.invoke('read','modes-two','localModes',[]);
  await new Promise(resolve=>setTimeout(resolve,50));
  const scans=app.executed.filter(([action])=>action==='nativeMcp');
  const count=scans.length;
  await app.invoke('cancel-read','native-one');release();
  assert.equal((await first).ok,false);assert.equal((await second).ok,true);
  assert.equal(count,1,'同源本机清单不应并发重算');
  assert.equal(scans[0][2].signal,undefined,'共享任务不归属于第一个消费者');
  await app.invoke('local-modes');
  assert.equal(app.executed.filter(([action])=>action==='nativeMcp').length,2,'下次刷新读取最新配置');
});

test('organize hands a selected Mode to the current native Agent through the same CLI',async t=>{
  const agentCalls=[],app=await desktop(t,{agentCalls,coreReply:()=>({document:'默认只整理 Mode，Skill 修改先取得用户明确同意。CLI：随包核心',cli:'asl-harness'})});
  app.dialog.next={canceled:false,filePaths:[app.home]};await app.invoke('choose','environment');
  const goal='整理关系 $(no-shell)';
  const result=await app.invoke('organize','codex-app',{workspace:app.home,mode:'creator-studio',goal});
  assert.equal(result.ok,true);assert.equal(result.value.status,'opened');
  assert.equal(agentCalls.length,1);
  assert.equal(agentCalls[0].workspace,app.home);assert.equal(agentCalls[0].project,app.home);
  assert.ok(agentCalls[0].brief.includes(goal));
  assert.ok(agentCalls[0].brief.includes('用户明确同意'));
  assert.equal(app.executed.at(-1)[0],'guide');
  assert.equal(app.executed.at(-1)[1].mode,'creator-studio');
});

test('organize rejects unselected workspaces, unknown snapshots and executable injection',async t=>{
  const agentCalls=[],app=await desktop(t,{agentCalls});
  app.dialog.next={canceled:false,filePaths:[app.home]};await app.invoke('choose','environment');
  for(const values of [{workspace:path.join(app.home,'unknown')},{workspace:app.home,snapshot:'unknown'},
    {workspace:app.home,mode:'../escape'},{workspace:app.home,executable:'evil.exe'},
    {workspace:app.home,goal:'x'.repeat(2001)}]){
    const result=await app.invoke('organize','codex-app',values);
    assert.equal(result.ok,false);
  }
  assert.equal(agentCalls.length,0);
});

test('organize uses the inspected commit and range, never a renderer supplied repository object',async t=>{
  const agentCalls=[],app=await desktop(t,{agentCalls,coreReply:()=>({document:'CLI 契约'}),repositoryReader:async(url,{repositories,temp})=>{
    const report={repository:url,commit:'a'.repeat(40),snapshot:path.join(temp,'inspected'),subpath:'skills/research',skills:[],modes:[],repositoryFiles:['README.md']};
    repositories.set(report.snapshot,{urls:new Set([url]),report});return report;
  }});
  app.dialog.next={canceled:false,filePaths:[app.home]};await app.invoke('choose','environment');
  const repository=(await app.invoke('github-skills','https://github.com/example/skills')).value;
  assert.equal((await app.invoke('organize','codex-app',{workspace:app.home,snapshot:repository.snapshot})).ok,true);
  for(const item of [repository.repository,repository.commit,repository.subpath,repository.snapshot])assert.ok(agentCalls[0].brief.includes(JSON.stringify(item).slice(1,-1)),item);
  assert.equal((await app.invoke('organize','codex-app',{workspace:app.home,repository:{repository:'https://github.com/evil/uninspected'}})).ok,false);
  assert.equal(agentCalls.length,1);
});

test('native close of an unsaved editor offers stay or discard with stay as default',async t=>{
  const app=await desktop(t),close=app.nativeEvents.get('will-prevent-unload');
  assert.equal(typeof close,'function');
  let allowed=0;
  close({preventDefault(){allowed++;}});assert.equal(allowed,0);
  assert.deepEqual(Array.from(app.calls.at(-1).buttons),['继续编辑','放弃并关闭']);
  assert.equal(app.calls.at(-1).cancelId,0);
  app.dialog.confirm=1;close({preventDefault(){allowed++;}});assert.equal(allowed,1);
});

test('native close during a write gives feedback and cannot interrupt the save',async t=>{
  let finish;const app=await desktop(t,{coreWait:new Promise(resolve=>{finish=resolve;})});
  app.dialog.next={canceled:false,filePaths:[app.home]};await app.invoke('choose','environment');
  const save=app.invoke('run','edit',{workspace:app.home,request:{operation:'mode.save',id:'test'},apply:true});
  await new Promise(resolve=>setImmediate(resolve));
  let prevented=0;app.windowEvents.get('close')({preventDefault(){prevented++;}});
  assert.equal(prevented,1);assert.match(app.calls.at(-1).message,/正在保存/);
  finish();assert.equal((await save).ok,true);
  app.windowEvents.get('close')({preventDefault(){prevented++;}});assert.equal(prevented,1);
});

test('IPC retains CLI code and actionable details without breaking existing error strings',async t=>{
  const failure=Object.assign(new Error('MODE.md 图无法渲染'),{code:'MERMAID_RENDER_FAILED',details:[{file:'MODE.md',line:7,action:'重写后重试'}]});
  const app=await desktop(t,{coreError:failure});
  const initial=(await app.invoke('initial')).value;
  const result=await app.invoke('run','catalog',{workspace:initial.example});
  assert.equal(result.ok,false);assert.equal(result.error,failure.message);
  assert.equal(result.code,failure.code);assert.deepEqual(result.details,failure.details);
});
test('native repository context menu removes only its connection and cancellation changes nothing',async t=>{
  const app=await desktop(t),file=path.join(app.home,'libraries.json');
  const urls=['https://github.com/example/one','https://github.com/example/two'];
  await fs.writeFile(file,JSON.stringify({repositories:urls,activeSource:{url:urls[0],mode:null}}));
  assert.equal((await app.invoke('source-menu','https://github.com/example/unknown')).ok,false);
  assert.equal((await app.invoke('source-menu',urls[0])).value.removed,false);
  assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')).repositories,urls);
  app.menu.choose=true;
  const result=await app.invoke('source-menu',urls[0]);
  assert.equal(result.ok,true);assert.equal(result.value.removed,true);
  assert.deepEqual(result.value.repositories,[urls[1]]);
  assert.equal(JSON.parse(await fs.readFile(file,'utf8')).activeSource,null);
});

test('local context operations require the selected root and distinguish peer modes from diagrams',async t=>{
  const app=await desktop(t),initial=(await app.invoke('initial')).value;
  assert.equal((await app.invoke('library-menu',app.home)).ok,false);
  await app.invoke('remember',initial.example);
  assert.equal(Object.keys((await app.invoke('library-menu',initial.example)).value).length,0);
  assert.deepEqual(Array.from(app.menu.items,item=>item.label),['打开工作库','偏好与记录','归档','新建模式','新建工作库','打开已有工作库']);
  assert.equal(app.menu.items.find(item=>item.label==='新建模式').enabled,false,'示例只供阅读');
  await app.invoke('library-menu',initial.example,'creator-studio');
  assert.equal(app.menu.items[1].label,'新建同级模式');
  assert.equal(app.menu.items[1].enabled,false);
  assert.equal((await app.invoke('library-menu',initial.example,'../escape')).ok,false);
  app.menu.choose=true;
  assert.equal((await app.invoke('library-menu',initial.example,'creator-studio')).value.action,'open-mode');
  assert.equal(app.executed.length,0,'菜单本身不执行内容写入');
  for(const values of [
    {workspace:initial.example,mode:'creator-studio',target:path.join(app.home,'unselected')},
    {workspace:initial.example,mode:'../escape',target:initial.managedLibrary},
    {workspace:initial.example,mode:'creator-studio',target:app.home},
  ])assert.equal((await app.invoke('create-library',values)).ok,false);
  assert.equal(app.executed.length,0,'未知、越界或已有位置不能触发导出导入');
});
test('only explicit connection can register an inspected repository; late selection cannot undo removal',async t=>{
  const url='https://github.com/example/preview',snapshot='/inspected/preview';
  const app=await desktop(t,{repositoryReader:async (url,context)=>{
    context.repositories.set(snapshot,{url,urls:new Set([url])});return {snapshot};
  }});
  assert.equal((await app.invoke('connect-repository',url,snapshot)).ok,false);
  await app.invoke('github-skills',url);
  assert.deepEqual((await app.invoke('initial')).value.repositories,[]);
  assert.equal((await app.invoke('connect-repository',url,snapshot)).ok,true);
  assert.deepEqual((await app.invoke('initial')).value.repositories,[url]);
  await app.invoke('select-source',{url,mode:null});
  app.menu.choose=true;
  await app.invoke('source-menu',url);
  await app.invoke('github-skills',url);
  await app.invoke('select-source',{url,mode:null});
  const state=(await app.invoke('initial')).value;
  assert.deepEqual(state.repositories,[]);
  assert.equal(state.activeSource,null);
  assert.equal((await app.invoke('connect-repository',url,snapshot)).ok,true,'explicit reconnect is still allowed');
});

test('reopen focuses the existing window and exposes version plus remembered views',async t=>{
  const app=await desktop(t);
  const initial=(await app.invoke('initial')).value;
  assert.equal(initial.version,'0.2.0');
  assert.deepEqual(initial.views,{});
  assert.equal(typeof app.events.get('second-instance'),'function');
  app.events.get('second-instance')();
  assert.equal(app.focused(),1);
});

test('configuration locations do not wait for MCP, receipt verification or assistant probes',async t=>{
  const app=await desktop(t);
  const reply=await app.invoke('native-locations');
  assert.equal(reply.ok,true);
  assert.deepEqual(Array.from(reply.value.hosts,host=>host.id),['codex-app','claude-code','deepseek-harness','workbuddy']);
  assert.equal(app.executed.length,0, 'scope selection must not spawn the core');
});
test('view updates are constrained to an opened environment',async t=>{
  const app=await desktop(t);
  assert.equal((await app.invoke('remember-view',app.home,{mode:'writing'})).ok,false);
  const initial=(await app.invoke('initial')).value;
  await app.invoke('remember',initial.example);
  assert.equal((await app.invoke('remember-view',initial.example,{mode:'writing',page:'modes',view:'map'})).ok,true);
  assert.equal((await app.invoke('initial')).value.views[initial.example].mode,'writing');
});

test("folder selection falls back to a real home and cancellation grants nothing", async t => {
  const app = await desktop(t);
  assert.equal((await app.invoke("choose", "project")).value, null);
  assert.equal(app.calls[0].defaultPath, app.home);
  const result = await app.invoke("run", "project", { workspace: app.home, project: app.home, mode: "writing", host: "codex-app" });
  assert.equal(result.ok, false);
  assert.equal(app.executed.length, 0);
});

test('missing Windows known-folder still allows project selection',async t=>{
  const app=await desktop(t,{missingDocuments:true});
  app.dialog.next={canceled:false,filePaths:[app.home]};
  const result=await app.invoke('choose','project');
  assert.equal(result.ok,true);
  assert.equal(result.value,app.home);
  assert.equal(app.calls[0].defaultPath,app.home);
});

test("built-in example cannot be edited or used as an import destination", async t => {
  const app = await desktop(t);
  const initial = (await app.invoke("initial")).value;
  for (const [action, values] of [
    ["edit", { workspace: initial.example, request: { operation: "mode.archive", id: "creator-studio" }, apply: true }],
    ["import", { source: app.home, target: initial.example, apply: true }],
  ]) {
    const reply = await app.invoke("run", action, values);
    assert.equal(reply.ok, false);
    assert.match(reply.error, /内置示例只供查看/);
  }
  assert.equal(app.executed.length, 0);
});

test("canceled native application never executes the write", async t => {
  const app = await desktop(t);
  app.dialog.next = { canceled: false, filePaths: [app.home] };
  await app.invoke("choose", "environment");
  await app.invoke("choose", "project");
  const result = await app.invoke("run", "project", { workspace: app.home, project: app.home, mode: "writing", host: "codex-app" });
  assert.equal(result.value.canceled, true);
  assert.equal(app.executed.length, 0);
});

test("first launch does not inject developer libraries and owns a default import location", async t => {
  const app = await desktop(t);
  const { value } = await app.invoke("initial");
  assert.equal(value.workspace, null);
  assert.equal(value.libraries.length, 0);
  assert.equal(value.managedLibrary, path.join(app.home, "workspace"));
  assert.equal((await app.invoke("run", "import", { source: value.example, target: value.managedLibrary })).ok, true);
  assert.equal((await app.invoke("run", "import", { source: value.example, target: value.managedLibrary, apply: true })).ok, false);
});

test("unparsed remote modes cannot be imported by guessing a cache path", async t => {
  const app = await desktop(t);
  const reply = await app.invoke("repository-mode", app.home, "creator-studio");
  assert.equal(reply.ok, false);
  assert.match(reply.error, /重新解析仓库/);
  assert.equal(app.executed.length, 0);
});

test('cancellable reads reject writes and native MCP saves require explicit scope and confirmation', async t => {
  const app = await desktop(t);
  const initial = (await app.invoke('initial')).value;
  for (const [action, values] of [['edit', {workspace:initial.example,apply:true}], ['mcpSave',{host:'codex-app'}], ['nativeMcp',{source:[]}]] ) {
    assert.equal((await app.invoke('read','qa-read','run',[action,values])).ok,false);
  }
  assert.equal((await app.invoke('mcp-save',{host:'codex-app',scope:'project',project:app.home,request:{name:'new'}})).ok,false);
  const before = app.executed.length;
  const canceled = await app.invoke('mcp-save',{host:'codex-app',scope:'user',request:{name:'new',definition:{command:'node'}}});
  assert.equal(canceled.value.canceled,true);
  assert.equal(app.executed.length,before);
  app.dialog.confirm=1;
  assert.equal((await app.invoke('mcp-save',{host:'codex-app',scope:'user',request:{name:'new',definition:{command:'node'}}})).ok,true);
  assert.equal(app.executed.at(-1)[0],'mcpSave');
});

test('guide roots read registered locations without a full native MCP scan', async t => {
  const app = await desktop(t);
  const project = path.join(app.home, 'project');
  const skillRoot = path.join(project, '.claude', 'skills');
  await fs.mkdir(skillRoot, { recursive: true });
  await fs.writeFile(path.join(app.home, 'libraries.json'), JSON.stringify({ targets: [{ project, host: 'claude-code' }] }));
  const reply = await app.invoke('guide-roots');
  assert.equal(reply.ok, true);
  assert.equal(app.executed.length, 0);
  assert.ok(reply.value.some(item => path.resolve(item.path) === skillRoot));
});

test('copy succeeds only after the system clipboard reads the text back', async t => {
  const app = await desktop(t);
  const reply = await app.invoke('copy-text', '要复制的提示词');
  assert.equal(reply.ok, true);
  assert.equal(reply.value.copied, true);
  assert.equal(app.clipboard.text, '要复制的提示词');
  assert.equal(app.clipboard.writes, 1);
});

test('a clipboard that refuses the write reports the refusal instead of swallowing it', async t => {
  const app = await desktop(t);
  app.clipboard.fail = '剪贴板被其他程序占用';
  const reply = await app.invoke('copy-text', '写不进去');
  assert.equal(reply.ok, false);
  assert.match(reply.error, /剪贴板被其他程序占用/);
});

test('a clipboard that never keeps the text reports failure and never claims copied', async t => {
  const app = await desktop(t);
  app.clipboard.drops = 99;
  const reply = await app.invoke('copy-text', '永远写不进去');
  assert.equal(reply.ok, false);
  assert.match(reply.error, /复制失败/);
  assert.equal(app.clipboard.writes, 1);
});
