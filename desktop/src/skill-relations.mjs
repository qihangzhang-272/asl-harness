export function skillRelations(catalog,id){
  const skills=catalog?.skills||[],modes=catalog?.modes||[];
  function route(roots){
    const queue=roots.map(root=>[root]),seen=new Set();
    while(queue.length){
      const path=queue.shift(),last=path.at(-1);
      if(last===id)return path;
      if(seen.has(last))continue;
      seen.add(last);
      for(const next of skills.find(skill=>skill.id===last)?.requires||[])queue.push([...path,next]);
    }
    return [];
  }
  return {modes:modes.filter(mode=>mode.skills.includes(id)).map(mode=>({...mode,direct:mode.roots.includes(id),via:mode.roots.includes(id)?[]:route(mode.roots)})),
    dependencies:(skills.find(skill=>skill.id===id)?.requires||[]).map(key=>skills.find(skill=>skill.id===key)||{id:key,title:key}),
    dependents:skills.filter(skill=>skill.requires?.includes(id))};
}
export function affectedLocations(connections,workspace,modes){
  return (connections||[]).filter(item=>item.workspace===workspace&&modes.includes(item.mode));
}
