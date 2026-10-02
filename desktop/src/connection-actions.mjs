export const connectionValues = item => ({workspace:item.workspace, mode:item.mode, host:item.host,
  ...(item.scope==='user' ? (item.skillsDir ? {skillsDir:item.skillsDir} : {}) : {project:item.project})});

// A refresh always targets the receipt's Agent and location, never the current library selection.
export async function updateConnection(item, api) {
  const values=connectionValues(item);
  if(item.scope==='user') {
    const plan=await api('run','userSync',values);
    if(plan.conflicts?.length)throw new Error('这个位置有未纳入管理的修改，请先查看配置详情');
    return api('run','userSync',{...values,expected:plan.fingerprint,apply:true});
  }
  if(item.scope==='preset')return api('run','preset',{workspace:item.workspace,mode:item.mode,basePreset:item.basePreset,output:item.project});
  return api('run','project',values);
}
