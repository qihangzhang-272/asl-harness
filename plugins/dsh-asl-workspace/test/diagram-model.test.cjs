const test=require('node:test');
const assert=require('node:assert/strict');
const model=import('../client/diagram-model.mjs');

test('plugin renders exactly the same complete Mode diagrams as the desktop app',async()=>{
  const {diagramsFor}=await model;
  const {modeDiagramDocument}=await import('../../../desktop/src/mode-diagrams.mjs');
  const {diagramsIn}=await import('../../../desktop/src/mermaid-document.mjs');
  const skills=[{id:'research',title:'研究'},{id:'write',title:'写作'}];
  const mode={skills:['research','write'],roots:['research','write'],document:'# Mode',architecture:{nodes:[],shared:[],paradigms:[{id:'text',title:'内容',skills:['research','write'],edges:[{from:'research',to:'write',label:'材料'}]}]}};
  assert.deepEqual(diagramsFor(mode.document,mode,skills),diagramsIn(modeDiagramDocument(mode,skills)));
  const authored='# Mode\n```mermaid\nflowchart LR\n a["研究"] --> b["写作"]\n b --> a\n```';
  assert.deepEqual(diagramsFor(authored,mode,skills),diagramsIn(authored));
});
test('legacy single canvas remains one original diagram, without inferred scopes',async()=>{
  const {diagramsFor,referencedSkills}=await model;
  const source='flowchart LR\n a["研究"]\n b["写作"]\n a --> b\n%% asl-node {"id":"a","skills":["research"]}\n%% asl-node {"id":"b","skills":["write"]}';
  const document='# Mode\n<!-- asl-workspace-canvas:start -->\n```mermaid\n'+source+'\n```\n<!-- asl-workspace-canvas:end -->';
  const skills=['research','write'].map(id=>({id,title:id}));
  const mode={document,skills:skills.map(s=>s.id),architecture:{paradigms:[{id:'text',title:'文本',skills:['research'],edges:[]},{id:'visual',title:'视觉',skills:['write'],edges:[]}],shared:[],nodes:[]}};
  const diagrams=diagramsFor(document,mode,skills);assert.equal(diagrams.length,1);assert.equal(diagrams[0].source,source);assert.deepEqual(referencedSkills(source,skills),['research','write']);
});
test('canonical and explicit one/two-skill bindings survive native edits',async()=>{
  const {bindingsFor,referencedSkills}=await model;
  const skills=[{id:'research'},{id:'write'}];
  const source='flowchart LR\n skill_research["新的名称"]\n a["组织表达"]\n%% asl-bind a ["research","write"]\n%% asl-bind b ["missing"]';
  assert.deepEqual(bindingsFor(source,skills).get('a'),['research','write']);assert.equal(bindingsFor(source,skills).has('b'),false);
  assert.deepEqual(referencedSkills(source,skills),['research','write']);
  assert.deepEqual(referencedSkills('mindmap\n root((主题))\n  skill_write[写作]',skills),['write']);
});
