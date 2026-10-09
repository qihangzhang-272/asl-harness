const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {commandArgs}=require('../bridge.cjs');

test('archive reads use the shared CLI and reject arbitrary flags',()=>{
  assert.deepEqual(commandArgs('archives',{workspace:'library'}),['environment.archive','--workspace','library']);
  assert.deepEqual(commandArgs('archives',{workspace:'library',entry:'mode-demo-1',file:'MODE.md'}),['environment.archive','--workspace','library','--entry','mode-demo-1','--file','MODE.md']);
  assert.throws(()=>commandArgs('archives',{workspace:'library',delete:true}));
  assert.deepEqual(commandArgs('archiveCleanup',{workspace:'library',entry:'mode-demo-1',expected:'a'.repeat(64)}),['environment.archive.cleanup','--workspace','library','--entry','mode-demo-1','--expected','a'.repeat(64)]);
});

test('archive cleanup cancels without trashing and rechecks after explicit confirmation',async()=>{
  const {trashArchive}=require('../archive-actions.cjs');
  const workspace=path.resolve('library'),entry='mode-demo-1',expected='a'.repeat(64);
  const preview={archivePath:path.join(workspace,'archive',entry),fingerprint:expected,size:123};
  const calls=[];
  const run=async(action,values)=>{calls.push([action,values]);return preview;};
  assert.deepEqual(await trashArchive({workspace,entry,expected},{run,confirm:async()=>false,trash:async()=>assert.fail()}),{canceled:true});
  assert.equal(calls.length,1);
  calls.length=0;
  await trashArchive({workspace,entry,expected},{run,confirm:async plan=>{assert.equal(plan.archivePath,preview.archivePath);return true;},trash:async file=>calls.push(['trash',file])});
  assert.equal(calls.length,3);assert.equal(calls[2][1],preview.archivePath);
  assert.equal(calls[1][1].expected,expected);
});

test('archive cleanup never falls back to permanent deletion or accepts a moved target',async()=>{
  const {trashArchive}=require('../archive-actions.cjs');
  const workspace=path.resolve('library'),entry='mode-demo-1',expected='a'.repeat(64);
  const values={workspace,entry,expected};
  let checks=0,trashed=0;
  await assert.rejects(()=>trashArchive(values,{run:async()=>({archivePath:path.join(workspace,'archive',entry),fingerprint:++checks===1?expected:'b'.repeat(64)}),confirm:async()=>true,trash:async()=>trashed++}),/已改变/);
  assert.equal(trashed,0);
  await assert.rejects(()=>trashArchive(values,{run:async()=>({archivePath:path.resolve('unrelated'),fingerprint:expected}),confirm:async()=>true,trash:async()=>trashed++}),/归档位置/);
  await assert.rejects(()=>trashArchive(values,{run:async()=>({archivePath:path.join(workspace,'archive',entry),fingerprint:expected}),confirm:async()=>true,trash:async()=>{throw Error('回收站不可用');}}),/回收站不可用/);
});
