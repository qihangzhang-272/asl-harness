const {test}=require('node:test');
const assert=require('node:assert/strict');

test('flow structural drag reorders declarations, preserves edges and uses native direction',async()=>{
  const {editFlowchart}=await import('../src/mermaid-document.mjs');
  const source='flowchart LR\n A["输入"]\n B["复核"]\n C["反馈"]\n A --> B\n A --> C\n';
  const next=editFlowchart(source,{kind:'move',key:'C',to:'B',placement:'before'});
  assert.ok(next.indexOf('C[')<next.indexOf('B['));
  assert.ok(next.endsWith(' A --> B\n A --> C\n'));
  assert.equal(editFlowchart(source,{kind:'direction',direction:'TD'}),source.replace('flowchart LR','flowchart TD'));
  assert.throws(()=>editFlowchart(source,{kind:'direction',direction:'bad'}),/方向/);
});

test('new diagrams append unique titles without changing existing Markdown or CRLF',async()=>{
  const {appendDiagramTemplate,diagramsIn}=await import('../src/mermaid-document.mjs');
  assert.equal(typeof appendDiagramTemplate,'function');
  let document='# 我的模式\r\n\r\n保留正文\r\n';
  for(const type of ['flow','mindmap','sequence','flow']) {
    const next=appendDiagramTemplate(document,type);
    assert.ok(next.startsWith(document));
    assert.ok(!next.replaceAll('\r\n','').includes('\n'));
    document=next;
  }
  const diagrams=diagramsIn(document);
  assert.equal(diagrams.length,4);assert.equal(new Set(diagrams.map(d=>d.title)).size,4);
  assert.match(diagrams[0].source,/^flowchart/);assert.match(diagrams[1].source,/^mindmap/);assert.match(diagrams[2].source,/^sequenceDiagram/);
  assert.throws(()=>appendDiagramTemplate(document,'unknown'),/图型/);
});
