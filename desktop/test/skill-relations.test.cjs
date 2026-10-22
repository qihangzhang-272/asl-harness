const {test}=require('node:test'),assert=require('node:assert/strict');
test('usage distinguishes a chosen root, a transitive dependency and a loose dependent',async()=>{
  const {skillRelations,affectedLocations}=await import('../src/skill-relations.mjs');
  const catalog={skills:[{id:'search',requires:[]},{id:'research',requires:['search']},{id:'report',requires:['research']},{id:'spare',requires:['search']}],modes:[
    {id:'write',roots:['report'],skills:['report','research','search']},{id:'lookup',roots:['search'],skills:['search']} ]};
  const result=skillRelations(catalog,'search');
  assert.deepEqual(result.modes.map(item=>[item.id,item.direct,item.via]),[['write',false,['report','research','search']],['lookup',true,[]]]);
  assert.deepEqual(result.dependents.map(item=>item.id),['research','spare']);
  assert.deepEqual(affectedLocations([{workspace:'/a',mode:'write'},{workspace:'/b',mode:'write'},{workspace:'/a',mode:'other'}],'/a',['write']),[{workspace:'/a',mode:'write'}]);
  assert.equal(skillRelations(catalog,'missing').modes.length,0);
});
