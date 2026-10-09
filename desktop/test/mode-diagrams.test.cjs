const {test}=require('node:test'),assert=require('node:assert/strict');
test('diagram materialization retains known relationships and writes stable Skill identities',async()=>{
  const {modeDiagramDocument}=await import('../src/mode-diagrams.mjs');
  const mode={document:'# 模式',architecture:{paradigms:[{id:'one',title:'研究',skills:['read','write'],edges:[{from:'read',to:'write',label:'材料'}]}],shared:['search']}};
  const skills=['read','write','search'].map(id=>({id,title:id}));
  const document=modeDiagramDocument(mode,skills);
  assert.match(document,/skill_read -->\|"材料"\| skill_write/);
  assert.match(document,/skill_search\["search"\]/);
  assert.doesNotMatch(document,/skill_search -->/);
  assert.equal(modeDiagramDocument({...mode,document},skills),document);
});
test('arbitrary authored Mermaid remains verbatim, without extra inferred diagrams',async()=>{
  const {modeDiagramDocument}=await import('../src/mode-diagrams.mjs');
  const document='# 模式\n```mermaid\nsequenceDiagram\n A->>B: 信息\n```';
  assert.equal(modeDiagramDocument({document,architecture:{shared:['one']}},[{id:'one'}]),document);
});
test('adding a Skill node retains its authored scenario label',async()=>{
  const {skillNodes}=await import('../src/mode-diagrams.mjs');
  const skill={id:'public-writing',title:'Original Skill Title'};
  const [node]=skillNodes([skill],[{skill:skill.id,title:'公众号语料研究'}]);
  assert.equal(node.data.title,'公众号语料研究');
  assert.equal(node.data.skill,skill);
  assert.equal(node.alias,'skill_public_writing');
});
test('unauthored member collections become editable nodes, not a read-only block chart',async()=>{
  const {modeDiagramDocument}=await import('../src/mode-diagrams.mjs');
  const {diagramsIn,editFlowchart}=await import('../src/mermaid-document.mjs');
  const document=modeDiagramDocument({document:'# Test',roots:['a'],architecture:{shared:[],paradigms:[{id:'work',title:'工作',skills:['a'],edges:[]}]}},[{id:'a',title:'A'}]);
  assert.match(editFlowchart(diagramsIn(document)[0].source,{kind:'add',id:'skill_b',label:'B'}),/skill_b/);
});
