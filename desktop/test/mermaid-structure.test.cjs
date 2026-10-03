const {test}=require('node:test');
const assert=require('node:assert/strict');
const api=()=>import('../src/mermaid-structure.mjs');
test('renderer-scoped standalone nodes map to exact IDs, not label or suffix guesses',async()=>{
  const {diagramNodes}=await import('../src/mermaid-structure-dom.mjs');
  const nodes=['aslMermaid1-skill_a','aslMermaid2-skill_a','aslMermaid1-other_skill_a','flowchart-skill_a-0'].map(id=>({id,getAttribute:()=>null}));
  const svg={id:'aslMermaid1',querySelector:()=>null,querySelectorAll:()=>nodes};
  assert.deepEqual(diagramNodes(svg,'skill_a'),[nodes[0],nodes[3]]);
  assert.deepEqual(diagramNodes({querySelector:()=>svg,querySelectorAll:()=>nodes},'skill_a'),[nodes[0],nodes[3]]);
});
const sequence='sequenceDiagram\r\n  participant A as 分析\r\n  participant B as 检索\r\n  alt 有材料\r\n    A->>B: 核对\r\n    Note over A,B: 保留事实\r\n    B-->>A: 返回\r\n  else 材料不足\r\n    A->>B: 补充\r\n  end\r\n';
test('sequence exposes participants, messages, notes and branch labels without flattening',async()=>{
  const {structureItems,editStructure}=await api();
  const model=structureItems(sequence);
  for(const label of ['分析','核对','保留事实','有材料','材料不足']) {
    const item=model.items.find(item=>item.label===label);assert.ok(item,label);
    assert.equal(editStructure(sequence,{key:item.key,label:'新文字'}),sequence.replace(label,'新文字'));
  }
  assert.equal(editStructure(sequence,{key:model.items.find(i=>i.label==='核对').key,label:'一;二\n三'}),sequence.replace('核对','一#59;二<br/>三'));
});
test('sequence order changes preserve branch boundaries and participant references',async()=>{
  const {structureItems,editStructure}=await api();
  const m=structureItems(sequence),key=label=>m.items.find(i=>i.label===label).key;
  const reordered=editStructure(sequence,{kind:'move',key:key('检索'),to:key('分析'),placement:'before'});
  assert.ok(reordered.indexOf('participant B')<reordered.indexOf('participant A'));
  assert.ok(reordered.includes('A->>B: 核对'));
  const messages=editStructure(sequence,{kind:'move',key:key('返回'),to:key('核对'),placement:'before'});
  assert.ok(messages.indexOf('B-->>A: 返回')<messages.indexOf('A->>B: 核对'));
  const adjacent='sequenceDiagram\n participant A\n participant B\n A->>B: 一\n B->>A: 二\n';
  const order=structureItems(adjacent).items.filter(i=>i.kind==='message');
  assert.equal(editStructure(adjacent,{kind:'move',key:order[0].key,to:order[1].key,placement:'before'}),adjacent);
  assert.throws(()=>editStructure(sequence,{kind:'move',key:key('补充'),to:key('核对')}),/分支/);
});
test('mindmap moves whole subtrees and rejects root removal and cycles',async()=>{
  const {structureItems,editStructure}=await api();
  const source='mindmap\n  root((工作))\n    a[研究]\n      c(证据)\n    b[写作]\n';
  const m=structureItems(source),key=id=>m.items.find(i=>i.id===id).key;
  assert.equal(editStructure(source,{key:key('a'),label:'研究方向'}),source.replace('研究','研究方向'));
  assert.equal(editStructure(source,{kind:'move',key:key('a'),to:key('b'),placement:'inside'}),'mindmap\n  root((工作))\n    b[写作]\n      a[研究]\n        c(证据)\n');
  assert.throws(()=>editStructure(source,{kind:'move',key:key('a'),to:key('c'),placement:'inside'}),/子节点/);
  assert.throws(()=>editStructure(source,{key:key('root'),remove:true}),/根节点/);
  assert.equal(editStructure(source,{key:key('a'),remove:true}),'mindmap\n  root((工作))\n    b[写作]\n');
});
test('same labels have separate source identities; comments, IDs and metadata survive',async()=>{
  const {structureItems,editStructure}=await api();
  const source='mindmap\n root((总览))\n  a[相同]\n   ::icon(fa fa-book)\n  %% 保留\n  b[相同]\n';
  const items=structureItems(source).items;
  assert.equal(editStructure(source,{key:items.find(i=>i.id==='b').key,label:'不同'}),source.replace('b[相同]','b[不同]'));
});
test('unsupported syntax does not become another diagram; stale and unknown targets reject',async()=>{
  const {structureItems,editStructure}=await api();
  assert.equal(structureItems('pie\n "A" : 20').type,null);
  assert.throws(()=>editStructure(sequence,{key:'line-999',label:'无'}),/改变/);
  const source='sequenceDiagram\n participant A\n participant B\n A->>+B: 激活\n B-->>-A: 返回\n';
  const m=structureItems(source);
  assert.throws(()=>editStructure(source,{kind:'move',key:m.items.find(i=>i.label==='返回').key,to:m.items.find(i=>i.label==='激活').key}),/激活/);
});

test('spaced arrows and duplicate participant declarations cannot misdirect edits',async()=>{
  const {structureItems,editStructure}=await api();
  const spaced='sequenceDiagram\n participant A\n participant B\n A ->> B : 带空格\n';
  const item=structureItems(spaced).items.find(i=>i.kind==='message');assert.ok(item);
  assert.equal(editStructure(spaced,{key:item.key,label:'修改'}),spaced.replace('带空格','修改'));
  const duplicate='sequenceDiagram\n participant A as 旧名\n participant A as 新名\n A->>A: 消息';
  assert.equal(structureItems(duplicate).structural,false);
});

test('multiline note contents are not mistaken for participant or message declarations',async()=>{
  const {structureItems}=await api();
  const model=structureItems('sequenceDiagram\n participant A\n Note over A\n participant B as 这只是备注\n end note\n A->>A: 消息');
  assert.equal(model.items.some(i=>i.id==='B'),false);
  assert.equal(model.structural,false);
});

test('state labels are editable without flattening transitions or nested structure',async()=>{
  const {structureItems,editStructure}=await api();
  const source='stateDiagram-v2\n state "调研" as research\n state "写作" as writing\n research --> writing: 材料齐备\n';
  const model=structureItems(source),item=model.items.find(i=>i.id==='research');assert.ok(item);
  assert.equal(editStructure(source,{key:item.key,label:'事实研究'}),source.replace('调研','事实研究'));
  assert.throws(()=>editStructure(source,{kind:'move',key:item.key,to:model.items[1].key}),/原文/);
});
