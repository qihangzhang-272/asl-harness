import React, { useEffect, useState } from 'react';
import { FileText, FolderOpen, Code, Save, Search, Puzzle } from 'lucide-react';

// Files are returned by the core's skill-local allowlist, never arbitrary renderer paths.
export default function SkillFiles({ item, Dialog, readFile, saveFile, onClose, readOnly }) {
  const [data, setData] = useState(null), [file, setFile] = useState('SKILL.md');
  const [document, setDocument] = useState(''), [editing, setEditing] = useState(false);
  const [error, setError] = useState(''), [query, setQuery] = useState(''), [busy, setBusy] = useState(false);
  const dirty = data?.document != null && document.replaceAll('\r\n','\n') !== data.document.replaceAll('\r\n','\n');
  useEffect(() => {
    let active = true;
    setBusy(true); setError(''); setData(null);
    readFile(file).then(result => { if (active) { setData(result); setDocument(result.document || ''); setEditing(false); } })
      .catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [file]);
  function leave(action) { if (!busy && (!dirty || window.confirm('当前文件有未保存的修改，放弃这些修改？'))) action(); }
  const groups = [...new Set((data?.files || []).map(f => f.group))];
  return <Dialog title={item.title} onClose={() => leave(onClose)} wide>
    <div className="package-summary"><Puzzle size={18}/><span>{data?.files.length ?? item.fileCount} 个文件 · 完整技能包</span><small>{item.requires.length ? `依赖 ${item.requires.join('、')}` : '未声明其他技能依赖'}</small></div>
    <div className="file-workbench">
      <nav className="package-tree" aria-label="技能文件架构">
        <div className="search"><Search size={14}/><input aria-label="搜索技能文件" placeholder="查找文件" value={query} onChange={e=>setQuery(e.target.value)}/></div>
        {groups.map(group => <details key={group} open><summary><FolderOpen size={14}/>{group}<small>{data.files.filter(f=>f.group===group).length}</small></summary>
          {data.files.filter(f=>f.group===group && f.path.toLowerCase().includes(query.toLowerCase())).map(entry=><button key={entry.path} disabled={busy} className={file===entry.path?'active':''} title={entry.path}
            onClick={()=>leave(()=>setFile(entry.path))}><FileText size={13}/><span>{entry.path.includes('/') ? entry.path.slice(entry.path.indexOf('/')+1) : entry.path}</span></button>)}
        </details>)}
      </nav>
      <section className="package-document">
        <header><span title={file}>{file}</span><div className="tabs"><button disabled={busy} className={!editing?'active':''} onClick={()=>setEditing(false)}>预览</button><button disabled={readOnly || data?.document == null || busy} className={editing?'active':''} onClick={()=>setEditing(true)}><Code size={14}/>编辑</button></div></header>
        {busy ? <p className="muted">正在读取文件…</p> : data?.document == null ? <p className="inline-note">此文件为二进制或超过 1 MB，保留在完整技能包中；请使用本地编辑器处理。</p> : editing ?
          <textarea aria-label="文件内容" className="package-code" spellCheck={false} value={document} onChange={e=>setDocument(e.target.value)}/> :
          <pre className={`package-preview ${file.endsWith('.md')?'markdown-source':''}`}>{document}</pre>}
      </section>
    </div>
    {error && <p role="alert" className="error-text">{error}</p>}
    <div className="dialog-actions"><span className="muted">{dirty ? '有未保存修改' : '直接对应本地文件'} · 保存不会执行脚本</span><button disabled={busy} onClick={()=>leave(onClose)}>关闭</button><button className="primary" disabled={!dirty || busy || readOnly} onClick={async()=>{
      setBusy(true); setError('');
      try { await saveFile({operation:'skill.file.save',id:item.id,file,document,expected:data.fingerprint}); const result=await readFile(file); setData(result); setDocument(result.document || ''); }
      catch(e){setError(e.message);} finally{setBusy(false);}
    }}><Save size={15}/>校验并保存</button></div>
  </Dialog>;
}
