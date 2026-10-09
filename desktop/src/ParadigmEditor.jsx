import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Network, Plus, Puzzle, Redo2, Save, Search, Undo2, X, Pencil} from 'lucide-react';
import './graph-editor.css';
import {useLeaveGuard} from './EditorPage.jsx';
import PanelResize from './PanelResize.jsx';
import {
  LIMITS, SHARED, addParadigm, assignedScopes, commitHistory, createHistory,
  displayTitle, installCandidates, isSkillId, memberIds, mergeInventory,
  normalizeArchitecture, placeSkill, redoHistory, removeParadigm, removeScopeSkill, rootIds,
  saveRequest, sameState, scopeIncludes, scopeOf,  skillIndex,
  undoHistory, updateParadigm, validateDraft,
} from './graph-model.mjs';

const scopeTitle = (draft, scopeId) => scopeOf(draft, scopeId)?.title?.trim() || scopeId;

export function Placement({mode,value,onChange,required=true}) {
  if(!mode?.architecture?.paradigms)return null;
  return <label className="field"><span>放在哪种工作方式中</span><select aria-label="工作范式归属" value={value||''} onChange={e=>onChange(e.target.value)} required={required}>
    <option value="">选择工作范式或通用能力</option>
    {mode.architecture.paradigms.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}
    <option value="shared">通用能力 · 各场景按需使用</option>
  </select></label>;
}


// A member already inside the Mode. `row.current` means the scope on screen holds
// it; `row.scopeLabel` lists the other scopes that also hold it.
function SkillRow({row,onOpen,onPlace,onClear}) {
  const Label=onOpen?'button':'span';
  return <div
    className={`graph-skill${row.current ? ' is-current' : ''}`}
    title="拖到画布"
    draggable
    onDragStart={event => {
      event.dataTransfer.setData('application/x-asl-skill', row.id);
      event.dataTransfer.setData('text/plain', row.id);
      event.dataTransfer.effectAllowed = 'copy';
    }}
  >
    <Network size={13} aria-hidden="true" />
    <Label type={onOpen?'button':undefined} className="graph-skill-open" title={row.note || row.title} onClick={onOpen?() => onOpen(row.id):undefined}>
      <span className="graph-skill-text">
        <strong>{row.title}</strong>
        {row.scopeLabel ? <small>{row.scopeLabel}</small> : null}
      </span>
    </Label>
    {row.current
      ? <button type="button" className="icon-button" aria-label={`移出 ${row.title}`} title="移出当前归属" onClick={() => onClear(row.id)}><X size={13} /></button>
      : <button type="button" className="icon-button" aria-label={`加入 ${row.title}`} title="加入当前归属" onClick={() => onPlace(row.id)}><Plus size={13} /></button>}
  </div>;
}

// One install source. The drag payload is the unique sourceKey (never the bare
// id), so two folders offering the same skill id can never collapse into one row.
function CandidateRow({candidate,busy,onInstall,onOpen}) {
  const [source,setSource]=useState(candidate.sourceKey);
  const chosen=candidate.sources?.find(row=>row.sourceKey===source)||candidate;
  return <div
    className="graph-skill"
    title={`${chosen.source} · 拖到画布`}
    draggable
    onDragStart={event => {
      event.dataTransfer.setData('application/x-asl-skill-source', chosen.sourceKey);
      event.dataTransfer.setData('text/plain', chosen.sourceKey);
      event.dataTransfer.effectAllowed = 'copy';
    }}
  >
    <Puzzle size={13} aria-hidden="true" />
    <span className="graph-skill-text">
      <button type="button" className="graph-skill-open" onClick={()=>onOpen?.(chosen)}><strong>{candidate.title || candidate.id}</strong></button>
      {candidate.sources?.length>1?<select aria-label={`${candidate.id} 的来源`} value={chosen.sourceKey} onChange={event=>setSource(event.target.value)}>
        {candidate.sources.map(row=><option key={row.sourceKey} value={row.sourceKey}>{row.source}</option>)}
      </select>:<small title={chosen.source}>{candidate.id}</small>}
    </span>
    <button type="button" className="icon-button" disabled={busy}
      aria-label={`加入 ${candidate.title || candidate.id}`}
      title="加入画板"
      onClick={() => onInstall(chosen.sourceKey)}><Plus size={13} /></button>
  </div>;
}

