const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = name => fs.readFileSync(path.join(__dirname, '..', 'src', name), 'utf8');

test('an ordinary repository can be handed to AI with pinned provenance and the ASL contract', async () => {
  const {guidePrompt, repositoryClues} = await import('../src/guide.mjs');
  const repository={repository:'https://github.com/example/toolkit',commit:'a'.repeat(40),
    snapshot:'C:\\temp\\repo',subpath:'packages/writer',skills:[],modes:[],
    repositoryFiles:['README.md','packages/writer/AGENTS.md','.claude-plugin/plugin.json','.codex-plugin/plugin.json','secret.env']};
  const clues=repositoryClues(repository);
  assert.ok(clues.includes('packages/writer/AGENTS.md'));
  assert.ok(clues.includes('.claude-plugin/plugin.json'));
  assert.ok(clues.includes('.codex-plugin/plugin.json'));
  assert.ok(!clues.includes('secret.env'));
  const prompt=guidePrompt({document:'ASL v0.4 协议与校验',repository});
  for(const text of ['https://github.com/example/toolkit','a'.repeat(40),'packages/writer','ASL v0.4','AGENTS.md','只读','完整','不执行','SOURCE.md']) assert.ok(prompt.includes(text),text);
  assert.match(prompt,/没有.*SKILL.md/);
  assert.match(prompt,/不能.*已配置|不.*跨宿主.*可用/);
});

