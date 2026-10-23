const {test}=require('node:test');
const assert=require('node:assert/strict');

test('document routes retain the requested Git ref instead of substituting the preview commit',async()=>{
  const {repositoryDocumentLink}=await import('../src/repository-links.mjs');
  const base='https://github.com/owner/repo/blob/abc123/README.md';
  assert.deepEqual(repositoryDocumentLink('https://github.com/owner/repo/blob/release/README.zh.md#安装',base),{
    file:'README.zh.md',ref:'release',hash:'#%E5%AE%89%E8%A3%85',url:'https://github.com/owner/repo/blob/release/README.zh.md#%E5%AE%89%E8%A3%85'});
  assert.equal(repositoryDocumentLink('https://github.com/other/repo/blob/release/README.md',base),null);
});

test('language choices use sibling files and authored links, not unrelated Skill READMEs',async()=>{
  const {repositoryLanguageOptions}=await import('../src/repository-links.mjs');
  const document={file:'README.md',url:'https://github.com/owner/repo/blob/abc123/README.md',text:'# Tool\n\n[中文](docs/zh/README.md) · [用法](docs/use.md) · [示例](skills/other/README.en.md)'};
  const options=repositoryLanguageOptions(document,['README.md','README.en.md','README.ja.md','skills/other/README.zh.md','docs/use.md']);
  assert.deepEqual(options.map(value=>[value.file,value.label]),[['README.md','原文'],['README.en.md','English'],['README.ja.md','日本語'],['docs/zh/README.md','中文']]);
  assert.ok(options.every(value=>value.ref==='abc123'));
});

test('an early README exposes authored translations before a snapshot is ready, without inventing one',async()=>{
  const {repositoryLanguageOptions}=await import('../src/repository-links.mjs');
  const document={url:'https://github.com/owner/repo/blob/main/README.md',text:'[简体中文](README.zh-CN.md) · [English](README.en.md)'};
  const options=repositoryLanguageOptions(document);
  assert.deepEqual(options.map(value=>value.label),['原文','中文','English']);
  assert.equal(repositoryLanguageOptions({...document,text:'# No translations'}).length,1);
});
