const {test}=require('node:test');
const assert=require('node:assert/strict');
test('Mermaid documents preserve every native diagram type and its heading',async()=>{
  const {diagramsIn}=await import('../src/mermaid-document.mjs');
  const diagrams=diagramsIn('# 工作\n\n## 沟通\n```mermaid\nsequenceDiagram\n A->>B: 核实\n```\n\n## 结构\n~~~mermaid\nmindmap\n root((证据))\n~~~');
  assert.deepEqual(diagrams.map(d=>d.title),['沟通','结构']);
  assert.match(diagrams[0].source,/^sequenceDiagram/);
  assert.equal(diagramsIn('```text\nmermaid is not a diagram\n```').length,0);
});

test('native diagram edits locate repeated fenced blocks with Windows or mixed line endings',async()=>{
  const {diagramsIn,replaceDiagram}=await import('../src/mermaid-document.mjs');
  const block='```mermaid\nflowchart LR\n a[内容]\n```\n';
  const first=block.replaceAll('\n','\r\n'),document='# 说明\r\n\r\n'+first+'\r\n## 另一张图\n'+block;
  const diagrams=diagramsIn(document);
  assert.equal(diagrams[0].raw,first.trimEnd());
  assert.equal(diagrams[1].raw,block);
  assert.equal(diagrams[0].line,3);assert.equal(diagrams[1].line,9);
  const edited=replaceDiagram(document,1,'flowchart LR\n a[修改]');
  assert.equal(edited,'# 说明\r\n\r\n'+first+'\r\n## 另一张图\n```mermaid\nflowchart LR\n a[修改]\n```\n');
  assert.equal(replaceDiagram(document,0,'flowchart LR\n a[修改]'),'# 说明\r\n\r\n'+first.replace('内容','修改')+'\r\n## 另一张图\n'+block);
});
test('heading outline is a literal document structure, not invented Skill reasoning',async()=>{
  const {outlineFor}=await import('../src/mermaid-document.mjs');
  const graph=outlineFor('# 公司画像\n\n## 关键问题\n问题\n### 商业模式\n\n## 输出\n\n```js\n## 不是标题\n```');
  assert.match(graph,/mindmap/);assert.match(graph,/关键问题/);assert.match(graph,/商业模式/);assert.doesNotMatch(graph,/不是标题/);
  assert.equal(outlineFor('only description'),'');
});
test('skill outline skips YAML metadata instead of drawing it as a huge heading',async()=>{
  const {outlineFor}=await import('../src/mermaid-document.mjs');
  const graph=outlineFor('---\nname: private-id\ndescription: text\n---\n\n# 技能\n\n## 方法\n内容');
  assert.match(graph,/技能/);assert.doesNotMatch(graph,/private-id|description/);
});
