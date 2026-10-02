import React from 'react';
import {Network} from 'lucide-react';
import SkillFiles from './SkillFiles.jsx';
import './skill-canvas.css';

function CanvasPanel({title,children}) {
  return <section className="skill-canvas-panel" aria-label="技能内容"><header className="skill-canvas-heading"><h2>{title}</h2></header>{children}</section>;
}

// The same graph stays mounted while its viewport becomes a floating navigator.
export default function SkillCanvas({selected,onSelect,readFile,saveFile,readOnly,children}) {
  const focused=!!selected;
  return <div className={`skill-canvas ${focused?'is-focused':''}`}>
    <div className="skill-canvas-graph">
      {focused&&<button className="canvas-return" onClick={()=>onSelect(null)}><Network size={15}/>技能逻辑架构</button>}
      {children}
    </div>
    {selected&&<SkillFiles key={selected.id} item={selected} Dialog={CanvasPanel} embedded readOnly={readOnly} onClose={()=>onSelect(null)} readFile={file=>readFile(selected,file)} saveFile={saveFile}/>}
  </div>;
}
