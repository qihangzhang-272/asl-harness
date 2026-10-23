const {test}=require('node:test');
const assert=require('node:assert/strict');

test('document routes retain the requested Git ref instead of substituting the preview commit',async()=>{
  const {repositoryDocumentLink}=await import('../src/repository-links.mjs');
  const base='https://github.com/owner/repo/blob/abc123/README.md';
  assert.deepEqual(repositoryDocumentLink('https://github.com/owner/repo/blob/release/README.zh.md#安装',base),{
    file:'README.zh.md',ref:'release',hash:'#%E5%AE%89%E8%A3%85',url:'https://github.com/owner/repo/blob/release/README.zh.md#%E5%AE%89%E8%A3%85'});
  assert.equal(repositoryDocumentLink('https://github.com/other/repo/blob/release/README.md',base),null);
});

test('reading a slash-named branch never substitutes an existing document on the shorter branch',async()=>{
  const {repositoryDocumentLink}=await import('../src/repository-links.mjs');
  const {readOverview}=require('../repository-import.cjs');
  const base='https://github.com/owner/repo',commit='b'.repeat(40),requests=[];
  const route=repositoryDocumentLink(base+'/blob/feature/readme/docs/README.md',base+'/blob/'+'a'.repeat(40)+'/README.md');
  const result=await readOverview(base,async url=>{
    requests.push(url);
    if(url.endsWith('/commits/feature%2Freadme'))return{ok:true,text:async()=>JSON.stringify({sha:commit})};
    if(url.endsWith('/contents/docs/README.md?ref='+commit))return{ok:true,text:async()=>JSON.stringify({path:'docs/README.md',html_url:base+'/blob/'+commit+'/docs/README.md',content:Buffer.from('# 指定分支的说明').toString('base64'),encoding:'base64'})};
    if(url.endsWith('/contents/readme/docs/README.md?ref=feature'))return{ok:true,text:async()=>JSON.stringify({path:'readme/docs/README.md',html_url:base+'/blob/feature/readme/docs/README.md',content:Buffer.from('# 错误分支的说明').toString('base64'),encoding:'base64'})};
    return{ok:false,status:404};
  },undefined,route);
  assert.equal(result.text,'# 指定分支的说明');
  assert.equal(result.ref,'feature/readme');
  assert.equal(result.url,base+'/blob/'+commit+'/docs/README.md');
  assert.ok(!requests.some(url=>url.includes('?ref=feature')),'must resolve the ref before reading, not fall back only after a 404');
});

test('commit-pinned documents stay a single read and ref failures never substitute another version',async()=>{
  const {readOverview}=require('../repository-import.cjs');
  const base='https://github.com/owner/repo',commit='a'.repeat(40),requests=[];
  const result=await readOverview(base,async url=>{
    requests.push(url);
    assert.equal(url,'https://api.github.com/repos/owner/repo/contents/docs/README.md?ref='+commit);
    return{ok:true,text:async()=>JSON.stringify({path:'docs/README.md',html_url:base+'/blob/'+commit+'/docs/README.md',content:Buffer.from('# 固定版本').toString('base64'),encoding:'base64'})};
  },undefined,{file:'docs/README.md',ref:commit});
  assert.equal(result.text,'# 固定版本');assert.equal(requests.length,1);
  let calls=0;
  await assert.rejects(readOverview(base,async()=>{calls++;return{ok:false,status:403};},undefined,{file:'readme/docs/README.md',ref:'feature'}),/请求频率/);
  assert.equal(calls,1,'rate limiting must not try shorter refs or read the current preview');
  const controller=new AbortController();controller.abort();
  await assert.rejects(readOverview(base,async(_url,{signal})=>signal.throwIfAborted(),controller.signal,{file:'docs/README.md',ref:'feature'}),{name:'AbortError'});
  await assert.rejects(readOverview(base,async()=>assert.fail('invalid paths must not request GitHub'),undefined,{file:'../README.md',ref:'main'}),/路径无效/);
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
