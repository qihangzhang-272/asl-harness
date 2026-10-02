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
  for(const source of ['sequenceDiagram\n A->>B: 消息','flowchart LR\n A --> B --> C','flowchart LR\n A[研究] --> B[写作]','flowchart TD\n subgraph 工作\n A --> B\n end']){
    assert.equal(flowchartItems(source).editable,false);
    assert.throws(()=>editFlowchart(source,{kind:'node',id:'A',label:'改名'}),/原文/);
  }
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
