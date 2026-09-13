import React from 'react';
import { FolderOpen, RotateCw, ChevronRight, Layers3 } from 'lucide-react';
import { matchLocalModes, shortText } from './presentation.mjs';

export function LocalModes({ report, onOpen, onScan, onChoose }) {
  return <section className="local-modes"><div className="field-heading"><h2>本机已有的工作模式</h2><div className="heading-actions">
    <button onClick={onChoose}><FolderOpen size={15}/>选择目录</button><button onClick={onScan}><RotateCw size={15}/>刷新</button>
  </div></div><p className="muted">检查已连接环境、Agent 已登记项目，或所选文件夹及下一层目录；不扫描硬盘。</p>
    <div className="list-surface">{report?.modes.map(mode => <button className="local-mode-row" key={`${mode.workspace}:${mode.id}`} onClick={() => onOpen(mode)}>
      <Layers3 size={20}/><span><strong>{mode.title}</strong><small>{mode.workspace}</small></span><ChevronRight size={16}/>
    </button>)}</div>
    {report && !report.modes.length && <p className="muted">尚未在这些位置找到符合 ASL 定义的 Mode。可以选择一个已有仓库。</p>}
    {!!report?.issues.length && <details><summary>{report.issues.length} 处需要检查</summary>{report.issues.map((item, i) => <p key={i} className="path-line">{item.path}：{item.message}</p>)}</details>}
  </section>;
}

export function RepositoryModes({ report, localModes, onImport, onOpen }) {
  return <section className="repository-modes"><div className="field-heading"><h2>仓库中的工作模式</h2><span className="tag">{report.modes.length} 个 Mode</span></div><div className="market-grid">
    {report.modes.map(item => {
      const matches = matchLocalModes(localModes, item.id, report.repository);
      return <article className="market-card" key={item.id}>
        <div className="market-card-top"><Layers3 size={23}/>{matches.length > 0 && <span className="tag">{matches.some(m => m.sameSource) ? '本机已有同源模式' : '本机有同名模式'}</span>}</div>
        <h3>{item.title}</h3><p>{shortText(item.document.split('\n').filter(line => line.trim() && !line.startsWith('#')).join(' '), 145)}</p>
        <details><summary>{item.skills.length} 个完整技能</summary><ul>{item.skills.map(id => <li key={id}>{id}</li>)}</ul></details>
        {matches.map(local => <button className="local-match" title={local.workspace} key={local.workspace} onClick={() => onOpen(local)}><FolderOpen size={15}/>打开本地 · {local.workspace.split(/[\\/]/).pop()}<ChevronRight size={14}/></button>)}
        <button className="primary" onClick={() => onImport(item)}>{matches.length ? '比较 / 选择更新位置' : '导入此 Mode'}</button>
      </article>;
    })}
  </div></section>;
}
