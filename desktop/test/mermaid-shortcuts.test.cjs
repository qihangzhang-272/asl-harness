const {test}=require('node:test');
const assert=require('node:assert/strict');
test('canvas commands respect composition, editable targets and platform modifiers',async()=>{
  const {canvasShortcut:key}=await import('../src/mermaid-shortcuts.mjs');
  assert.equal(key({key:'z',ctrlKey:true}),'undo');assert.equal(key({key:'Z',metaKey:true,shiftKey:true}),'redo');
  assert.equal(key({key:'!',code:'Digit1',shiftKey:true}),'fit');
  for(const event of [{isComposing:true},{defaultPrevented:true},{target:{closest:()=>({})}},{altKey:true}])assert.equal(key({key:'Backspace',...event}),null);
  assert.equal(key({key:'Enter',ctrlKey:true}),'open');assert.equal(key({key:'Enter'}),'edit');
});
test('copy/paste preserves shapes, inner edges, ports and skill bindings without reusing IDs',async()=>{
  const {copyFlowSelection,pasteFlowSelection,deleteFlowSelection}=await import('../src/mermaid-clipboard.mjs');
  const {flowchartItems,readLayout}=await import('../src/mermaid-document.mjs');
  const source='flowchart LR\r\n A{"判断"} -.->|"是"| B(("执行"))\r\n B --> C["其他"]\r\n%% 业务注释\r\n';
  const layout={nodes:{A:{x:20,y:30},B:{x:240,y:30},C:{x:460,y:30}},edges:{L_A_B_0:{from:'top',to:'left'}}};
  const copy=copyFlowSelection(source,['A','B'],layout,[{alias:'A',data:{skills:['first','second']}}]);
  const pasted=pasteFlowSelection(source,copy,layout);
  assert.ok(pasted.source.startsWith(source));assert.ok(!/(?<!\r)\n/.test(pasted.source));
  assert.match(pasted.source,/A_copy\{"判断"\}/);assert.match(pasted.source,/B_copy\(\("执行"\)\)/);
  assert.match(pasted.source,/A_copy -\.->\|"是"\| B_copy/);assert.match(pasted.source,/%% asl-bind A_copy \["first","second"\]/);
  assert.equal(flowchartItems(pasted.source).edges.length,3);
  assert.deepEqual(readLayout(pasted.source).nodes.A_copy,{x:52,y:62});
  assert.deepEqual(readLayout(pasted.source).edges.L_A_copy_B_copy_0,{from:'top',to:'left'});
  const again=pasteFlowSelection(pasted.source,copy,readLayout(pasted.source));assert.deepEqual(again.ids,['A_copy2','B_copy2']);
  const removed=deleteFlowSelection(source,[{kind:'node',id:'A'},{kind:'node',id:'B'}]);
  assert.deepEqual(flowchartItems(removed).nodes.map(n=>n.id),['C']);assert.match(removed,/%% 业务注释/);
  assert.throws(()=>pasteFlowSelection(source,'hello',layout),/Mermaid/);
});
