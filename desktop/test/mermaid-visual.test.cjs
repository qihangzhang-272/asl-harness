const {test}=require('node:test');
const assert=require('node:assert/strict');

test('visual emphasis follows only direct relationships, including parallel and selected edges',async()=>{
  const {relatedSelection}=await import('../src/mermaid-controls.mjs');
  const edges=[{index:0,from:'A',to:'B'},{index:1,from:'B',to:'C'},{index:2,from:'A',to:'B'},{index:3,from:'D',to:'D'}];
  const aroundA=relatedSelection([{kind:'node',id:'A'}],edges);
  assert.deepEqual([...aroundA.nodes],['A','B']);
  assert.deepEqual([...aroundA.edges],[0,2]);
  const selectedEdge=relatedSelection([{kind:'edge',index:1}],edges);
  assert.deepEqual([...selectedEdge.nodes],['B','C']);
  assert.deepEqual([...selectedEdge.edges],[1]);
  const multiple=relatedSelection([{kind:'node',id:'A'},{kind:'node',id:'D'}],edges);
  assert.deepEqual([...multiple.edges],[0,2,3]);
  assert.equal(relatedSelection([],edges).nodes.size,0);
  assert.equal(edges[0].from,'A','visual emphasis never rewrites the graph');
});
