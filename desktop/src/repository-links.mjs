// Only Markdown in the same public repository stays in the repository reader.
export function repositoryFileLink(href,baseUrl) {
  try {
    const base=new URL(baseUrl),url=new URL(href,base);
    if(base.hostname!=='github.com'||url.protocol!=='https:')return null;
    const parts=base.pathname.split('/').filter(Boolean);
    const target=url.pathname.split('/').filter(Boolean);
    if(!['github.com','raw.githubusercontent.com'].includes(url.hostname)||target[0]!==parts[0]||target[1]!==parts[1])return null;
    const start=url.hostname==='github.com'?(target[2]==='blob'?4:0):3;
    if(!start)return null;
    const file=decodeURIComponent(target.slice(start).join('/'));
    return /\.md$/i.test(file)&&!file.split('/').some(p=>p==='..')?file:null;
  }catch{return null;}
}
