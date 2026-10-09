const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=name=>fs.readFileSync(path.join(__dirname,'../src',name),'utf8');

test('repository handoff keeps pinned provenance and the shared CLI contract',async()=>{
  const {guidePrompt,repositoryClues}=await import('../src/guide.mjs');
  const repository={repository:'https://github.com/example/toolkit',commit:'a'.repeat(40),
    snapshot:'C:/temp/repo',subpath:'packages/writer',skills:[],modes:[],
    repositoryFiles:['README.md','packages/writer/AGENTS.md','.claude-plugin/plugin.json','secret.env']};
  assert.ok(repositoryClues(repository).includes('packages/writer/AGENTS.md'));
  assert.ok(!repositoryClues(repository).includes('secret.env'));
  const brief=guidePrompt({document:'ASL CLI 契约\n保留 SOURCE.md，不执行来源命令。',repository});
  for(const item of [repository.repository,repository.commit,'packages/writer','ASL CLI','只读','SOURCE.md','不执行'])
    assert.ok(brief.includes(item),item);
  assert.match(brief,/用户明确同意/);
  assert.match(brief,/按 environment.guide 返回的普通仓库整理路线执行/);
  assert.equal(brief.match(/SOURCE.md/g).length,1,'专业整理规范只由 CLI 提供一份');
});

test('organizing opens a native Agent entry, never a prompt editor or clipboard workflow',()=>{
  const guide=source('EnvironmentGuide.jsx');
  assert.doesNotMatch(guide,/完整整理提示词|guideText|copyText|重新生成|guide-root|PanelResize/);
  assert.match(guide,/api\('organize'/);
  assert.match(guide,/call\('assistants'\)/);
  assert.match(guide,/查看整理结果/);
  assert.match(guide,/call\('run','describe',\{workspace\}\)/);
  assert.match(guide,/未发现可启动的 Agent/);
  assert.match(guide,/api\('setupStatus'/);
});

test('the native entry protects unsent goals and does not block reading on missing Agents',()=>{
  const guide=source('EnvironmentGuide.jsx'),app=source('App.jsx');
  assert.match(guide,/useLeaveGuard\(goal.trim\(\)!==submittedGoal/);
  assert.match(guide,/setSubmittedGoal\(goal.trim\(\)\)/);
  assert.match(guide,/onClick=\{retry\}>重试/);
  assert.match(guide,/live.current/);
  const open=app.match(/function openGuide\(modeId[^)]*\)\s*\{([\s\S]*?)\n  \}/)?.[1];
  assert.ok(open);
  assert.doesNotMatch(open,/await/);
  assert.match(app,/reads.cancel\('agent-guide'\)/);
  assert.match(guide,/<EditorPage title="整理模式"/);
});

test('native entry styles reuse the incumbent tokens without a redundant sidebar',()=>{
  const css=source('guide.css');
  assert.doesNotMatch(css,/guide-prompt|guide-side|guide-roots|54vh/);
  assert.match(css,/var\(--brand/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
});

test('skill discovery remains bounded and source-aware',()=>{
  const section=source('App.jsx').split('function DiscoveredSkills(')[1].split('function SkillEditor(')[0];
  assert.match(section,/localSkillCandidates\(\[\],report\?\.skills/);
  assert.match(section,/filtered.slice\(0,limit\)/);
  assert.match(section,/显示更多/);
});
