export function treeEntries(files,query=''){
  const entries=new Map(),needle=query.toLocaleLowerCase();
  for(const file of files){
    if(!file.path.toLocaleLowerCase().includes(needle))continue;
    const parts=file.path.split('/');
    for(let i=0;i<parts.length;i++){
      const path=parts.slice(0,i+1).join('/');
      entries.set(path,{path,name:parts[i],depth:i,directory:i<parts.length-1,parent:parts.slice(0,i).join('/')});
    }
  }
  const children=parent=>[...entries.values()].filter(e=>e.parent===parent).sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name));
  const result=[];function visit(parent){for(const entry of children(parent)){result.push(entry);if(entry.directory)visit(entry.path);}}visit('');return result;
}
export function visibleEntries(entries,opened,query){return entries.filter(entry=>query||!entry.parent||entry.parent.split('/').every((_,i,parts)=>opened.has(parts.slice(0,i+1).join('/'))));}
