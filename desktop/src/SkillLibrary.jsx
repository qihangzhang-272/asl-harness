import React, {useEffect,useRef,useState} from 'react';
import {Layers3, Puzzle, ChevronRight, FileText} from 'lucide-react';
import {allSkillSection, skillSections, shortText} from './presentation.mjs';
import {ArchitectureMap} from './Architecture.jsx';
import SkillCanvas from './SkillCanvas.jsx';
import PanelResize from './PanelResize.jsx';
import {useViewState} from './useViewState.jsx';

export default function SkillLibrary({catalog,query,selected:focusedSkill,onSelect,onSkill,onEditMode,onSaveDocument,historyFor,readFile,saveFile,readOnly}) {
  const [sectionId,setSectionId]=useViewState(`skills:${catalog.root||catalog.modes[0]?.path||'library'}`,'');
  const [localFocused,setLocalFocused]=useState(null);
  const previousSection=useRef(sectionId);
  const focused=onSelect?focusedSkill:localFocused,setFocused=onSelect||setLocalFocused;
  useEffect(()=>setFocused(previous=>previous?catalog.skills.find(skill=>skill.id===previous.id)||null:null),[catalog]);
  useEffect(()=>{if(previousSection.current!==sectionId)setFocused(null);previousSection.current=sectionId;},[sectionId]);
  const sections=skillSections(catalog);
  const selected=sections.find(s=>s.id===sectionId);
  const groups=(selected?[selected]:[allSkillSection(catalog)]).map(g=>{
    const nodes=catalog.modes.find(m=>m.id===g.mode)?.architecture?.nodes||[];
    return {...g,items:g.skills.map(id=>catalog.skills.find(s=>s.id===id)).filter(s=>{
      const display=nodes.find(n=>n.skill===s?.id);
      return s&&`${s.title} ${s.description} ${s.id} ${display?.title||''} ${display?.note||''}`.toLowerCase().includes(query.toLowerCase());
    })};
  });
  return <div className="skill-library">
    <aside className="skill-library-rail"><nav className="skill-library-tree" aria-label="技能分类目录">
      <button className={!selected?'active':''} onClick={()=>setSectionId('')}><Puzzle size={16}/><span>全部能力</span><small>{catalog.skills.length}</small></button>
      {catalog.modes.map(mode=><section key={mode.id}><div className="skill-library-mode" title={mode.title}><Layers3 size={14}/><span>{mode.title}</span></div>
        {sections.filter(s=>s.mode===mode.id).map(g=><button key={g.id} title={g.title} className={selected?.id===g.id?'active':''} onClick={()=>setSectionId(g.id)}><span>{g.title}</span><small>{g.skills.length}</small></button>)}
      </section>)}
      {sections.filter(s=>!s.mode).map(g=><button key={g.id} title={g.title} className={selected?.id===g.id?'active':''} onClick={()=>setSectionId(g.id)}><span>{g.title}</span><small>{g.skills.length}</small></button>)}
    </nav><PanelResize name="skill-guide" label="调整技能导览宽度" initial={190} min={160} max={360}/></aside>
    <div className="skill-library-content">{groups.filter(g=>g.items.length).map(group=><section key={group.id} className="skill-table-section">
      <header><div><small>{group.modeTitle}</small><h2>{group.title}</h2></div></header>
      <SkillCanvas selected={focused} onSelect={setFocused} readFile={readFile} saveFile={saveFile} readOnly={readOnly} hasGraph={!!group.mode}>
      {group.mode&&(!query||focused)?<ArchitectureMap key={group.id} mode={catalog.modes.find(m=>m.id===group.mode)} skills={catalog.skills} initialScope={group.id.slice(group.mode.length+1)} compact={!!focused} selectedId={focused?.id} onSkill={setFocused} onEdit={onEditMode?title=>onEditMode(group.mode,title):null} onSaveDocument={onSaveDocument} historyFor={historyFor}/>:<div className="skill-table" role="table" aria-label={`${group.modeTitle||''} ${group.title}`}>
        <div className="skill-table-head" role="row"><span>技能</span><span>用途</span><span>内容</span><span/></div>
        {group.items.map(skill=><button role="row" className="skill-table-row" key={skill.id} onClick={()=>setFocused(skill)}>
          <span title={skill.id}><Puzzle size={15}/><span className="skill-table-name">{catalog.modes.find(m=>m.id===group.mode)?.architecture?.nodes?.find(n=>n.skill===skill.id)?.title||skill.title}</span></span>
          <span title={skill.description}>{shortText(catalog.modes.find(m=>m.id===group.mode)?.architecture?.nodes?.find(n=>n.skill===skill.id)?.note||skill.description,110)}</span><span><FileText size={13}/>{skill.fileCount}</span><ChevronRight size={15}/>
        </button>)}
      </div>}
      </SkillCanvas>
    </section>)}{!groups.some(g=>g.items.length)&&<p className="muted">没有匹配的技能。</p>}</div>
  </div>;
}
