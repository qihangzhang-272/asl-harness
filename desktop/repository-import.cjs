const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { githubSnapshot, githubRepository } = require('./market.cjs');
const { isLibrary } = require('./library.cjs');
// Reuse inspected snapshots in this App session; never treat the cache as a content source.
const cache = new Map();

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

async function readRepository(url, { fetch, core, temp, selected, repositories, remember }, signal) {
    const request = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.any([signal, options.signal].filter(Boolean)) });
    const repo = await githubSnapshot(url, request);
    const key = `${repo.url}:${repo.commit}:${repo.subpath}`;
    const cached = cache.get(key);
    if (cached && await fs.stat(cached.snapshot).then(s => s.isDirectory()).catch(() => false)) {
      signal?.throwIfAborted();
      await remember(url);
      return {...cached,checkedAt:new Date().toISOString()};
    }
    cache.delete(key);
    const response = await request(repo.archive, { signal: AbortSignal.timeout(90000) });
    if (!response.ok) throw new Error(`下载失败（${response.status}），请稍后重试`);
    const chunks = []; let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > 64 * 1024 * 1024) throw new Error("仓库超过 64 MB，请在本机下载后选择具体技能目录");
      chunks.push(chunk);
    }
    // Keep downloaded repositories out of deeply nested project/profile paths on Windows.
    const folder = path.join(temp, "asl-github", randomUUID());
    await fs.mkdir(folder, { recursive: true });
    const archive = path.join(folder, "source.zip");
    await fs.writeFile(archive, Buffer.concat(chunks));
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
      skill.origin = `${repo.url}/tree/${repo.commit}/${path.relative(repositoryRoot, skill.source).split(path.sep).map(encodeURIComponent).join("/")}`;
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
        repositories.set(output, { environment, repo, url: new URL(url).href, modes: new Set(modes.map(m => m.id)) });
      } catch (error) { modeError = error.message; }
    }
    signal?.throwIfAborted();
    repositories.set(output,{environment,repo,url:new URL(url).href,modes:new Set(modes.map(m=>m.id))});
    await remember(url);
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
    const result = { ...report, readme, repository: repo.url, commit: repo.commit, subpath:repo.subpath, snapshot: output, modes, modeError, catalog, checkedAt:new Date().toISOString() };
    if (cache.size >= 4) cache.delete(cache.keys().next().value);
    cache.set(key, result);
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
