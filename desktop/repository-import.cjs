const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { githubSnapshot, githubRepository } = require('./market.cjs');
const { isLibrary } = require('./library.cjs');
// Keep each URL's last successful read; reuse matching inspected snapshots across aliases.
const cache = new Map();
const MAX_ARCHIVE = 64 * 1024 * 1024, MAX_CACHE = 256 * 1024 * 1024, MAX_REPOSITORIES = 50;
let cacheWrites = Promise.resolve();
const digest = data => createHash('sha256').update(data).digest('hex');

async function cacheFile(root, file, limit) {
  const target=path.join(root,file),stat=await fs.lstat(target);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>limit||path.dirname(await fs.realpath(target))!==root)throw new Error('仓库缓存文件无效');
  return fs.readFile(target);
}

async function cachedArchive(url, cacheRoot) {
  if(!cacheRoot)return null;
  try {
    const root=await fs.realpath(cacheRoot),key=digest(url),record=JSON.parse(await cacheFile(root,key+'.json',65536));
    const expected=githubRepository(url),repo=record.repo;
    if(record.version!==1||record.url!==url||repo?.url!==expected.url||!/^([a-f0-9]{40})$/.test(repo.commit)
      ||typeof repo.subpath!=='string'||/[\\:\0]/.test(repo.subpath)||repo.subpath&&repo.subpath.split('/').some(p=>!p||p==='.'||p==='..')
      ||typeof record.checkedAt!=='string'||!Number.isFinite(Date.parse(record.checkedAt))||!/^([a-f0-9]{64})$/.test(record.digest))return null;
    const bytes=await cacheFile(root,key+'.zip',MAX_ARCHIVE);
    // This detects damaged local bytes, not proof that a cache writer represents GitHub.
    if(bytes.length!==record.size||digest(bytes)!==record.digest)return null;
    return{repo:{...expected,commit:repo.commit,subpath:repo.subpath},bytes,checkedAt:record.checkedAt};
  } catch { return null; }
}

function saveArchive(url,cacheRoot,repo,bytes,checkedAt) {
  if(!cacheRoot)return Promise.resolve();
  const write=async()=>{
    await fs.mkdir(cacheRoot,{recursive:true});
    const root=await fs.realpath(cacheRoot),key=digest(url),names=await fs.readdir(root);
    const files=await Promise.all(names.filter(name=>name.endsWith('.zip')||name===key+'.json').map(async name=>({name,stat:await fs.lstat(path.join(root,name))})));
    if(files.some(({name,stat})=>name.startsWith(key)&&(!stat.isFile()||stat.isSymbolicLink())))return;
    const archives=files.filter(({name})=>name.endsWith('.zip'));
    const previous=archives.find(({name})=>name===key+'.zip');
    // ponytail: bounded cache never evicts files; add explicit cleanup only when users need it.
    if(!previous&&archives.length>=MAX_REPOSITORIES||archives.reduce((sum,{stat})=>sum+stat.size,0)-(previous?.stat.size||0)+bytes.length>MAX_CACHE)return;
    const record={version:1,url,repo:{url:repo.url,commit:repo.commit,subpath:repo.subpath},checkedAt,size:bytes.length,digest:digest(bytes)};
    for(const [suffix,data] of [['zip',bytes],['json',JSON.stringify(record)]]) {
      const pending=path.join(root,`${key}.${randomUUID()}.tmp`);
      try {await fs.writeFile(pending,data,{flag:'wx'});await fs.rename(pending,path.join(root,key+'.'+suffix));}
      finally {await fs.unlink(pending).catch(()=>{});}
    }
  };
  const job=cacheWrites.catch(()=>{}).then(write);cacheWrites=job;
  return job.catch(()=>{}); // Cache failure must not prevent reading a downloaded public repository.
}

async function readOverview(url, fetch, signal, document) {
  const repo=githubRepository(url);
  const request=(url,options={})=>fetch(url,{...options,signal:AbortSignal.any([signal,AbortSignal.timeout(20000)].filter(Boolean))});
  const snapshot=repo.kind?await githubSnapshot(url,request):null;
  if(document&&(typeof document.file!=='string'||!document.file.toLowerCase().endsWith('.md')||document.file.includes('\\')||document.file.includes(':')||document.file.split('/').some(p=>p==='..'||p==='.')||typeof document.ref!=='string'))throw new Error('文档路径无效');
  const endpoint=`https://api.github.com/repos/${repo.owner}/${repo.repo}/${document?'contents/'+document.file.split('/').map(encodeURIComponent).join('/'):'readme'+(snapshot?.subpath?'/'+snapshot.subpath.split('/').map(encodeURIComponent).join('/'):'')}`;
  const ref=document?.ref||snapshot?.commit;
  const response=await request(endpoint+(ref?'?ref='+encodeURIComponent(ref):''),{headers:{Accept:'application/vnd.github+json','User-Agent':'ASL-Workspace'}});
  if(response.status===404)return null;
  if(!response.ok)throw new Error(response.status===403?'GitHub 限制了请求频率，请稍后重试':`仓库介绍暂时不可用（${response.status}）`);
  const raw=await response.text();if(raw.length>2*1024*1024)throw new Error('README 过大，请到 GitHub 查看');
  const body=JSON.parse(raw),text=Buffer.from(body.content||'',body.encoding==='base64'?'base64':'utf8').toString('utf8');
  if(text.length>1024*1024||typeof body.html_url!=='string'||!body.html_url.startsWith(repo.url+'/blob/'))throw new Error('README 内容或地址无效');
  return{file:body.path,text,url:body.html_url};
}

