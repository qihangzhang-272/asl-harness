const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { readRepository } = require('../repository-import.cjs');

test('README can be read before archive download and returns clear missing/rate-limit states',async()=>{
  const {readOverview}=require('../repository-import.cjs');
  let requests=0;
  const result=await readOverview('https://github.com/qa/overview',async url=>{requests++;assert.match(url,/\/readme$/);return{ok:true,text:async()=>JSON.stringify({path:'README.md',html_url:'https://github.com/qa/overview/blob/main/README.md',content:Buffer.from('# 先看内容').toString('base64'),encoding:'base64'})};});
  assert.equal(result.text,'# 先看内容');assert.equal(requests,1);
  assert.equal(await readOverview('https://github.com/qa/overview',async()=>({ok:false,status:404})),null);
  await assert.rejects(readOverview('https://github.com/qa/overview',async()=>({ok:false,status:403})),/请求频率/);
});

test('repository preview includes its actual README with a commit-pinned base, not dependency guesses', async t => {
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'asl-readme-'));
  t.after(()=>fs.rm(temp,{recursive:true,force:true}));
  const context={temp,selected:new Set(),repositories:new Map(),remember:async()=>{},
    fetch:async url=>url.includes('codeload')?{ok:true,body:(async function*(){yield Buffer.from('fixture');})()}
      :{ok:true,text:async()=>JSON.stringify(url.includes('/commits/')?{sha:'e'.repeat(40)}:{default_branch:'main'})},
    core:async(_,{output})=>{await fs.mkdir(output);await fs.writeFile(path.join(output,'README.md'),'# 实际仓库\n\n[用法](docs/use.md)');return{skills:[],repositoryFiles:['README.md'],repositoryDependencies:[]};}};
  const result=await readRepository('https://github.com/qa/readme-preview',context);
  assert.equal(result.readme.text,'# 实际仓库\n\n[用法](docs/use.md)');
  assert.equal(result.readme.file,'README.md');
  assert.match(result.readme.url,/blob\/e{40}\/README.md$/);
});

test('reopening an unchanged repository reuses the parsed snapshot and still remembers the source', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'asl-repo-cache-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  let downloads = 0, remembered = 0, parses = 0;
  const context = { temp, selected: new Set(), repositories: new Map(), remember: async () => remembered++,
    fetch: async url => {
      if (url.includes('codeload')) {
        downloads++;
        return { ok: true, body: (async function* () { yield Buffer.from('fixture'); })() };
      }
      return { ok: true, text: async () => JSON.stringify(url.includes('/commits/') ? { sha: 'c'.repeat(40) } : { default_branch: 'main' }) };
    },
    core: async (_action, { output }) => {
      parses++; await fs.mkdir(output);
      return { skills: [], repositoryFiles: [], repositoryDependencies: [] };
    },
  };
  const one = await readRepository('https://github.com/qa/cache-fixture', context);
  const two = await readRepository('https://github.com/qa/cache-fixture', context);
  assert.equal(one.snapshot, two.snapshot);
  assert.equal(downloads, 1); assert.equal(parses, 1); assert.equal(remembered, 2);
  assert.ok(one.checkedAt,'cloud inspection exposes when it last checked upstream');
  assert.ok(two.checkedAt);
});

test('cloud refresh is separate from Mode adoption and never writes a local environment',()=>{
  const source=require('node:fs').readFileSync(path.join(__dirname,'../src/App.jsx'),'utf8');
  const effect=source.match(/\/\/ Cloud refresh only[\s\S]*?\}, \[cloud\?\.url, modal, busy\]\);/)?.[0];
  assert.ok(effect);
  assert.match(effect,/githubSkills/);
  assert.doesNotMatch(effect,/importRepositoryMode|run.*import|load\(workspace/);
  assert.match(effect,/setCloud/);
});

test('ASL repository inspection preserves skill bytes instead of injecting a root license into every skill', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'asl-repo-exact-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const context = { temp, selected: new Set(), repositories: new Map(), remember: async () => {},
    fetch: async url => url.includes('codeload')
      ? { ok: true, body: (async function* () { yield Buffer.from('fixture'); })() }
      : { ok: true, text: async () => JSON.stringify(url.includes('/commits/') ? {sha: 'd'.repeat(40)} : {default_branch: 'main'}) },
    core: async (action, {output}) => {
      if (action === 'catalog') return {modes: [{id:'writing',skills:['example'],architecture:{paradigms:[]}}],skills:[{id:'example',title:'Example'}]};
      await fs.mkdir(path.join(output, 'skills/example'), {recursive: true});
      await fs.mkdir(path.join(output, 'modes'));
      await fs.writeFile(path.join(output, 'WORKSPACE.md'), '# ASL');
      await fs.writeFile(path.join(output, 'LICENSE'), 'root notice');
      await fs.writeFile(path.join(output, 'skills/example/SKILL.md'), 'original');
      return {skills: [{source: path.join(output, 'skills/example'), inspection: {files:['SKILL.md'], reasons:[]}}],
        repositoryFiles:['LICENSE'], repositoryDependencies:[]};
    },
  };
  const report = await readRepository('https://github.com/qa/preserve-asl', context);
  assert.equal(report.catalog.skills[0].title,'Example');
  assert.equal(report.modes[0].id,'writing');
  assert.equal(context.selected.has(report.snapshot),false); // Remote preview is not a writable local library.
  assert.equal(await fs.readFile(path.join(report.snapshot, 'skills/example/SKILL.md'), 'utf8'), 'original');
  assert.equal(await fs.stat(path.join(report.snapshot, 'skills/example/LICENSE')).then(()=>true).catch(()=>false), false);
});
