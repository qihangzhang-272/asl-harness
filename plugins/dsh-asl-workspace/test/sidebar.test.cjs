const test=require('node:test'),assert=require('node:assert/strict');

test('Sidebar opens the requested file only after the target native session mounts',async()=>{
  const {openSidebarFile}=await import('../client/open-sidebar.mjs');let session,listener;const calls=[];
  const services={betterSidebar:{openTab:(file,scope)=>{assert.equal(session,'target');calls.push({file,scope});}},uiWorkspace:{openSession:id=>queueMicrotask(()=>{session=id;listener?.();})},sidebarRight:{mounted:{getSnapshot:()=>session,subscribe:fn=>{listener=fn;return()=>{listener=null;};}}}};
  await openSidebarFile({get:name=>services[name]},'target','/work/article.md','/work');
  assert.equal(calls[0].scope.sessionId,'target');assert.equal(calls[0].file.path,'/work/article.md');assert.equal(listener,null);
});

test('missing optional Sidebar keeps the workspace usable and returns a concrete fallback',async()=>{
  const {openSidebarFile}=await import('../client/open-sidebar.mjs');
  await assert.rejects(()=>openSidebarFile({get:()=>null},'s','/work/a.md','/work'),/系统文件夹/);
});