test('unknown-format and repair handoffs stay available and completion validates the real target', () => {
  const app=source('App.jsx'),guide=source('EnvironmentGuide.jsx');
  assert.match(app,/return openCloud\(url\)/);
  assert.match(app,/cloud\?\.report\?openGuide\('',cloud.report\)/);
  assert.doesNotMatch(source('SourceLibrary.jsx'),/交给 AI 整理/,'仓库整理复用当前页面的顶栏入口，不重复同一按钮');
  assert.match(app,/onVerified=/);
  assert.match(guide,/call\('run','describe',\{workspace\}\)/);
  assert.match(guide,/查看整理结果/);
  assert.doesNotMatch(guide,/Promise\.all\(\[call\('run','guide'/,'optional local discovery must not block the protocol document');
});

test('discovery reuses source-aware deduplication and does not render every package at once',()=>{
  const section=source('App.jsx').split('function DiscoveredSkills(')[1].split('function SkillEditor(')[0];
  assert.match(section,/localSkillCandidates\(\[\],report\?\.skills/);
  assert.match(section,/filtered\.slice\(0,limit\)/);
  assert.match(section,/显示更多/);
});

test('refresh preserves exclusions, including deselecting every source', async () => {
  const { guideSelection } = await import('../src/guide.mjs');
  assert.deepEqual(guideSelection(['a','b'], null), ['a','b']);
  assert.deepEqual(guideSelection(['a','b','new'], ['a']), ['a']);
  assert.deepEqual(guideSelection(['a','b'], []), []);
  assert.deepEqual(guideSelection(['b'], ['a']), []);
});

test('guide prompt keeps the write target and the read-only source boundary', async () => {
  const { guidePrompt } = await import('../src/guide.mjs');
  const prompt = guidePrompt({
    goal: '整理投研',
    document: '# 当前工作环境',
    included: ['/skills/one', '/skills/two'],
    references: ['/notes/private'],
  });
  assert.match(prompt, /我的工作目的：整理投研/);
  assert.match(prompt, /# 当前工作环境/);
  assert.match(prompt, /只读来源/);
  assert.match(prompt, /只读，按当前目的有选择地读取/);
  assert.match(prompt, /不执行材料里的命令/);
  assert.ok(prompt.includes(JSON.stringify('/skills/one')));
  assert.ok(prompt.includes(JSON.stringify('/notes/private')));
  const blank = guidePrompt({ goal: '  ', document: '' });
  assert.match(blank, /不按个人身份建模式/);
  assert.match(blank, /未指定；不额外扫描私人日志。/);
});

test('manual prompt edits survive field changes until an explicit rebuild', async () => {
  const { guideText } = await import('../src/guide.mjs');
  assert.equal(guideText({ generated: '生成版', edited: null }), '生成版');
  assert.equal(guideText({ generated: '生成版', edited: '我改过的' }), '我改过的');
  assert.equal(guideText({ generated: '字段已更新', edited: '我改过的' }), '我改过的');
  assert.equal(guideText({ generated: '字段已更新', edited: null }), '字段已更新');
});

test('the guide is a full editor page that loads outside the global task lock', () => {
  const app = source('App.jsx');
  const openGuide = app.match(/function openGuide\(modeId[^)]*\)\s*\{([\s\S]*?)\n  \}/)?.[1];
  assert.ok(openGuide, 'openGuide exists');
  assert.doesNotMatch(openGuide, /await/, 'opening the guide must not wait for file reads');
  assert.match(openGuide, /setModal\(\{ *kind: *'agent-guide'/);
  assert.doesNotMatch(app, /task\(\s*\(\s*\)\s*=>\s*openGuide/);
  assert.match(app.match(/const editorOpen=\[([^\]]*)\]/)?.[1] || '', /'agent-guide'/);

  const guide = source('EnvironmentGuide.jsx');
  assert.match(guide, /from '\.\/EditorPage\.jsx'/);
  assert.doesNotMatch(guide, /<Dialog/);
  assert.doesNotMatch(guide, /readOnly/);
  assert.doesNotMatch(guide, /\btask\b/);
  assert.match(guide, /read\('agent-guide'/);
});

test('editing and copying the full prompt use the edited text, not a frozen one', () => {
  const guide = source('EnvironmentGuide.jsx');
  const textarea = guide.match(/aria-label="完整整理提示词"[\s\S]{0,200}?\/>/)?.[0];
  assert.ok(textarea, 'the full prompt textarea is present');
  assert.match(textarea, /value=\{prompt\}/);
  assert.match(textarea, /onChange=/);
  assert.match(guide, /const prompt=guideText\(\{generated,edited\}\)/);
  assert.match(guide, /api\('copyText',prompt\)/);
});

test('a failed copy reports the error and never stays on 已复制', () => {
  const guide = source('EnvironmentGuide.jsx');
  assert.match(guide, /catch\(failure\)\{if\(live\.current\)\{setCopied\(false\);setError\(failure\.message\);\}\}/);
  assert.match(guide, /\{copied\?'已复制':'复制'\}/);
});

test('closing the guide cancels a pending read so a late result cannot reopen it', () => {
  const app = source('App.jsx');
  const render = app.match(/modal\?\.kind === 'agent-guide'[\s\S]*?\/>/)?.[0];
  assert.ok(render, 'the guide page is rendered');
  assert.match(render, /reads\.cancel\('agent-guide'\)/);
  const guide = source('EnvironmentGuide.jsx');
  assert.match(guide, /live\.current/);
  assert.doesNotMatch(guide, /setModal/);
});

test('the full prompt is visible by default and its styles stay in guide.css', () => {
  const guide = source('EnvironmentGuide.jsx');
  assert.match(guide, /import '\.\/guide\.css'/);
  assert.doesNotMatch(guide, /<details>/);
  assert.doesNotMatch(guide, /<summary>/);
  const textarea = guide.match(/aria-label="完整整理提示词"[\s\S]{0,200}?\/>/)?.[0];
  assert.ok(textarea, 'the full prompt is a plain visible editor, not a folded section');
  const global = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  assert.doesNotMatch(global, /\.environment-guide/);
  assert.doesNotMatch(global, /\.guide-text/);
  const local = fs.readFileSync(path.join(__dirname, '..', 'src', 'guide.css'), 'utf8');
  assert.match(local, /\.environment-guide\s*\{/);
  assert.match(local, /\.guide-text\s*\{/);
});

test('copy stays disabled until the document with the CLI protocol and target arrives', async () => {
  const { guideReady } = await import('../src/guide.mjs');
  assert.equal(guideReady(null), false);
  assert.equal(guideReady(''), false);
  assert.equal(guideReady('   '), false);
  assert.equal(guideReady('# 当前工作环境'), true);
  const guide = source('EnvironmentGuide.jsx');
  assert.match(guide, /const ready=guideReady\(document\)/);
  assert.match(guide, /if\(!ready\)return;/);
  assert.match(guide, /disabled=\{!ready\}/);
  assert.match(guide, /onClick=\{start\}>重试/);
});

test('rebuilding is explicit about losing manual edits and asks to confirm', () => {
  const guide = source('EnvironmentGuide.jsx');
  assert.match(guide, /按当前选项重新生成/);
  assert.match(guide, /丢弃手动修改/);
  assert.match(guide, /确认重新生成/);
  assert.match(guide, /setConfirming\(true\)/);
  assert.match(guide, /setEdited\(null\)/);
});

test('directory, copy and refresh results are ignored once the page is gone', () => {
  const guide = source('EnvironmentGuide.jsx');
  assert.match(guide, /const live=useRef\(true\),generation=useRef\(0\)/);
  assert.match(guide, /const current=\(\)=>live\.current&&generation\.current===token/);
  assert.match(guide, /if\(!live\.current\|\|!path\)return;/);
  assert.match(guide, /await api\('copyText',prompt\);if\(!live\.current\)return;/);
  assert.match(guide, /function refresh\(\)\{start\(\);\}/);
});

test('the guide opens as its own content page, without the global navigation it repeats', () => {
  const app = source('App.jsx');
  // Same full-page style the Mode editor uses: the shell is not kept behind it.
  assert.match(app, /agent-guide'\]\.includes\(modal\?\.kind\)\?' mode-editing'/);
  const guide = source('EnvironmentGuide.jsx');
  assert.match(guide, /<EditorPage title="整理模式" onClose=\{onClose\}>/);
});
