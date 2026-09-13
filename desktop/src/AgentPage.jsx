import React, { useState } from 'react';
import { RotateCw, ChevronRight, FolderOpen, Plug, Search } from 'lucide-react';
import McpPanel from './McpPanel.jsx';
const baseName = value => (value || '').split(/[\\/]/).filter(Boolean).pop();

export default function AgentPage({ native, catalog, workspace, busy, Tag, onConnect, onSetup, refresh }) {
  const [mcp, setMcp] = useState(null);
  const [query, setQuery] = useState('');
  if (mcp) return <McpPanel host={mcp.id} name={mcp.name} initialProject={mcp.project} initialScope={mcp.scope} projects={native?.projects} onClose={() => setMcp(null)} onChanged={refresh}/>;
  return (<>
                      <div className="page-heading">
                        <div>
                          <h1>Agent 配置</h1>
                          <p>选择模式，明确应用的位置。</p>
                        </div>
                        <button disabled={busy} onClick={() => refresh()}><RotateCw size={16} />重新检测</button>
                      </div>
                      <div className="agent-grid">
                        {native?.hosts.map((host) => (
                          <article className="agent-card" key={host.id}>
                            <div className="agent-card-title">
                              <span className={`host-symbol ${host.id}`}>
                                {host.name[0]}
                              </span>
                              <h2>{host.name}</h2>
                              <Tag tone={host.configured ? "green" : ""}>
                                {host.configured ? "已找到配置" : host.directoryFound ? "只有目录" : "未找到配置"}
                              </Tag>
                            </div>
                            <small className="native-location" title={host.directory}>{host.directory}</small>
                            <div className="agent-meta">
                              <span>可用范围</span>
                              <b>
                                {host.scopes.length
                                  ? host.scopes
                                      .map((s) =>
                                        s === "project"
                                          ? "所选项目"
                                          : s === "user" ? "当前用户" : "独立预设",
                                      )
                                      .join("、")
                                  : "尚未接入"}
                              </b>
                            </div>
                            {host.userMode && <div className="agent-meta"><span>默认工作模式</span><b>{host.userMode.mode}</b></div>}
                            <div className="agent-meta">
                              <span>本机 MCP 声明</span>
                              <b>{host.connections?.length ?? "未检测"}</b>
                            </div>
                            {host.connections?.length > 0 && (
                              <div className="connection-tags">
                                {host.connections.map((name) => (
                                  <Tag key={name}>{name}</Tag>
                                ))}
                              </div>
                            )}
                            {['codex-app', 'claude-code'].includes(host.id) && <button onClick={() => setMcp(host)}><Plug size={15}/>管理 MCP<ChevronRight size={15}/></button>}
                            {host.mcpError && <p className="error-text">{host.mcpError}</p>}
                            <button
                              disabled={!catalog?.modes.length || !host.scopes.length}
                              onClick={() =>
                                onConnect({ host: host.id })
                              }
                            >
                              {host.scopes.length ? "配置工作模式" : "暂不支持应用模式"}
                              <ChevronRight size={15} />
                            </button>
                            {host.userMode?.workspace === workspace && catalog.modes.some(m => m.id === host.userMode.mode) && <div className="agent-tools"><button onClick={() => onConnect({ host: host.id, scope: "user", modeId: host.userMode.mode })}>同步 / 停用</button><button onClick={() => onSetup({ values: { workspace, mode: host.userMode.mode, host: host.id, scope: "user", ...(host.userMode.skillsDir !== host.skillRoot && { skillsDir: host.userMode.skillsDir }) } })}>检查配置</button></div>}
                          </article>
                        ))}
                      </div>
                      <section className="configured-projects">
                        <div className="field-heading"><h2>本机 MCP</h2><small className="muted">标准配置位置 + {native?.projects?.length || 0} 个已知项目</small></div>
                        <label className="search-field"><Search size={16}/><input aria-label="搜索本机 MCP" placeholder="搜索名称、Agent 或项目" value={query} onChange={e => setQuery(e.target.value)}/></label>
                        <div className="list-surface">{(native?.mcpSources || []).filter(source => `${source.host} ${source.project || ''} ${source.servers.map(s => s.name).join(' ')}`.toLowerCase().includes(query.toLowerCase())).map(source => {
                          const host = native.hosts.find(h => h.id === source.host);
                          return <div className="project-row" key={`${source.host}:${source.scope}:${source.project || ''}`}><Plug size={18}/><span><strong>{host.name} · {source.scope === 'user' ? '我的所有项目' : `${baseName(source.project)} · ${source.scope === 'local' ? '仅自己' : '可共享'}`}</strong><small title={source.file}>{source.file}</small><small>{source.error || source.servers.map(s => `${s.name}${s.enabled ? '' : '（已停用）'}`).join(' · ')}</small></span>
                            <button onClick={() => setMcp({ ...host, project: source.project, scope: source.scope })}>管理<ChevronRight size={14}/></button></div>;
                        })}</div>
                        {!native?.mcpSources?.length && <p className="muted">尚未发现原生 MCP 声明。可从上方 Agent 卡片添加，或选择其他项目目录。</p>}
                        <p className="muted">只读取配置，不启动服务。未登记的目录可在“管理 MCP”中选择；不会扫描聊天记录或整块硬盘。</p>
                        {native?.truncated && <p className="inline-note">已检查前 64 个项目；其他项目可手动选择。</p>}
                      </section>
                      {native?.targets?.length > 0 && (
                        <section className="configured-projects">
                          <h2>配置过的项目</h2>
                          <div className="list-surface">
                            {native.targets.map((target) => (
                              <div
                                className="project-row"
                                key={`${target.host}:${target.project}`}
                              >
                                <FolderOpen size={18} />
                                <span>
                                  <strong>{baseName(target.project)}</strong>
                                  <small>{target.project}</small>
                                </span>
                                <Tag>
                                  {native.hosts.find(h => h.id === target.host)?.name || target.host}{" "}
                                  · 项目级
                                </Tag>
                              </div>
                            ))}
                          </div>
                        </section>
                      )}
                    </>);
}
