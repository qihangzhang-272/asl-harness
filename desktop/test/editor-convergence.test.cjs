const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'../src',name),'utf8');

test('new, legacy and native diagrams use one Mode workspace',()=>{
  assert.match(read('App.jsx'),/setModal\(\{ kind: 'mode-workspace', item: mode \}\)/);
  assert.doesNotMatch(read('App.jsx'),/<DiagramEditor/);
  assert.doesNotMatch(read('ParadigmEditor.jsx'),/GraphCanvas|projectGraph/);
});

test('membership edits preserve coordinates already authored, never manufacture layout',async()=>{
  const {normalizeArchitecture,placeSkill,materializeArchitecture}=await import('../src/graph-model.mjs');
  const draft=normalizeArchitecture({shared:[],paradigms:[{id:'p',title:'P',description:'D',skills:['a']}],layout:{p:{a:{x:2,y:3}}}},['a','b']);
  const result=materializeArchitecture(placeSkill(draft,'b','p'));
  assert.deepEqual(result.layout,{p:{a:{x:2,y:3}}});
});

test('native source is never re-generated when opening any supported diagram',async()=>{
  const {modeDiagramDocument}=await import('../src/mode-diagrams.mjs');
  for(const type of ['sequenceDiagram','stateDiagram-v2','mindmap','flowchart LR']){
    const document=`# M\r\n\r\n\`\`\`mermaid\r\n${type}\r\n\`\`\`\r\n`;
    assert.equal(modeDiagramDocument({document,architecture:{paradigms:[]}},[]),document);
  }
});

test('removing membership cannot leave a clickable orphan or discard complex source',async()=>{
  const {withoutSkillNodes}=await import('../src/mode-diagrams.mjs');
  const document='# M\n```mermaid\nflowchart LR\n skill_a["A"]\n skill_b["B"]\n skill_a --> skill_b\n```';
  assert.doesNotMatch(withoutSkillNodes(document,['a']),/skill_a/);
  assert.match(withoutSkillNodes(document,['a']),/skill_b/);
  const sequence='# M\n```mermaid\nsequenceDiagram\n participant skill_a as A\n```';
  assert.throws(()=>withoutSkillNodes(sequence,['a']),/原文/);
  assert.equal(withoutSkillNodes(sequence,['b']),sequence);
});
