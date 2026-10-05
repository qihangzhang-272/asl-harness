const {test}=require('node:test');
const assert=require('node:assert/strict');
const source='flowchart LR\n A[公司画像]\n B[投行推介材料]\n A --> B\n';
test('parallel edges on a straight row have separate lanes and retain exact ports',async()=>{
 const {connectionCurve}=await import('../src/mermaid-canvas.mjs');
 const first=connectionCurve({x:0,y:0},{x:200,y:0},'right','left');
 const second=connectionCurve({x:0,y:0},{x:200,y:0},'right','left',22);
 assert.match(first,/M 0 0 C 80 0, 120 0, 200 0/);
 assert.match(second,/M 0 0 C 40 0,/);assert.match(second,/100 -22 C/);assert.match(second,/, 160 0, 200 0$/);
});
test('layout survives label edits, and removal cleans only its own geometry',async()=>{
 const {editFlowchart,flowchartItems}=await import('../src/mermaid-document.mjs');
 const {readLayout}=await import('../src/mermaid-document.mjs');
 const layout={nodes:{A:{x:100,y:100},B:{x:400,y:100}},edges:{}};
 const moved=editFlowchart(source,{kind:'layout',layout});
 assert.deepEqual(readLayout(moved),layout);
 const connected=editFlowchart(moved,{kind:'connect',from:'A',to:'B',fromPort:'top',toPort:'top',layout});
 assert.equal(flowchartItems(connected).edges.length,2);
 assert.deepEqual(readLayout(connected).edges['L_A_B_2'],{from:'top',to:'top'});
 const renamed=editFlowchart(connected,{kind:'node',id:'A',label:'新公司画像'});
 assert.deepEqual(readLayout(renamed),readLayout(connected));
 const removed=editFlowchart(renamed,{kind:'edge',index:0,remove:true});
 assert.deepEqual(readLayout(removed).edges['L_A_B_0'],{from:'top',to:'top'},'平行边重新编号不能丢失或串用端口');
 const withoutNode=editFlowchart(connected,{kind:'node',id:'B',remove:true});
 assert.deepEqual(readLayout(withoutNode),{nodes:{A:{x:100,y:100}},edges:{}});
});
test('layout rejects malformed, foreign, excessive and non-finite metadata',async()=>{
 const {readLayout}=await import('../src/mermaid-document.mjs');
 for(const data of ['{','{"nodes":{"Z":{"x":1,"y":2}},"edges":{}}','{"nodes":{"A":{"x":1e400,"y":2}},"edges":{}}','{"nodes":{},"edges":{"L_A_B_0":{"from":"diagonal","to":"top"}}}','{"nodes":{},"edges":{},"script":"x"}']){
  assert.throws(()=>readLayout(source+'%% asl-layout '+data+'\n'),/布局/);
 }
 assert.throws(()=>readLayout(source+'%% asl-layout {"nodes":{},"edges":{}}\n%% asl-layout {"nodes":{},"edges":{}}'),/布局/);
});
test('changing automatic direction clears manual geometry; CRLF and ordinary comments survive',async()=>{
 const {editFlowchart}=await import('../src/mermaid-document.mjs');
 const {readLayout}=await import('../src/mermaid-document.mjs');
 const original=(source+'%% 普通说明\n').replaceAll('\n','\r\n');
 const moved=editFlowchart(original,{kind:'layout',layout:{nodes:{A:{x:-100,y:150}},edges:{}}});
 assert.ok(moved.startsWith(original));assert.ok(!/(?<!\r)\n/.test(moved));
 const changed=editFlowchart(moved,{kind:'direction',direction:'TD'});
 assert.deepEqual(readLayout(changed),{nodes:{},edges:{}});assert.ok(changed.includes('%% 普通说明\r\n'));
});
