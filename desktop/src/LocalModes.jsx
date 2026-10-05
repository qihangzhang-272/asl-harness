import React from 'react';
import { FolderOpen, RotateCw, ChevronRight, Layers3 } from 'lucide-react';

export function LocalModes({ report, onOpen, onScan, onChoose }) {
  return <section className="local-modes"><div className="field-heading"><h2>本机已有的工作模式</h2><div className="heading-actions">
    <button onClick={onChoose}><FolderOpen size={15}/>选择目录</button><button onClick={onScan}><RotateCw size={15}/>刷新</button>
  </div></div>
    <div className="list-surface">{report?.modes.map(mode => <button className="local-mode-row" key={`${mode.workspace}:${mode.id}`} onClick={() => onOpen(mode)}>
      <Layers3 size={20}/><span><strong>{mode.title}</strong><small>{mode.workspace}</small></span><ChevronRight size={16}/>
    </button>)}</div>
    {report && !report.modes.length && <p className="muted">尚未找到工作模式。选择已有模式库，或交给 AI 整理。</p>}
    {!!report?.issues.length && <details><summary>{report.issues.length} 处需要检查</summary>{report.issues.map((item, i) => <p key={i} className="path-line">{item.path}：{item.message}</p>)}</details>}
  </section>;
}
