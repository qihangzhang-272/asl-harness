const fs=require('node:fs/promises');
const path=require('node:path');
const {writePreferences}=require('./library.cjs');

// A disposable discovery report, not a skill store. Adoption always rereads the real package.
function localDiscovery({file,scan}) {
  let saved,writing=Promise.resolve();
  const pending=new Map();
  async function read(roots,{refresh=false,signal}={}) {
    signal?.throwIfAborted();
    const paths=(await Promise.all(roots.map(r=>fs.realpath(r.path).catch(()=>null)))).filter(Boolean).sort();
    const key=JSON.stringify(paths);
    if(!refresh) {
      if(saved===undefined) {
        try { saved=(await fs.stat(file)).size<=8*1024*1024?JSON.parse(await fs.readFile(file,'utf8')):null; }
        catch { saved=null; }
      }
      if(saved?.version===1&&saved.key===key&&Array.isArray(saved.report?.skills)&&Array.isArray(saved.report?.issues)
        &&saved.report.skills.every(s=>s&&typeof s.id==='string'&&typeof s.source==='string')
        &&saved.report.issues.every(i=>i&&typeof i.path==='string'&&typeof i.message==='string')) {
        const skills=(await Promise.all(saved.report.skills.map(async skill=>{
          const real=await fs.realpath(skill.source).catch(()=>null);
          return real&&paths.some(root=>{const rel=path.relative(root,real);return rel===''||rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);})?skill:null;
        }))).filter(Boolean);
        signal?.throwIfAborted();
        return {...saved.report,skills,roots,cached:true};
      }
    }
    if(pending.has(key))return pending.get(key);
    const result=(async()=>{
      const report={...(paths.length?await scan(paths,signal):{skills:[],issues:[]}),roots,checkedAt:new Date().toISOString()};
      signal?.throwIfAborted();
      const entry={version:1,key,report};saved=entry;
      writing=writing.catch(()=>{}).then(()=>writePreferences(file,entry));
      try { await writing; } catch { /* An unwritable cache must not hide successful discovery. */ }
      return report;
    })();
    pending.set(key,result);
    try{return await result;}finally{pending.delete(key);}
  }
  return {read};
}
module.exports={localDiscovery};
