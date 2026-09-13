import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, FolderOpen, Plus, Pencil, Trash2, RotateCw, X, Eye } from 'lucide-react';
import { useReadTasks, ReadStatus } from './useReadTasks.jsx';
import './mcp.css';

const scopes = { user: '我的所有项目', project: '此项目 · 可共享', local: '此项目 · 仅自己' };
const coreKeys = new Set(['type', 'command', 'args', 'url', 'env', 'headers', 'http_headers']);
async function api(method, ...args) {
  const result = await window.asl[method](...args);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function Pairs({ label, value = {}, onChange }) {
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const entries = Object.entries(value);
  function rename(index, key) {
    if (entries.some(([name], i) => i !== index && name === key)) { setError('已有同名字段，请使用不同名称'); return; }
    setError(''); onChange(Object.fromEntries(entries.map((row, i) => i === index ? [key, row[1]] : row)));
  }
  function add() {
    let n = entries.length + 1;
    while (`KEY${n}` in value) n++;
    onChange({ ...value, [`KEY${n}`]: '' });
  }
  return <section className="mcp-pairs"><div className="field-heading"><b>{label}</b><div className="heading-actions">
    <button type="button" aria-label={`显示${label}`} onClick={() => setVisible(!visible)}><Eye size={14}/></button>
    <button type="button" onClick={add}><Plus size={14}/>添加</button>
  </div></div>{entries.map(([key, text], i) => <div className="mcp-pair" key={i}>
    <input required aria-label={`${label}名称 ${i + 1}`} value={key} onChange={e => rename(i, e.target.value)}/>
    <input type={visible ? 'text' : 'password'} autoComplete="off" aria-label={`${label}值 ${i + 1}`} value={text} onChange={e => onChange({ ...value, [key]: e.target.value })}/>
    <button type="button" aria-label={`移除${label} ${i + 1}`} onClick={() => onChange(Object.fromEntries(entries.filter((_, n) => n !== i)))}><X size={14}/></button>
  </div>)}{error && <p className="error-text" role="alert">{error}</p>}</section>;
}

function Editor({ host, item, existing, onSave, onClose, saving }) {
  const form = useRef(null);
  useEffect(() => {
    if (form.current?.getBoundingClientRect().top > window.innerHeight - 100) form.current.scrollIntoView({ block: 'start' });
  }, []);
  const [name, setName] = useState(item?.name || '');
  const [definition, setDefinition] = useState(item?.definition || { command: '', args: [] });
  const [extra, setExtra] = useState(JSON.stringify(Object.fromEntries(Object.entries(item?.definition || {}).filter(([k]) => !coreKeys.has(k))), null, 2));
  const [error, setError] = useState('');
  const remote = 'url' in definition;
  const headers = host === 'codex-app' ? 'http_headers' : 'headers';
  const set = (key, value) => setDefinition(old => ({ ...old, [key]: value }));
  const changeType = type => {
    const { command, args, url, env, headers, http_headers, type: oldType, ...other } = definition;
    setDefinition({ ...other, ...(type === 'stdio' ? { command: '', args: [] } : { url: '' }), ...(host === 'claude-code' ? { type } : {}) });
  };
  async function submit(event) {
    event.preventDefault();
    try {
      const rest = JSON.parse(extra);
      if (!rest || Array.isArray(rest) || typeof rest !== 'object' || Object.keys(rest).some(k => coreKeys.has(k))) throw new Error('高级选项不能重复填写表单字段');
      if (!item && existing.includes(name)) throw new Error('已有同名连接，请从列表编辑');
      await onSave({ name, definition: { ...rest, ...Object.fromEntries(Object.entries(definition).filter(([k]) => coreKeys.has(k))) } });
    } catch (error) { setError(error.message); }
  }
  return <form ref={form} className="mcp-editor" onSubmit={submit}><fieldset disabled={saving}>
    <div className="field-heading"><h2>{item ? '编辑连接' : '添加 MCP'}</h2><button type="button" onClick={onClose} aria-label="关闭 MCP 编辑"><X size={17}/></button></div>
    <label className="field"><span>名称</span><input required pattern="[A-Za-z0-9_.-]+" maxLength={128} disabled={!!item} value={name} onChange={e => setName(e.target.value)} placeholder="例如：feishu"/></label>
    <label className="field"><span>连接方式</span><select value={remote ? definition.type || 'http' : 'stdio'} onChange={e => changeType(e.target.value)}>
      <option value="stdio">本机程序</option><option value="http">HTTP 服务</option>{host === 'claude-code' && <option value="sse">SSE 服务</option>}
    </select></label>
    {remote ? <><label className="field"><span>服务地址</span><input required type="url" value={definition.url} onChange={e => set('url', e.target.value)} placeholder="https://example.com/mcp"/></label>
      <Pairs label="请求头" value={definition[headers]} onChange={v => set(headers, v)}/></> : <>
      <label className="field"><span>程序或命令</span><input required value={definition.command} onChange={e => set('command', e.target.value)} placeholder="npx / uvx / 程序路径"/></label>
      <section><div className="field-heading"><b>参数</b><button type="button" onClick={() => set('args', [...(definition.args || []), ''])}><Plus size={14}/>添加</button></div>
        {(definition.args || []).map((arg, i) => <div className="mcp-arg" key={i}><input aria-label={`参数 ${i + 1}`} value={arg} onChange={e => set('args', definition.args.map((v, n) => n === i ? e.target.value : v))}/><button type="button" aria-label={`移除参数 ${i + 1}`} onClick={() => set('args', definition.args.filter((_, n) => n !== i))}><X size={14}/></button></div>)}
      </section><Pairs label="环境变量" value={definition.env} onChange={v => set('env', v)}/>
    </>}
    <details><summary>高级原生选项</summary><textarea className="code-editor" rows={6} aria-label="MCP 高级选项" value={extra} onChange={e => setExtra(e.target.value)}/></details>
    <p className="muted">隐藏值保持不动即可保留。保存不会启动程序；授权和连接检查仍在 Agent 中完成。</p>
    {error && <p className="error-text" role="alert">{error}</p>}
    <div className="dialog-actions"><button type="button" onClick={onClose}>取消</button><button className="primary">{saving ? '正在保存…' : '保存连接'}</button></div>
  </fieldset></form>;
}

export default function McpPanel({ host, name, initialProject, initialScope, projects = [], onClose, onChanged }) {
  const [project, setProject] = useState(initialProject || ''), [scope, setScope] = useState(initialScope || 'user');
  const [report, setReport] = useState(null), [editing, setEditing] = useState(null);
  const [message, setMessage] = useState(''), [saving, setSaving] = useState(false);
  const reads = useReadTasks(error => setMessage(error.message));
  const values = { host, ...(project ? { project } : {}) };
  const source = report?.sources.find(s => s.scope === scope);
  const refresh = () => {
    setReport(null); setEditing(null); setMessage('');
    return reads.read('mcp', '读取 MCP 配置', async call => { const result = await call('mcp', values); setReport(result); return true; });
  };
  useEffect(() => { setReport(null); setEditing(null); refresh(); }, [host, project]);
  async function save(request) {
    setSaving(true); setMessage('');
    try {
      const result = await api('mcpSave', { ...values, scope, request: { ...request,
        expected: request.operation === 'toggle' && host === 'claude-code' ? source.toggleFingerprint : source.fingerprint } });
      if (result.canceled) return;
      setEditing(null);
      const reloaded = await refresh();
      onChanged();
      if (reloaded) setMessage('已保存到原生配置；请在 Agent 中重新加载并检查连接。');
    } catch (error) { setMessage(error.message); throw error; }
    finally { setSaving(false); }
  }
  return <div className="mcp-panel">
    <div className="page-heading"><div><button className="text-button" disabled={saving} onClick={onClose}><ChevronLeft size={16}/>Agent 配置</button><h1>{name} · MCP</h1></div>
      <button disabled={saving} onClick={() => { setEditing(null); refresh(); }}><RotateCw size={16}/>重新读取</button></div>
    <div className="mcp-scope-bar"><div className="tabs">{Object.keys(scopes).filter(s => s === 'user' || project && (s !== 'local' || host === 'claude-code')).map(s => <button disabled={saving} key={s} className={scope === s ? 'active' : ''} onClick={() => { setScope(s); setEditing(null); }}>{scopes[s]}</button>)}</div>
      <button disabled={saving} onClick={async () => { try { const value = await api('choose', 'project'); if (value) { setProject(value); setScope('project'); } } catch (error) { setMessage(error.message); } }}><FolderOpen size={16}/>{project ? '更换项目' : '选择项目'}</button></div>
    {project && <p className="path-line">项目：{project}</p>}
    {!!projects.length && <label className="field"><span>已发现的项目</span><select disabled={saving} aria-label="已发现的 MCP 项目" value={projects.includes(project) ? project : ''} onChange={e => { setProject(e.target.value); setScope(e.target.value ? 'project' : 'user'); }}><option value="">我的所有项目</option>{projects.map(p => <option key={p} value={p}>{p}</option>)}</select></label>}
    <ReadStatus tasks={reads}/>
    {message && <p className="inline-note" role="status">{message}</p>}
    {source && <><p className="path-line">{source.file}</p>{source.error && <p className="error-text" role="alert">{source.error}</p>}
    <div className={`mcp-content ${editing ? 'with-editor' : ''}`}><section className="mcp-list">
      <div className="field-heading"><b>{source.servers.length} 个连接声明</b><button className="primary" disabled={saving || !!source.error} onClick={() => setEditing({ new: true })}><Plus size={16}/>添加 MCP</button></div>
      {!source.servers.length && !source.error && <p className="muted">这个范围还没有配置 MCP。</p>}
      {source.servers.map(item => <article className="mcp-row" key={item.name}><div className="field-heading"><strong>{item.name}</strong><span className={`tag ${item.enabled ? 'green' : ''}`}>{item.enabled ? '已配置 · 未验证' : '已停用'}</span></div>
        <p>{item.definition.command || item.definition.url || '原生配置'}</p>
        <details><summary>查看声明</summary><pre>{JSON.stringify(item.definition, null, 2)}</pre></details>
        <div className="heading-actions"><button disabled={saving} onClick={() => setEditing(item)}><Pencil size={14}/>编辑</button>
          <button disabled={saving || !source.canToggle} title={host === 'claude-code' ? 'Claude 停用状态只影响所选项目' : '保留配置并切换启用状态'} onClick={() => save({ operation: 'toggle', name: item.name, enabled: !item.enabled }).catch(() => {})}>{item.enabled ? '停用' : '启用'}{host === 'claude-code' && project ? ' · 此项目' : ''}</button>
          <button disabled={saving} aria-label={`移除 ${item.name}`} onClick={() => save({ operation: 'remove', name: item.name }).catch(() => {})}><Trash2 size={14}/></button>
        </div></article>)}
    </section>{editing && <Editor key={`${scope}:${editing.name || 'new'}`} host={host} item={editing.new ? null : editing} existing={source.servers.map(s => s.name)} saving={saving} onSave={save} onClose={() => setEditing(null)}/>}</div></>}
    <p className="mcp-boundary">{report?.notice} {host === 'claude-code' && !project ? '选择项目后可管理该项目的停用状态。' : ''}</p>
  </div>;
}
