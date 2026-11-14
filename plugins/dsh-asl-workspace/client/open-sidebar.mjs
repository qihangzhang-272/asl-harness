export async function openSidebarFile(ctx,sessionId,file,cwd){
  const sidebar=ctx.get('betterSidebar'),workspace=ctx.get('uiWorkspace'),mounted=ctx.get('sidebarRight')?.mounted;
  if(!sidebar?.openTab||!workspace?.openSession||!sessionId||!mounted?.subscribe)throw new Error('Sidebar 未就绪；可继续在当前预览中阅读，或在系统文件夹中打开');
  workspace.openSession(sessionId);
  if(mounted.getSnapshot()!==sessionId)await new Promise((resolve,reject)=>{
    let unsubscribe=()=>{};
    const timer=setTimeout(()=>{unsubscribe();reject(new Error('Sidebar 尚未挂载，请在会话就绪后重试'));},5000);
    const check=()=>{if(mounted.getSnapshot()===sessionId){clearTimeout(timer);unsubscribe();resolve();}};
    unsubscribe=mounted.subscribe(check);check();
  });
  sidebar.openTab({type:'editor',title:file.split(/[\\/]/).at(-1),path:file,target:'right'},{sessionId,cwd});
}
