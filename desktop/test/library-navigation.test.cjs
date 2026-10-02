const {test}=require('node:test'),assert=require('node:assert/strict');

test('current catalog updates its own row without moving or mixing same-name libraries',async()=>{
  const {libraryGroups}=await import('../src/presentation.mjs');
  const roots=['/personal/skills','/public/skills','/older/skills'];
  const found=roots.map(workspace=>({workspace,id:'creator',title:'Creator',libraryRepository:'https://github.com/a/skills',repository:'https://github.com/imported/mode'}));
  for(const workspace of roots){
    const groups=libraryGroups(found,roots,workspace,[{id:'creator',title:'Edited'}]);
    assert.deepEqual(groups.map(g=>g.root),roots);
    assert.equal(groups.find(g=>g.root===workspace).modes[0].title,'Edited');
    for(const group of groups)assert.equal(group.modes[0].workspace,group.root);
    assert.equal(groups.find(g=>g.root===workspace).repository,'https://github.com/a/skills');
  }
});

test('discovery cannot resurrect removed sidebar roots; an empty current catalog removes stale modes',async()=>{
  const {libraryGroups}=await import('../src/presentation.mjs');
  const found=[{workspace:'/active',id:'old'},{workspace:'/removed',id:'old'}];
  assert.deepEqual(libraryGroups(found,['/active'],'/active',[]).map(g=>[g.root,g.modes.length]),[['/active',0]]);
  assert.equal(libraryGroups(found,['/active'],'/active',null)[0].modes.length,1);
});
