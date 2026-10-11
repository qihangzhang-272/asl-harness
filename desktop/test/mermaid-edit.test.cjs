const {test}=require('node:test');
const assert=require('node:assert/strict');
const original='flowchart LR\r\n%% 保留说明\r\n  skill_a["研究"]\r\n  skill_b{"写作"}\r\n  skill_a -->|"有证据"| skill_b\r\n';
async function api(){
  const module=await import('../src/mermaid-document.mjs');
  assert.equal(typeof module.editFlowchart,'function','原生图需要有保持原文的可视编辑入口');
  return module;
}
test('visual label editing retains IDs, comments, shape, edges and line endings',async()=>{
  const {editFlowchart}=await api();
  const changed=editFlowchart(original,{kind:'node',id:'skill_a',label:'研究 "产品"'});
  assert.equal(changed,original.replace('["研究"]','["研究 #34;产品#34;"]'));
});
test('edge labels, insertion and removal write only the targeted source statements',async()=>{
  const {editFlowchart}=await api();
  const changed=editFlowchart(original,{kind:'edge',index:0,label:'确认 | 补证'});
  assert.match(changed,/确认 #124; 补证/);
  const removed=editFlowchart(original,{kind:'edge',index:0,remove:true});
  assert.equal(removed,original.replace('  skill_a -->|"有证据"| skill_b\r\n',''));
  const joined=editFlowchart(original,{kind:'connect',from:'skill_b',to:'skill_a'});
  assert.ok(joined.startsWith(original));assert.match(joined,/skill_b --> skill_a\r\n$/);
  assert.throws(()=>editFlowchart(original,{kind:'connect',from:'unknown',to:'skill_a'}),/节点/);
});
test('removing a node removes incident edges, not unrelated statements or skill files',async()=>{
  const {editFlowchart}=await api();
  assert.equal(editFlowchart(original,{kind:'node',id:'skill_b',remove:true}),'flowchart LR\r\n%% 保留说明\r\n  skill_a["研究"]\r\n');
});
test('unsupported grammar is preserved and cannot be silently flattened',async()=>{
  const {flowchartItems,editFlowchart}=await api();
  for(const source of ['sequenceDiagram\n A->>B: 消息','flowchart LR\n A--->B','flowchart TD\n subgraph 工作\n A --> B\n end']){
    assert.equal(flowchartItems(source).editable,false);
    assert.throws(()=>editFlowchart(source,{kind:'node',id:'A',label:'改名'}),/原文/);
  }
});
test('inline declarations and chains retain authored syntax during labels and dragging',async()=>{
  const {flowchartItems,editFlowchart,readLayout}=await api();
  const source='flowchart LR\r\n%% 原文\r\n  A["输入 --> 证据"]-->|"核对"|B{判断} -.-> C((结果))\r\n';
  assert.equal(flowchartItems(source).editable,true);
  assert.deepEqual(flowchartItems(source).edges.map(e=>[e.from,e.to]),[['A','B'],['B','C']]);
  assert.equal(editFlowchart(source,{kind:'node',id:'B',label:'审核'}),source.replace('{判断}','{"审核"}'));
  assert.equal(editFlowchart(source,{kind:'edge',index:0,label:'新备注'}),source.replace('|"核对"|','|"新备注"|'));
  const dragged=editFlowchart(source,{kind:'layout',layout:{nodes:{B:{x:40,y:60}},edges:{L_A_B_0:{from:'top',to:'top'}}}});
  assert.ok(dragged.startsWith(source));assert.equal(readLayout(dragged).nodes.B.x,40);
});
test('removing inline edges preserves nodes and other chain edges',async()=>{
  const {flowchartItems,editFlowchart}=await api();
  const source='flowchart LR\n A[研究] --> B{审核} --> C((产出))\n%% 保留\n';
  const removed=editFlowchart(source,{kind:'edge',index:0,remove:true});
  const model=flowchartItems(removed);
  assert.equal(model.editable,true);assert.deepEqual(model.nodes.map(n=>n.id),['A','B','C']);
  assert.deepEqual(model.edges.map(e=>[e.from,e.to]),[['B','C']]);
  assert.match(removed,/A\[研究\]/);assert.match(removed,/C\(\(产出\)\)/);assert.ok(removed.endsWith('%% 保留\n'));
  const withoutB=flowchartItems(editFlowchart(source,{kind:'node',id:'B',remove:true}));
  assert.deepEqual(withoutB.nodes.map(n=>n.id),['A','C']);assert.equal(withoutB.edges.length,0);
});
test('deleting the only implicit connection never deletes its endpoint nodes',async()=>{
  const {flowchartItems,editFlowchart}=await api();
  const source='flowchart LR\n A-node-->B-node';
  assert.equal(flowchartItems(source).editable,true);
  const model=flowchartItems(editFlowchart(source,{kind:'edge',index:0,remove:true}));
  assert.deepEqual(model.nodes.map(n=>n.id),['A-node','B-node']);assert.equal(model.edges.length,0);
});
test('diagram replacement targets the chosen fence and retains surrounding Markdown',async()=>{
  const {replaceDiagram}=await api();
  const doc='# 模式\n\n~~~mermaid\nflowchart LR\n A --> B\n~~~\n\n保留\n\n```mermaid\nflowchart LR\n A --> B\n```\n';
  assert.equal(replaceDiagram(doc,1,'flowchart TD\n A --> B'),doc.replace('```mermaid\nflowchart LR','```mermaid\nflowchart TD'));
});
test('unfinished or out-of-range entities never crash the visual edit lens',async()=>{
  const {flowchartItems}=await api();
  assert.doesNotThrow(()=>flowchartItems('flowchart LR\n a["#99999999;"]'));
});
test('parallel edge identity follows the pinned Mermaid renderer, not SVG layout order',async()=>{
  const {flowchartItems}=await api();
  assert.deepEqual(flowchartItems('flowchart LR\n A --> B\n A --> C\n A --> B').edges.map(e=>e.renderId),['L_A_B_0','L_A_C_0','L_A_B_2']);
});
