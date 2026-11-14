const test=require('node:test');
const assert=require('node:assert/strict');
const {executionSnapshot}=require('../execution.cjs');
const call=(seq,id,name,args)=>({seq,type:'tool/call',data:{callId:id,name,arguments:JSON.stringify(args)}});
const result=(seq,id,text,isError=false)=>({seq,type:'tool/result',data:{message:{callId:id,isError,content:[{type:'text',text}]}}});
test('execution follows actual paired tools, never the selected canvas node',()=>{
  const events=[call(1,'a','asl_workspace',{action:'read',args:{kind:'skill',identifier:'research'}})];
  let value=executionSnapshot(events,'running',[{id:'research',title:'研究'}]);
  assert.equal(value.activeSkill.id,'research');assert.equal(value.tools[0].status,'running');
  value=executionSnapshot([...events,result(2,'a','{}')],'idle',[]);
  assert.equal(value.activeSkill,null);assert.equal(value.tools[0].status,'completed');
});
test('only successful file-producing tools and validated artifact receipts contribute outputs',()=>{
  const events=[call(1,'a','write',{file_path:'draft.md'}),result(2,'a','Written'),call(3,'b','write',{file_path:'failed.md'}),result(4,'b','Denied',true),call(5,'c','asl_workspace',{action:'artifact',args:{path:'chart.png'}}),result(6,'c',JSON.stringify({artifact:{path:'/work/chart.png',title:'图表'}})),call(7,'d','read',{path:'source.md'}),result(8,'d','Read')];
  const value=executionSnapshot(events,'idle',[]);
  assert.deepEqual(value.artifacts.map(a=>a.path),['draft.md','/work/chart.png']);
  assert.equal(value.tools.find(t=>t.id==='b').status,'failed');
});
test('an interrupted call is not shown as running after the host stops',()=>{
  const value=executionSnapshot([call(1,'a','write',{path:'draft.md'})],'idle',[]);
  assert.equal(value.tools[0].status,'interrupted');assert.deepEqual(value.artifacts,[]);
});


test('a new turn cannot inherit an interrupted tool as its active skill',()=>{
  const events=[{type:'turn/start',data:{turn:1}},call(1,'a','asl_workspace',{action:'read',args:{identifier:'research'}}),{type:'turn/end',data:{turn:1}},{type:'turn/start',data:{turn:2}}];
  const value=executionSnapshot(events,'running',[{id:'research',title:'研究'}]);
  assert.equal(value.activeSkill,null);assert.equal(value.tools[0].status,'interrupted');
});

test('resolved paths cannot escape the current project through parent paths or links',async()=>{
  const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');const {checkedPath}=require('../execution.cjs');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'asl-path-'));
  try{
    await fs.mkdir(path.join(root,'project'));await fs.writeFile(path.join(root,'outside.md'),'outside');
    await assert.rejects(()=>checkedPath(path.join(root,'project'),'../outside.md'),/超出/);
    await fs.symlink(root,path.join(root,'project/link'),'junction');
    await assert.rejects(()=>checkedPath(path.join(root,'project'),'link/outside.md'),/超出/);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
