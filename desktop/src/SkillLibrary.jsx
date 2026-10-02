import React, {useEffect,useState} from 'react';
import {Layers3, Puzzle, ChevronRight, FileText} from 'lucide-react';
import {allSkillSection, skillSections, shortText} from './presentation.mjs';
import {ArchitectureMap} from './Architecture.jsx';
import SkillCanvas from './SkillCanvas.jsx';

export default function SkillLibrary({catalog,query,onSkill,onEditMode,onSaveDocument,readFile,saveFile,readOnly}) {
  const [sectionId,setSectionId]=useState('');
  const [focused,setFocused]=useState(null);
  useEffect(()=>setFocused(null),[sectionId]);
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
    <nav className="skill-library-tree" aria-label="技能分类目录">
      <button className={!selected?'active':''} onClick={()=>setSectionId('')}><Puzzle size={16}/>全部能力<small>{catalog.skills.length}</small></button>
      {catalog.modes.map(mode=><section key={mode.id}><div className="skill-library-mode"><Layers3 size={14}/>{mode.title}</div>
        {sections.filter(s=>s.mode===mode.id).map(g=><button key={g.id} className={selected?.id===g.id?'active':''} onClick={()=>setSectionId(g.id)}><span>{g.title}</span><small>{g.skills.length}</small></button>)}
      </section>)}
      {sections.filter(s=>!s.mode).map(g=><button key={g.id} onClick={()=>setSectionId(g.id)}>{g.title}<small>{g.skills.length}</small></button>)}
    </nav>
    <div className="skill-library-content">{groups.filter(g=>g.items.length).map(group=><section key={group.id} className="skill-table-section">
      <header><div><small>{group.modeTitle}</small><h2>{group.title}</h2></div></header>
      {group.mode&&<SkillCanvas selected={focused} onSelect={setFocused} readFile={readFile} saveFile={saveFile} readOnly={readOnly}><ArchitectureMap key={group.id} mode={catalog.modes.find(m=>m.id===group.mode)} skills={catalog.skills} initialScope={group.id.slice(group.mode.length+1)} compact={!!focused} selectedId={focused?.id} onSkill={setFocused} onEdit={onEditMode?title=>onEditMode(group.mode,title):null} onSaveDocument={onSaveDocument}/></SkillCanvas>}
      {(!group.mode||query)&&<div className="skill-table" role="table" aria-label={`${group.modeTitle} ${group.title}`}>
        <div className="skill-table-head" role="row"><span>技能</span><span>用途</span><span>内容</span><span/></div>
        {group.items.map(skill=><button role="row" className="skill-table-row" key={skill.id} onClick={()=>onSkill(skill)}>
          <span title={skill.id}><Puzzle size={15}/>{catalog.modes.find(m=>m.id===group.mode)?.architecture?.nodes?.find(n=>n.skill===skill.id)?.title||skill.title}</span>
          <span title={skill.description}>{shortText(catalog.modes.find(m=>m.id===group.mode)?.architecture?.nodes?.find(n=>n.skill===skill.id)?.note||skill.description,110)}</span><span><FileText size={13}/>{skill.fileCount}</span><ChevronRight size={15}/>
        </button>)}
      </div>}
    </section>)}{!groups.some(g=>g.items.length)&&<p className="muted">没有匹配的技能。</p>}</div>
  </div>;
}