async function readRepository(url, { fetch, core, temp, selected, repositories, cacheRoot, refresh=false }, signal) {
    githubRepository(url);
    url=new URL(url).href;
    signal?.throwIfAborted();
    const request = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.any([signal, options.signal].filter(Boolean)) });
    let previous=cache.get(url);
    if(previous&&(!repositories.get(previous.snapshot)?.urls.has(url)||!await fs.stat(previous.snapshot).then(s=>s.isDirectory()).catch(()=>false)))previous=null;
    if(previous&&!refresh)return{...previous,cacheStatus:'cached'};
    const stored=await cachedArchive(url,cacheRoot);
    let repo,bytes,checkedAt,cacheStatus='fresh',refreshError;
    if(stored&&!refresh){({repo,bytes,checkedAt}=stored);cacheStatus='cached';}
    else try {repo=await githubSnapshot(url,request);}
    catch(error) {
      signal?.throwIfAborted();
      if(previous)return{...previous,cacheStatus:'stale',refreshError:error.message};
      if(!stored)throw error;
      ({repo,bytes,checkedAt}=stored);cacheStatus='stale';refreshError=error.message;
    }
    // ponytail: scan at most 50 URL records; no second content index is needed.
    const cached = [...cache.values()].find(report=>report.repository===repo.url&&report.commit===repo.commit&&report.subpath===repo.subpath&&repositories.has(report.snapshot));
    if (cached && await fs.stat(cached.snapshot).then(s => s.isDirectory()).catch(() => false)) {
      signal?.throwIfAborted();
      repositories.get(cached.snapshot).urls.add(url);
      const result={...cached,cacheStatus,checkedAt:cacheStatus==='fresh'?new Date().toISOString():cached.checkedAt};
      if(refreshError)result.refreshError=refreshError;else delete result.refreshError;
      if(refresh&&cacheStatus==='fresh')repositories.get(cached.snapshot).report=result;
      cache.delete(url);
      if(cache.size>=MAX_REPOSITORIES)cache.delete(cache.keys().next().value);
      cache.set(url,result);
      if(cacheRoot&&cacheStatus==='fresh') {
        const archiveBytes=stored?.repo.commit===repo.commit?stored.bytes:await cacheFile(path.dirname(cached.snapshot),'source.zip',MAX_ARCHIVE).catch(()=>null);
        if(archiveBytes)await saveArchive(url,cacheRoot,repo,archiveBytes,result.checkedAt);
      }
      return result;
    }
    if(!bytes)try {
      const response = await request(repo.archive, { signal: AbortSignal.timeout(90000) });
      if (!response.ok) throw new Error(`下载失败（${response.status}），请稍后重试`);
      const chunks = []; let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > MAX_ARCHIVE) throw new Error("仓库超过 64 MB，请在本机下载后选择具体技能目录");
        chunks.push(chunk);
      }
      bytes=Buffer.concat(chunks);checkedAt=new Date().toISOString();
    } catch(error) {
      signal?.throwIfAborted();
      if(previous)return{...previous,cacheStatus:'stale',refreshError:error.message};
      if(!stored)throw error;
      ({repo,bytes,checkedAt}=stored);cacheStatus='stale';refreshError=error.message;
    }
    // Keep downloaded repositories out of deeply nested project/profile paths on Windows.
    let folder = path.join(temp, "asl-github", randomUUID());
    await fs.mkdir(folder, { recursive: true });
    folder = await fs.realpath(folder);
    const archive = path.join(folder, "source.zip");
    await fs.writeFile(archive, bytes);
    const output = path.join(folder, "content");
    const report = await core("unpack", { source: archive, output }, signal);
    const repositoryRoot = output;
    // ASL repositories explicitly separate active skills from archived packages.
    const requestedPath = path.resolve(repositoryRoot, repo.subpath || "");
    const environment = await isLibrary(requestedPath) ? requestedPath : await isLibrary(repositoryRoot) ? repositoryRoot : null;
    const requested = environment === requestedPath ? path.join(environment, "skills") : requestedPath;
    report.skills = report.skills.filter(s => {
      const relative = path.relative(requested, s.source);
      return relative === "" || !relative.startsWith("..") && !path.isAbsolute(relative);
    });
    for (const skill of report.skills) {
      skill.repositoryPath = path.relative(repositoryRoot, skill.source).split(path.sep).join('/');
      skill.origin = `${repo.url}/tree/${repo.commit}/${skill.repositoryPath.split('/').map(encodeURIComponent).join("/")}`;
      const ancestors = report.repositoryDependencies.filter(d => {
        const file = path.join(output, d.file);
        return file.startsWith(repositoryRoot + path.sep) && path.dirname(file) !== skill.source && skill.source.startsWith(path.dirname(file) + path.sep);
      });
      if (ancestors.length) {
        skill.inspection.status = "needs-review";
        skill.inspection.reasons.push("仓库上层有共享配置，尚未确认能否单独取出：" + ancestors.map(d => path.relative(repositoryRoot, path.join(output, d.file))).join("、"));
      }
      // Preserve repository license notices when a self-contained subfolder is copied.
      for (const file of (environment ? [] : report.repositoryFiles).filter(file => path.dirname(path.join(output, file)) === repositoryRoot && /^(license|copying|notice)(\.|$)/i.test(path.basename(file)))) {
        const dest = path.join(skill.source, path.basename(file));
        try {
          await fs.copyFile(path.join(output, file), dest, 1);
          skill.inspection.files.push(path.basename(file));
        } catch (error) { if (error.code !== "EEXIST") throw error; }
      }
      selected.add(path.resolve(skill.source));
    }
    let modes = [], modeError = null, catalog = null;
    if (environment) {
      try {
        catalog = await core("catalog", { workspace: environment }, signal);
        modes = catalog.modes;
        if (environment !== requestedPath && repo.subpath.startsWith("modes/"))
          modes = modes.filter(m => path.resolve(m.path) === requestedPath);
      } catch (error) { modeError = error.message; }
    }
    signal?.throwIfAborted();
    repositories.set(output,{environment,repo,url:new URL(url).href,urls:new Set([new URL(url).href]),modes:new Set(modes.map(m=>m.id))});
    // README belongs to the selected folder (or repository root), never to every Skill.
    let readme=null;
    for(const directory of [...new Set([requestedPath,repositoryRoot])]) {
      const entries=await fs.readdir(directory).catch(()=>[]);
      const filename=entries.find(f=>/^readme\.md$/i.test(f))||entries.find(f=>/^readme[._-](zh(-cn)?|cn)\.md$/i.test(f));
      if(!filename)continue;
      const actual=await fs.realpath(path.join(directory,filename));
      const relative=path.relative(repositoryRoot,actual);
      if(relative.startsWith('..')||path.isAbsolute(relative)||(await fs.stat(actual)).size>1024*1024)continue;
      const file=relative.split(path.sep).join('/');
      readme={file,text:await fs.readFile(actual,'utf8'),url:`${repo.url}/blob/${repo.commit}/${file.split('/').map(encodeURIComponent).join('/')}`};
      break;
    }
    const result = { ...report, readme, repository: repo.url, commit: repo.commit, subpath:repo.subpath, snapshot: output, modes, modeError, catalog, checkedAt,cacheStatus,...(refreshError?{refreshError}:{}) };
    repositories.get(output).report = result;
    cache.delete(url);
    if (cache.size >= MAX_REPOSITORIES) cache.delete(cache.keys().next().value);
    cache.set(url, result);
    if(cacheStatus==='fresh')await saveArchive(url,cacheRoot,repo,bytes,checkedAt);
    return result;
}

async function readRepositoryDocument(snapshot,file,repositories) {
  const entry=repositories.get(snapshot);
  if(!entry)throw new Error('请重新打开这个仓库');
  if(typeof file!=='string'||!file||!file.toLowerCase().endsWith('.md')||file.includes('\\')||file.includes(':')||file.split('/').some(p=>p==='..'||p==='.'))throw new Error('文档路径无效');
  const root=await fs.realpath(snapshot),actual=await fs.realpath(path.join(root,file)).catch(()=>null);
  if(!actual)throw new Error('仓库中没有这份文档');
  const relative=path.relative(root,actual);
  if(relative.startsWith('..')||path.isAbsolute(relative)||(await fs.stat(actual)).size>1024*1024)throw new Error('文档超出读取范围');
  return {file,text:await fs.readFile(actual,'utf8'),url:`${entry.repo.url}/blob/${entry.repo.commit}/${file.split('/').map(encodeURIComponent).join('/')}`};
}
module.exports = { readRepository, readOverview, readRepositoryDocument };
