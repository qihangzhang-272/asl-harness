import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Network, Plus, Puzzle, Redo2, Save, Search, Undo2, X, Pencil} from 'lucide-react';
import GraphCanvas from './GraphCanvas.jsx';
import './graph-editor.css';
import {
  LIMITS, SHARED, addEdge, addParadigm, assignedScopes, commitHistory, createHistory,
  displayTitle, installCandidates, isSkillId, memberIds, mergeInventory,
  normalizeArchitecture, placeSkill, projectGraph, redoHistory, removeEdge, removeParadigm, removeScopeSkill, rootIds,
  saveRequest, sameState, scopeIncludes, scopeOf, setNodeOverride, setPositions, skillIndex,
  undoHistory, updateEdge, updateParadigm, validateDraft,
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


function useReducedMotion() {
  const [reduced,setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return undefined;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return reduced;
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
function CandidateRow({candidate,conflict,busy,onInstall}) {
  const [source,setSource]=useState(candidate.sourceKey);
  const chosen=candidate.sources?.find(row=>row.sourceKey===source)||candidate;
  return <div
    className={`graph-skill${conflict ? ' is-conflict' : ''}`}
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
      <strong>{candidate.title || candidate.id}</strong>
      {candidate.sources?.length>1?<select aria-label={`${candidate.id} 的来源`} value={chosen.sourceKey} onChange={event=>setSource(event.target.value)}>
        {candidate.sources.map(row=><option key={row.sourceKey} value={row.sourceKey}>{row.source}</option>)}
      </select>:<small title={chosen.source}>{candidate.id}</small>}
    </span>
    <button type="button" className="icon-button" disabled={busy}
      aria-label={`加入 ${candidate.title || candidate.id}`}
      title={conflict ? '库内已有同名技能，用库内版本' : '安装并加入'}
      onClick={() => onInstall(chosen.sourceKey)}><Plus size={13} /></button>
  </div>;
}

// Host contract:
//   mode     Mode record {id, title, fingerprint, document, roots, skills, architecture}
//   skills   every available skill of the current library: {id, title, description, requires?}
//   localSkills  install sources {id, title, description, requires?, source, ...}; source is the drag key
//   onLocalSkillAdded(skill)  async; installs then resolves {skills} (updated library inventory), throws on failure
//   onSave(request)  receives saveRequest(...) for mode.save; Dialog / Field / onClose are host chrome
export default function ParadigmEditor({mode,skills,Dialog,Field,onSave,onClose,localSkills=[],onLocalSkillAdded,metadataDirty=false,metadataValid=true,documentOpen=false,documentEditor=null,membersOnly=false}) {
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
    return {draft: normalizeArchitecture(mode?.architecture, memberIds(roots, skills)), roots};
  });
  const [history,setHistory] = useState(() => createHistory(initial));
  const [scopeId,setScopeId] = useState(() => initial.draft.paradigms[0]?.id || SHARED);
  const [selection,setSelection] = useState(null);
  const [editingScope,setEditingScope]=useState(false);
  const [query,setQuery] = useState('');
  const [notice,setNotice] = useState('');
  const [installing,setInstalling] = useState('');
  const reducedMotion = useReducedMotion();
  const stamp = useRef(0);
  const edit = useRef({key: '', at: 0});

  const {draft,roots} = history.present;
  const members = useMemo(() => memberIds(roots, available), [roots, available]);
  const scope = scopeOf(draft, scopeId);
  const validation = useMemo(() => validateDraft({draft, members}), [draft, members]);
  const dirty = metadataDirty || !sameState(history.present, initial);
  const graph = useMemo(() => projectGraph({draft, scopeId, index}), [draft, scopeId, index]);

  useEffect(() => {
    if (scopeId !== SHARED && !draft.paradigms.some(paradigm => paradigm.id === scopeId)) setScopeId(SHARED);
  }, [scopeId, draft.paradigms]);

  const update = useCallback(change => {
    setHistory(state => commitHistory(state, typeof change === 'function' ? change(state.present) : change));
  }, []);
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
  const undo = useCallback(() => setHistory(state => undoHistory(state)), []);
  const redo = useCallback(() => setHistory(state => redoHistory(state)), []);

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

  const select = useCallback(next => {
    if (!next) { setSelection(null); return; }
    stamp.current += 1;
    setSelection({kind: next.kind, id: next.id, auto: !!next.auto, stamp: stamp.current});
  }, []);

  function showScope(id) {
    setScopeId(id);
    setSelection(null);
    setEditingScope(false);
  }

  /** Positions of the nodes currently on screen, so a drop keeps every other node still. */
  function currentPositions() {
    const positions = {};
    for (const node of graph.nodes) positions[node.id] = node.position;
    return positions;
  }

  // `from` is the scope on screen: removing there never touches the skill's other
  // paradigms. Adding to a paradigm only takes it out of shared.
  function placeSkillTo(skillId, target, position) {
    if (!isSkillId(skillId)) return;
    update(present => {
      let next = placeSkill(present.draft, skillId, target, target ? '' : scopeId);
      if (position && target) next = setPositions(next, target, {...currentPositions(), [skillId]: position});
      return {...present, draft: next};
    });
    if(target) select({kind:'node',id:skillId});
  }

  /** Add a brand new (or freshly installed) root and drop it into the scope on screen. */
  function addRootAt(skillId, position) {
    update(present => {
      const roots = present.roots.includes(skillId) ? present.roots : [...present.roots, skillId];
      let next = placeSkill(present.draft, skillId, scopeId);
      if (position) next = setPositions(next, scopeId, {...currentPositions(), [skillId]: position});
      return {...present, roots, draft: next};
    });
    select({kind:'node',id:skillId});
  }

  // Install only through the callback, and only write references after it
  // actually reports the skill back. A library skill with the same id is used
  // as-is instead of being replaced by the local folder.
  async function installBySource(sourceKey, position) {
    const candidate = candidates.find(row => row.sourceKey === sourceKey);
    if (!candidate) return;
    if (index.has(candidate.id)) {
      setNotice(`库内已有 ${candidate.id}，用库内版本`);
      addRootAt(candidate.id, position);
      return;
    }
    if (typeof onLocalSkillAdded !== 'function') {
      setNotice(`未连接导入，无法安装 ${candidate.id}`);
      return;
    }
    if (installing) return;
    setInstalling(candidate.sourceKey);
    setNotice(`安装 ${candidate.title || candidate.id}…`);
    try {
      const result = await onLocalSkillAdded(candidate);
      const inventory = Array.isArray(result?.skills) ? result.skills : null;
      if (!inventory) throw new Error('安装回调没有返回 {skills} 目录');
      if (!inventory.some(skill => skill?.id === candidate.id)) throw new Error('安装结果里没有这个技能');
      setAvailable(previous => mergeInventory(previous, inventory));
      addRootAt(candidate.id, position);
      setNotice(`已安装 ${candidate.title || candidate.id}`);
    } catch (error) {
      setNotice(`未安装 ${candidate.id}：${error?.message || error}`);
    } finally {
      setInstalling('');
    }
  }

  function dropSkill(payload, position) {
    if (!payload) return;
    if (payload.source) { void installBySource(payload.source, position); return; }
    const skillId = payload.id;
    if (!skillId || !index.has(skillId)) return;
    if (!members.includes(skillId)) { addRootAt(skillId, position); return; }
    if (scopeIncludes(draft, scopeId, skillId)) {
      update(present => ({...present, draft: setPositions(present.draft, scopeId, {[skillId]: position})}));
      return;
    }
    placeSkillTo(skillId, scopeId, position);
  }

  function connectEdge(connection) {
    const from = connection.source, to = connection.target;
    if (!from || !to || from === to) return;
    update(present => ({...present, draft: addEdge(present.draft, scopeId, {from, to, label: '', sourceHandle: connection.sourceHandle, targetHandle: connection.targetHandle})}));
    select({kind: 'edge', id: `${from}->${to}`, auto: true});
  }

  const moveNodes = useCallback(positions => {
    update(present => ({...present, draft: setPositions(present.draft, scopeId, positions)}));
  }, [scopeId, update]);

  const nudgeNodes = useCallback((ids, delta) => {
    update(present => {
      const positions = {};
      for (const node of graph.nodes) positions[node.id] = node.position;
      for (const id of ids) {
        const point = positions[id];
        if (point) positions[id] = {x: point.x + delta.x, y: point.y + delta.y};
      }
      return {...present, draft: setPositions(present.draft, scopeId, positions)};
    });
  }, [graph, scopeId, update]);

  const deleteEdge = useCallback(key => {
    update(present => ({...present, draft: removeEdge(present.draft, scopeId, key)}));
    select(null);
  }, [scopeId, update, select]);
  function removeNode(id) {
    try { update(removeScopeSkill(history.present,id,scopeId,available));select(null);setNotice(''); }
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
    for(const candidate of candidates.filter(item=>!index.has(item.id))) {
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

  function close() {
    if(installing){setNotice('正在写入，请稍候');return;}
    if (!dirty || window.confirm('有未保存的修改，放弃？')) onClose();
  }

  function addNewParadigm() {
    const id = `pattern-${crypto.randomUUID().slice(0, 8)}`;
    update(present => ({...present, draft: addParadigm(present.draft, id)}));
    showScope(id);
    setEditingScope(true);
  }

  function save() {
    if (!dirty || !metadataValid || !validation.ok || installing) return;
    onSave(saveRequest({mode, draft, roots}));
  }

  // The Mode name lives in the compact strip above the canvas; the page heading stays
  // a short label so the workbench itself keeps the space.
  return <Dialog title="模式" onClose={close} wide>
    {documentOpen&&documentEditor}
    <div className="graph-editor" hidden={documentOpen}>
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
          <div className="graph-pane-heading"><span>技能</span><small>{members.length}</small></div>
          <div className="graph-search"><Search size={13} aria-hidden="true" /><input type="search" aria-label="搜索技能" placeholder="搜索" value={query} onChange={event => setQuery(event.target.value)} /></div>
          <div className="graph-skills">
            {groups.map(group => <section className="graph-skill-group" key={group.id}>
              <h4>{group.title}</h4>
              {group.rows.map(row => <SkillRow key={row.id} row={row}
                onOpen={id => { if(!row.current && row.scopes.length)showScope(row.scopes[0]);if(row.scopes.length)select({kind:'node',id}); }}
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
                <span className="graph-skill-text"><strong>{skill.title || skill.id}</strong><small>{skill.id}</small></span>
                <button type="button" className="icon-button" aria-label={`加入 ${skill.title || skill.id}`} title="加入当前归属" onClick={() => addRootAt(skill.id)}><Plus size={13} /></button>
              </div>)}
            </section> : null}
            {localRows.length ? <section className="graph-skill-group">
              <h4>本机 · {localRows.length}</h4>
              {localRows.map(candidate => <CandidateRow key={candidate.id} candidate={candidate}
                conflict={index.has(candidate.id)} busy={installing === candidate.sourceKey}
                onInstall={sourceKey => { void installBySource(sourceKey); }} />)}
            </section> : null}
            {notice ? <p className="graph-list-note graph-notice" role="status">{notice}</p> : null}
          </div>
        </aside>

        <section className="graph-pane" aria-label={membersOnly?'当前分组技能':'技能节点画布'}
          onDragOver={membersOnly?event=>event.preventDefault():undefined} onDrop={membersOnly?event=>{
            event.preventDefault();const source=event.dataTransfer.getData('application/x-asl-skill-source');
            dropSkill(source?{source}:{id:event.dataTransfer.getData('application/x-asl-skill')});
          }:undefined}>
          {membersOnly?<div className="graph-skills" aria-label="当前分组技能">
            {(scope?.skills||[]).map(id=><SkillRow key={id} row={{id,title:displayTitle(draft,index,id),current:true}}
              onPlace={skill=>placeSkillTo(skill,scopeId)} onClear={removeNode}/>)}
          </div>:<GraphCanvas
            key={scopeId}
            scopeId={scopeId}
            graph={graph}
            selection={selection}
            reducedMotion={reducedMotion}
            onMoveNode={moveNodes}
            onNudge={nudgeNodes}
            onConnectEdge={connectEdge}
            onRemoveEdge={deleteEdge}
            onRemoveNode={removeNode}
            onEditNode={(id,patch,key)=>updateTyped(`node:${id}:${key}`,present=>({...present,draft:setNodeOverride(present.draft,id,patch)}))}
            onEditEdge={(id,patch,key)=>updateTyped(`edge:${id}:${key}`,present=>({...present,draft:updateEdge(present.draft,scopeId,id,patch)}))}
            onSelect={select}
            onOpen={(kind, id) => select({kind, id, auto: true})}
            onDropSkill={dropSkill}
          />}
        </section>

      </div>
    </div>
    <div className="dialog-actions">
      <span className={validation.ok ? 'muted' : 'graph-status has-error'} role="status">{status}</span>
      <button type="button" onClick={close}>取消</button>
      <button type="button" className="primary" disabled={!dirty || !metadataValid || !validation.ok || !!installing} onClick={save}><Save size={15} aria-hidden="true" />保存</button>
    </div>
  </Dialog>;
}