// Host contract:
//   mode     Mode record {id, title, fingerprint, document, roots, skills, architecture}
//   skills   every available skill of the current library: {id, title, description, requires?}
//   localSkills  install sources {id, title, description, requires?, source, ...}; source is the drag key
//   onLocalSkillAdded(skill)  async; installs then resolves {skills} (updated library inventory), throws on failure
//   onSave(request)  receives saveRequest(...) for mode.save; Dialog / onClose are host chrome
export default function ParadigmEditor({mode,skills,Dialog,onSave,onClose,localSkills=[],onLocalSkillAdded,candidateLabel='本机',initialQuery='',onOpenCandidate,metadataDirty=false,metadataValid=true,documentOpen=false,documentEditor=null,renderCanvas,onOpenSkill,onAddToDiagram,onDocumentChange,onRemoveFromDiagram,initialScopeTitle,onScopeChange}) {
  // `skills` is the whole current library. `available` starts from it and grows
  // only through a successful install; members stay the roots' requires closure.
  const [available,setAvailable] = useState(() => (Array.isArray(skills) ? skills : []));
  const skillsRef = useRef(skills);
  useEffect(() => {
    if (skillsRef.current === skills) return;
    skillsRef.current = skills;
    setAvailable(previous => mergeInventory(previous, Array.isArray(skills) ? skills : []));
  }, [skills]);
  const index = useMemo(() => skillIndex(available), [available]);
  const candidates = useMemo(() => installCandidates(localSkills), [localSkills]);
  const [initial] = useState(() => {
    const roots = rootIds(mode);
    return {draft: normalizeArchitecture(mode?.architecture, memberIds(roots, skills)), roots, document:mode.document};
  });
  const [history,setHistory] = useState(() => createHistory(initial));
  const [scopeId,setScopeId] = useState(() => initial.draft.paradigms.find(p=>p.title===initialScopeTitle)?.id || (initialScopeTitle==='通用能力'?SHARED:initial.draft.paradigms[0]?.id) || SHARED);
  const [editingScope,setEditingScope]=useState(false);
  const [query,setQuery] = useState(initialQuery);
  const [notice,setNotice] = useState('');
  const [installing,setInstalling] = useState('');
  const [saving,setSaving]=useState(false);
  const edit = useRef({key: '', at: 0});

  const {draft,roots} = history.present;
  const members = useMemo(() => memberIds(roots, available), [roots, available]);
  const scope = scopeOf(draft, scopeId);
  const validation = useMemo(() => validateDraft({draft, members}), [draft, members]);
  const dirty = metadataDirty || !sameState(history.present, initial);

  useEffect(() => {
    if (scopeId !== SHARED && !draft.paradigms.some(paradigm => paradigm.id === scopeId)) setScopeId(SHARED);
  }, [scopeId, draft.paradigms]);

  const update = useCallback(change => {
    const present={...history.present,document:mode.document};
    const next=typeof change==='function'?change(present):change;
    setHistory(commitHistory({...history,present},next));
    if(next.document!==mode.document)onDocumentChange(next.document);
  }, [history,mode.document,onDocumentChange]);
  // Typing inside one field stays a single undo step.
  const updateTyped = useCallback((key, change) => {
    const now = Date.now();
    const fresh = key !== edit.current.key || now - edit.current.at > 1500;
    edit.current = {key, at: now};
    setHistory(state => {
      const next = typeof change === 'function' ? change(state.present) : change;
      return fresh ? commitHistory(state, next) : {...state, present: next};
    });
  }, []);
  const undo = useCallback(() => {const next=undoHistory(history);setHistory(next);onDocumentChange(next.present.document);}, [history,onDocumentChange]);
  const redo = useCallback(() => {const next=redoHistory(history);setHistory(next);onDocumentChange(next.present.document);}, [history,onDocumentChange]);

  useEffect(() => {
    function onKey(event) {
      if (!(event.metaKey || event.ctrlKey)) return;
      const target = event.target;
      if (target && typeof target.closest === 'function' && target.closest('input, textarea')) return;
      const key = event.key.toLowerCase();
      if (key === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
      else if (key === 'y') { event.preventDefault(); redo(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  function showScope(id) {
    setScopeId(id);
    setEditingScope(false);
    onScopeChange?.(scopeOf(draft,id)?.title);
  }

  function placeSkillTo(skillId, target) {
    if (!isSkillId(skillId)) return;
    update(present => ({...present, draft: placeSkill(present.draft, skillId, target, target ? '' : scopeId)}));
  }

  function addRootAt(skillId, diagramAlreadyChanged=false, document=mode.document, inventory=available) {
    try{if(!diagramAlreadyChanged)document=onAddToDiagram?.(inventory.find(s=>s.id===skillId)||{id:skillId,title:skillId})||document;}
    catch(error){setNotice(error.message);return false;}
    update(present => {
      const roots = present.roots.includes(skillId) ? present.roots : [...present.roots, skillId];
      let draft = placeSkill(present.draft, skillId, scopeId);
      for (const dependency of memberIds([skillId], inventory))
        if (!assignedScopes(draft, dependency).length) draft = placeSkill(draft, dependency, scopeId);
      return {...present, roots, draft, document};
    });
    return true;
  }

  // Install only through the callback, and only write references after it
  // actually reports the skill back. A library skill with the same id is used
  // as-is instead of being replaced by the local folder.
  async function installBySource(sourceKey) {
    const candidate = candidates.find(row => row.sourceKey === sourceKey);
    if (!candidate) return;
    if (index.has(candidate.id)) {
      if(!window.confirm(`库内已有“${index.get(candidate.id).title||candidate.id}”，将使用本地版本，继续？`))return;
      setNotice(`库内已有 ${candidate.id}，用库内版本`);
      addRootAt(candidate.id);
      return;
    }
    if (typeof onLocalSkillAdded !== 'function') {
      setNotice(`未连接导入，无法安装 ${candidate.id}`);
      return;
    }
    if (installing) return;
    setInstalling(candidate.sourceKey);
    setNotice(`正在加入 ${candidate.title || candidate.id}…`);
    try {
      const result = await onLocalSkillAdded(candidate);
      const inventory = Array.isArray(result?.skills) ? result.skills : null;
      if (!inventory) throw new Error('安装回调没有返回 {skills} 目录');
      if (!inventory.some(skill => skill?.id === candidate.id)) throw new Error('安装结果里没有这个技能');
      setAvailable(previous => mergeInventory(previous, inventory));
      if(!addRootAt(candidate.id,false,mode.document,inventory)){
        setNotice(message=>`${result.staged?'技能已留在草稿':'技能已保存到库'}，尚未加入画板：${message}`);return;
      }
      setNotice(result.staged?'已加入草稿，保存后写入工作库。':'技能已采用到本地，保存后更新模式。');
    } catch (error) {
      setNotice(`未加入 ${candidate.id}：${error?.message || error}`);
    } finally {
      setInstalling('');
    }
  }

  function dropSkill(payload) {
    if (payload?.source) { void installBySource(payload.source); return; }
    if (index.has(payload?.id)) addRootAt(payload.id);
  }

  function removeNode(id) {
    try {
      const next=removeScopeSkill({...history.present,document:mode.document},id,scopeId,available);
      const removed=members.filter(skill=>!memberIds(next.roots,available).includes(skill));
      next.document=onRemoveFromDiagram(mode.document,removed);
      update(next);setNotice('');
    }
    catch(error){setNotice(error.message);}
  }

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = members.map(id => {
      const skill = index.get(id);
      const scopes = assignedScopes(draft, id);
      const elsewhere = scopes.filter(scope => scope !== scopeId);
      return {
        id,
        title: displayTitle(draft, index, id),
        note: skill?.description || '',
        current: scopeIncludes(draft, scopeId, id),
        scopes,
        scopeLabel: elsewhere.map(scope => scopeTitle(draft, scope)).join('、'),
      };
    }).filter(row => !needle || `${row.title} ${row.id} ${row.note}`.toLowerCase().includes(needle));
    return [
      {id: 'unassigned', title: `待归属 · ${rows.filter(row => !row.scopes.length).length}`, rows: rows.filter(row => !row.scopes.length)},
      {id: 'current', title: scopeId === SHARED ? '通用能力' : `当前 · ${scopeTitle(draft, scopeId)}`, rows: rows.filter(row => row.current)},
      {id: 'elsewhere', title: '其他', rows: rows.filter(row => !row.current && row.scopes.length)},
    ].filter(group => group.rows.length);
  }, [members, index, draft, query, scopeId]);

  const localRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const byId=new Map();
    for(const candidate of candidates) {
      if(!byId.has(candidate.id))byId.set(candidate.id,{...candidate,sources:[]});
      byId.get(candidate.id).sources.push(candidate);
    }
    return [...byId.values()].filter(candidate=>!needle || `${candidate.title || ''} ${candidate.id} ${candidate.description || ''} ${candidate.sourceKey}`.toLowerCase().includes(needle));
  }, [candidates, index, query]);

  // The selected library wins; additional local sources never duplicate its rows.
  const libraryCandidates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...index.values()]
      .filter(skill => !members.includes(skill.id))
      .filter(skill => !needle || `${skill.title || ''} ${skill.id} ${skill.description || ''}`.toLowerCase().includes(needle));
  }, [index, members, query]);

  const status = validation.ok
    ? '全部已归属'
    : validation.unassigned.length ? `${validation.unassigned.length} 个待归属` : validation.errors[0].message;

  const leave=useLeaveGuard(dirty,!!installing||saving);

  function close() {
    if(installing||saving){setNotice('正在写入，请稍候');return;}
    leave(onClose);
  }

  function addNewParadigm() {
    const id = `pattern-${crypto.randomUUID().slice(0, 8)}`;
    update(present => ({...present, draft: addParadigm(present.draft, id)}));
    showScope(id);
    setEditingScope(true);
  }

  async function save() {
    if (!dirty || !metadataValid || !validation.ok || installing) return;
    setSaving(true);setNotice('');
    try{await onSave(saveRequest({mode, draft, roots}));}
    catch(error){setNotice(error.message);}
    finally{setSaving(false);}
  }

  // The Mode name lives in the compact strip above the canvas; the page heading stays
  // a short label so the workbench itself keeps the space.
  return <Dialog title="模式" onClose={close} wide>
    {documentOpen&&documentEditor}
    <div className="graph-editor" hidden={documentOpen} inert={saving||!!installing}>
      <div className="graph-editor-bar">
        <div className="graph-tabs" role="tablist" aria-label="工作范式">
          {draft.paradigms.map((paradigm,position) => <button key={paradigm.id} role="tab" aria-selected={paradigm.id === scopeId}
            className={paradigm.id === scopeId ? 'active' : ''} onClick={() => showScope(paradigm.id)}>
            {paradigm.title || `新范式 ${position + 1}`}<small>{paradigm.skills.length}</small>
          </button>)}
          <button role="tab" aria-selected={scopeId === SHARED} className={scopeId === SHARED ? 'active' : ''} onClick={() => showScope(SHARED)}>通用能力<small>{draft.shared.length}</small></button>
          <button type="button" className="graph-tab-add" aria-label="新增范式" title="新增范式" onClick={addNewParadigm}><Plus size={14} /></button>
        </div>
        <div className="graph-editor-actions">
          {scopeId!==SHARED&&<button type="button" aria-label="编辑范式" title="编辑范式" onClick={()=>setEditingScope(!editingScope)}><Pencil size={15}/></button>}
          <button type="button" aria-label="撤销" title="撤销" disabled={!history.past.length} onClick={undo}><Undo2 size={15} /></button>
          <button type="button" aria-label="重做" title="重做" disabled={!history.future.length} onClick={redo}><Redo2 size={15} /></button>
        </div>
      </div>

      {editingScope && scopeId!==SHARED && <div className="graph-scope-editor">
        <input autoFocus aria-label="范式名称" maxLength={LIMITS.title} value={scope?.title || ''} onChange={event=>updateTyped(`scope:${scopeId}:title`,present=>({...present,draft:updateParadigm(present.draft,scopeId,{title:event.target.value})}))}/>
        <textarea aria-label="范式说明" rows={2} maxLength={LIMITS.description} value={scope?.description || ''} onChange={event=>updateTyped(`scope:${scopeId}:description`,present=>({...present,draft:updateParadigm(present.draft,scopeId,{description:event.target.value})}))}/>
        <button onClick={()=>{update(present=>({...present,draft:removeParadigm(present.draft,scopeId)}));showScope(SHARED);}}>移除范式</button><button onClick={()=>setEditingScope(false)}>完成</button>
      </div>}

      <div className="graph-workbench">
        <aside className="graph-pane graph-pane-skills" aria-label="技能清单">
          <PanelResize name="mode-skills" label="调整模式技能栏宽度" initial={240} min={180}/>
          <div className="graph-pane-heading"><span>技能</span><small>{members.length}</small></div>
          <div className="graph-search"><Search size={13} aria-hidden="true" /><input type="search" aria-label="搜索技能" placeholder="搜索" value={query} onChange={event => setQuery(event.target.value)} /></div>
          <div className="graph-skills">
            {groups.map(group => <section className="graph-skill-group" key={group.id}>
              <h4>{group.title}</h4>
              {group.rows.map(row => <SkillRow key={row.id} row={row}
                onOpen={id => { if(!row.current && row.scopes.length)showScope(row.scopes[0]);onOpenSkill?.(index.get(id)); }}
                onPlace={id => placeSkillTo(id, scopeId)}
                onClear={removeNode} />)}
            </section>)}
            {!groups.length ? <p className="graph-list-note">无匹配</p> : null}
            {libraryCandidates.length ? <section className="graph-skill-group">
              <h4>库内 · {libraryCandidates.length}</h4>
              {libraryCandidates.map(skill => <div className="graph-skill" key={skill.id} draggable title="拖到画布加入"
                onDragStart={event => {
                  event.dataTransfer.setData('application/x-asl-skill', skill.id);
                  event.dataTransfer.setData('text/plain', skill.id);
                  event.dataTransfer.effectAllowed = 'copy';
                }}>
                <Puzzle size={13} aria-hidden="true" />
                <button type="button" className="graph-skill-open" onClick={()=>onOpenSkill?.(skill)}><span className="graph-skill-text"><strong>{skill.title || skill.id}</strong><small>{skill.id}</small></span></button>
                <button type="button" className="icon-button" aria-label={`加入 ${skill.title || skill.id}`} title="加入当前归属" onClick={() => addRootAt(skill.id)}><Plus size={13} /></button>
              </div>)}
            </section> : null}
            {localRows.length ? <section className="graph-skill-group">
              <h4>{candidateLabel} · {localRows.length}</h4>
              {localRows.map(candidate => <CandidateRow key={candidate.id} candidate={candidate}
                busy={!!installing}
                onOpen={onOpenCandidate}
                onInstall={sourceKey => { void installBySource(sourceKey); }} />)}
            </section> : null}
          </div>
        </aside>

        <section className="graph-pane" aria-label="技能节点画布"
          onDragOver={event=>event.preventDefault()} onDrop={event=>{
            event.preventDefault();const source=event.dataTransfer.getData('application/x-asl-skill-source');
            dropSkill(source?{source}:{id:event.dataTransfer.getData('application/x-asl-skill')});
          }}>
          {renderCanvas({draft,roots,members,available,scopeId,onSelectScope:showScope,onEditDocument:(document,skill)=>skill?addRootAt(skill.id,true,document):update(present=>({...present,document}))})}
        </section>

      </div>
    </div>
    {notice ? <p className="graph-list-note graph-notice" role="alert">{notice}</p> : null}
    <div className="dialog-actions">
      <span className={validation.ok ? 'muted' : 'graph-status has-error'} role="status">{status}</span>
      <button type="button" onClick={close}>取消</button>
      <button type="button" className="primary" disabled={!dirty || !metadataValid || !validation.ok || !!installing || saving} onClick={save}><Save size={15} aria-hidden="true" />保存</button>
    </div>
  </Dialog>;
}
