const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {commandArgs,runCore}=require('../bridge.cjs');

test('version explanations require an explicit save and keep their text in stdin',()=>{
  const values={workspace:'/library',revision:'a'.repeat(40),request:{document:'依据',expected:null},apply:true};
  assert.deepEqual(commandArgs('historyNote',values),['environment.history.note','--workspace','/library','--revision','a'.repeat(40)]);
  assert.throws(()=>commandArgs('historyNote',{...values,apply:false}));
  assert.throws(()=>commandArgs('historyNote',{...values,request:'依据'}));
  assert.throws(()=>commandArgs('historyNote',{...values,revision:'HEAD'}));
});

test('saving a version explanation preserves the branch and Mode, and rejects stale notes',async t=>{
  const root=path.resolve(__dirname,'../..'),workspace=await fs.mkdtemp(path.join(os.tmpdir(),'asl-note-bridge-'));
  t.after(()=>fs.rm(workspace,{recursive:true,force:true}));
  await fs.cp(path.join(root,'examples/personal-environment'),workspace,{recursive:true});
  const git=(...args)=>execFileSync('git',['-C',workspace,...args],{encoding:'utf8',windowsHide:true}).trim();
  git('init');git('config','core.autocrlf','false');git('config','user.name','ASL 临时验收');git('config','user.email','test@example.invalid');
  git('add','.');git('commit','-m','2026-10-13 14:00｜建立版本说明的隔离验收基线');
  const revision=git('rev-parse','HEAD'),file=path.join(workspace,'modes/creator-studio/MODE.md'),original=await fs.readFile(file);
  const document='# 修改依据\n\n用户要求核对来源；`$HOME` 和引号只是记录文字。\n';
  const values={workspace,revision,apply:true,request:{document,expected:null}};
  const note=await runCore('historyNote',values,{root});
  const record=await runCore('history',{workspace,revision},{root});
  assert.equal(record.note.document,document);assert.equal(record.note.fingerprint,note.fingerprint);
  await assert.rejects(runCore('historyNote',{...values,request:{document:'旧版本不得覆盖',expected:null}},{root}),error=>error.code==='HISTORY_STALE');
  assert.equal((await runCore('history',{workspace,revision},{root})).note.document,document);
  assert.equal(git('rev-parse','HEAD'),revision);assert.equal(git('diff','--cached','--name-only'),'');
  assert.deepEqual(await fs.readFile(file),original);
});

