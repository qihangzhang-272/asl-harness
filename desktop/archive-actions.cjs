const path=require('node:path');

async function trashArchive(values,{run,confirm,trash}) {
  const {workspace,entry,expected}=values;
  const target=path.resolve(workspace,'archive',entry);
  if(path.dirname(target)!==path.resolve(workspace,'archive'))throw new Error('无效的归档位置');
  const inspect=async()=>{
    const plan=await run('archiveCleanup',{workspace,entry,expected});
    if(path.resolve(plan.archivePath)!==target)throw new Error('归档位置已改变，请重新打开');
    if(plan.fingerprint!==expected)throw new Error('归档内容已改变，请重新打开');
    return plan;
  };
  const plan=await inspect();
  if(!await confirm(plan))return {canceled:true};
  await inspect();
  await trash(target);
  return {removed:true};
}
module.exports={trashArchive};
