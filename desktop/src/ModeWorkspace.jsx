import React, {createContext, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {FolderOpen, RotateCw} from 'lucide-react';
import ParadigmEditor from './ParadigmEditor.jsx';
import EditorPage from './EditorPage.jsx';
import Markdown from './Markdown.jsx';
import {diagramsIn,replaceDiagram,editFlowchart,diagramLabel,flowchartItems} from './mermaid-document.mjs';
import {modeDiagramDocument,skillNodes,diagramBlock,withoutSkillNodes} from './mode-diagrams.mjs';
import MermaidEdit from './MermaidEdit.jsx';
import SkillCanvas from './SkillCanvas.jsx';
import {memberIds} from './graph-model.mjs';
import {ReadStatus} from './useReadTasks.jsx';
import {
  candidateImportRequest, localSkillCandidates, modeDocument, readModeDocument,
} from './presentation.mjs';
import './mode-workspace.css';

// One page owns the draft, membership and native Mermaid; the core owns the write gate.
const FrameContext = createContext({Dialog: EditorPage, meta: null});
const DefaultField = ({label, children}) => <label className="field"><span>{label}</span>{children}</label>;
// The core names a Mode folder with workspace.SAFE_ID = [A-Za-z0-9][A-Za-z0-9._-]*.
// The editor must accept exactly what mode.save accepts, no narrower rule.
const MODE_FOLDER = '[A-Za-z0-9][A-Za-z0-9._-]*';
const MODE_FOLDER_VALID = new RegExp(`^${MODE_FOLDER}$`);

// Stable identity: ParadigmEditor must not be remounted when the workspace re-renders,
// otherwise every keystroke would drop the unsaved canvas and its history.
function WorkspaceFrame({title, children, onClose, wide}) {
  const {Dialog, meta} = useContext(FrameContext);
  const Page = Dialog || EditorPage;
  return <Page title={title} onClose={onClose} wide={wide}>{meta}{children}</Page>;
}

/**
 * New and existing Modes both open here: left 本库/本机技能, right 范式图 with inline editing.
 * The wrapper owns the Mode name and Markdown, the local discovery and the real
 * skill.import preview/apply; ParadigmEditor owns the graph and the save request.
 */
export default function ModeWorkspace({
  mode = null, draft = null, catalog = null, workspace, api, read, reads,
  Dialog = EditorPage, Field = DefaultField, onSave, onCatalog, onClose, readFile, saveFile, initialTitle = '', preloadedReport,
}) {
  const source = useMemo(() => readModeDocument(mode?.document), [mode]);
  const [name, setName] = useState(() => draft?.name ?? source.name);
  const [body, setBody] = useState(() => mode
    ? readModeDocument(modeDiagramDocument(mode,catalog?.skills||[])).body
    : (draft?.body||'')+diagramBlock('技能协作',['flowchart LR',...skillNodes((catalog?.skills||[]).filter(s=>memberIds(draft?.roots||[],catalog?.skills||[]).includes(s.id))).map(n=>`${n.alias}["${diagramLabel(n.data.title)}"]`)].join('\n')));
  const [diagramIndex,setDiagramIndex]=useState(()=>Math.max(0,diagramsIn(body).findIndex(d=>d.title===initialTitle)));
  const [selected,setSelected]=useState(null);
  const [expanded,setExpanded]=useState(false);
  const [id, setId] = useState(() => mode?.id || draft?.id || `mode-${crypto.randomUUID().slice(0, 8)}`);
  // Freeze identity fields at open time so an import or a background refresh can never
  // change what the fingerprint check compares against.
  const [roots] = useState(() => (Array.isArray(draft?.roots) && draft.roots.length
    ? draft.roots.filter(Boolean)
    : (mode?.roots || [])));
  const [fingerprint] = useState(() => mode?.fingerprint);
  const [capabilities] = useState(() => mode?.capabilities);
  // A Mode without a usable architecture (new, or a legacy one with no authored
  // relations) opens on one work paradigm instead of an empty canvas. Authored v0.4
  // paradigms and legacy edge maps are kept exactly as saved.
  const [architecture] = useState(() => {
    const saved = mode?.architecture;
    if (saved?.paradigms || (Array.isArray(saved?.edges) && saved.edges.length)) return saved;
    const shared = Array.isArray(saved?.shared) ? saved.shared : [];
    return {
      nodes: Array.isArray(saved?.nodes) ? saved.nodes : [],
      shared,
      paradigms: [{id: 'main', title: '技能协作', description: draft?.body || source.body || '组织本模式使用的技能',
        skills: memberIds(roots,catalog?.skills||[]).filter(skill => !shared.includes(skill))}],
    };
  });
  const [librarySkills, setLibrarySkills] = useState(() => catalog?.skills || []);
  const [report, setReport] = useState(() => draft?.report || preloadedReport || null);
  useEffect(()=>{if(preloadedReport)setReport(preloadedReport);},[preloadedReport]);
  const [importing, setImporting] = useState('');
  const [error, setError] = useState('');
  const [pane,setPane]=useState('canvas');
  const [documentEditing,setDocumentEditing]=useState(false);
  const live=useRef(true);
  useEffect(()=>{live.current=true;return()=>{live.current=false;reads?.cancel('mode-workspace-local');};},[]);

  // Read-back after an import only replaces the skill list; the canvas stays mounted.
  useEffect(() => { if (catalog?.skills) setLibrarySkills(catalog.skills); }, [catalog]);

  const candidates = useMemo(
    () => localSkillCandidates(librarySkills, report?.skills || []).filter(candidate=>candidate.state!=='installed'),
    [librarySkills, report],
  );
  const isNew = !fingerprint;
  const idValid = MODE_FOLDER_VALID.test(id);
  const currentMode = useMemo(() => ({
    id,
    title: name.trim() || (isNew ? '新建工作模式' : mode?.title || id),
    document: mode && name===source.name && body===source.body ? mode.document : modeDocument(name, body),
    roots, fingerprint, capabilities, architecture,
  }), [id, name, body, roots, fingerprint, capabilities, architecture, isNew, mode]);

  function scan(extra) {
    setError('');
    read('mode-workspace-local', '正在扫描', async call => {
      const next=extra ? await call('localSkills', extra) : await call('localSkills');
      if(live.current)setReport(next);
    });
  }
  async function chooseDirectory() {
    try {
      const folder = await api('choose', 'skillSearchRoot');
      if (folder) scan(folder);
    } catch (failure) { setError(failure.message); }
  }

  // ParadigmEditor calls this before it adds the skill to its roots. Only a completed
  // import returns the refreshed catalog; a same-name library version is reused as-is.
  async function addLocalSkill(skill) {
    // Resolve the exact source row the editor sent; the same id may have several folders.
    const entry = candidates.find(candidate => candidate.source && candidate.source === skill?.source)
      || candidates.find(candidate => candidate.id === skill?.id) || skill;
    if (!entry?.id) throw new Error('没有可加入的技能来源');
    const existing = librarySkills.find(candidate => candidate.id === entry.id);
    const request = candidateImportRequest(entry, existing);
    if (!request) return {skills: librarySkills};
    setImporting(entry.id);
    setError('');
    try {
      const preview = await api('run', 'edit', {workspace, request});
      const confirmed = preview?.sourceFingerprint ? {...request, expectedSource: preview.sourceFingerprint} : request;
      const result = await api('run', 'edit', {workspace, request: confirmed, apply: true});
      if (result?.canceled) throw new Error('已取消导入，未加入当前模式。');
      const next = await api('run', 'catalog', {workspace});
      setLibrarySkills(next.skills || []);
      onCatalog?.(next);
      return {skills: next.skills || []};
    } catch (failure) {
      setError(failure.message);
      throw failure;
    } finally { setImporting(''); }
  }

  function handleSave(request) {
    const next = {...request};
    // A brand-new Mode starts without capabilities; carry the copied/previewed ones,
    // pruned to the members that survive. Existing Modes keep the core's own pruning.
    if (!fingerprint && capabilities) {
      const allowed = new Set(request.skills || []);
      next.capabilities = capabilities.map(group => ({...group, skills: (group.skills || []).filter(skill => allowed.has(skill))}));
    }
    return onSave(next);
  }

  function requestClose() {
    if(importing)return;
    onClose();
  }

  // Canvas and document keep their unsaved state when switching tabs.
  const meta = <section className="mode-workspace-meta">
    <Field label="名称">
      <input className="mode-workspace-name" aria-label="模式名称" required maxLength={80} value={name}
        onChange={event => setName(event.target.value)} />
    </Field>
    <div className="mode-workspace-tabs" role="tablist" aria-label="编辑内容">
      <button role="tab" aria-selected={pane==='canvas'} onClick={()=>setPane('canvas')}>画布</button>
      <button role="tab" aria-selected={pane==='document'} onClick={()=>setPane('document')}>文档</button>
    </div>
    <div className="mode-workspace-tools">
      <button type="button" title="重新扫描本机技能" onClick={() => scan()} disabled={!!importing}><RotateCw size={15} aria-hidden="true" />扫描</button>
      <button type="button" title="选择技能目录" onClick={chooseDirectory} disabled={!!importing}><FolderOpen size={15} aria-hidden="true" />目录</button>
      {importing ? <small role="status">导入中…</small> : null}
    </div>
    {isNew ? <details className="mode-workspace-id">
      <summary title="文件夹名称">文件夹</summary>
      <input aria-label="模式文件夹名称" required pattern={MODE_FOLDER}
        value={id} onChange={event => setId(event.target.value)} />
    </details> : null}
    {isNew && !idValid
      ? <p role="alert" className="inline-note">文件夹名需以字母或数字开头，只能含字母、数字、点、下划线、短横线。</p>
      : null}
    {reads ? <ReadStatus tasks={reads} /> : null}
    {error ? <p role="alert" className="inline-note">{error}</p> : null}
    {report?.issues?.length ? <details className="mode-workspace-issues">
      <summary>扫描详情</summary>
      {report.issues.map((issue, index) => <p className="path-line" key={index}>{issue.path}：{issue.message}</p>)}
    </details> : null}
  </section>;

  return <FrameContext.Provider value={{Dialog, meta}}>
    <ParadigmEditor
      mode={currentMode}
      metadataDirty={name !== source.name || body !== source.body || !fingerprint}
      metadataValid={!!name.trim() && idValid && !importing}
      documentOpen={pane==='document'}
      onOpenSkill={setSelected}
      initialScopeTitle={diagramsIn(body)[diagramIndex]?.title}
      onScopeChange={title=>{
        const matches=diagramsIn(body).map((d,i)=>({title:d.title,index:i})).filter(d=>d.title===title);
        if(matches.length===1)setDiagramIndex(matches[0].index);
      }}
      onDocumentChange={document=>setBody(readModeDocument(document).body)}
      onRemoveFromDiagram={withoutSkillNodes}
      onAddToDiagram={skill=>{
        const diagrams=diagramsIn(body),index=Math.min(diagramIndex,Math.max(0,diagrams.length-1)),diagram=diagrams[index];
        if(!diagram)throw new Error('先在文档中添加 Mermaid 图');
        const id=skillNodes([skill])[0].alias;
        if(flowchartItems(diagram.source).nodes.some(node=>node.id===id))return;
        return modeDocument(name,replaceDiagram(body,index,editFlowchart(diagram.source,{kind:'add',id,label:skill.title||skill.id})));
      }}
      renderCanvas={({draft:map,members,available,onSelectScope,onEditDocument})=>{
        const diagrams=diagramsIn(body),index=Math.min(diagramIndex,Math.max(0,diagrams.length-1)),diagram=diagrams[index];
        return <div className={`mode-workspace-native architecture-section ${expanded?'is-expanded':''}`}>
          <nav className="diagram-edit-toolbar"><div className="tabs">{diagrams.map((d,i)=><button key={i} className={index===i?'active':''} onClick={()=>{
            setDiagramIndex(i);
            const scopes=[...map.paradigms,{id:'shared',title:'通用能力'}].filter(p=>p.title===d.title);
            if(scopes.length===1)onSelectScope(scopes[0].id);
          }}>{d.title}</button>)}</div>
            <button onClick={()=>{setPane('document');setDocumentEditing(true);}}>原文</button></nav>
          <SkillCanvas selected={selected} onSelect={setSelected} readFile={readFile} saveFile={saveFile}>
            {diagram?<MermaidEdit key={index} source={diagram.source}
              empty={!members.length&&diagram.source.trim()==='flowchart LR'}
              nodes={skillNodes(available.filter(s=>members.includes(s.id)),map.nodes)}
              candidates={skillNodes(available,map.nodes)} compact={!!selected} selectedId={selected?.id}
              expanded={expanded} onExpand={()=>setExpanded(!expanded)}
              onNode={setSelected} onSource={()=>{setPane('document');setDocumentEditing(true);}}
              onChange={(source,skill)=>onEditDocument(modeDocument(name,replaceDiagram(body,index,source)),skill)}/>:<Markdown text={body}/>}
          </SkillCanvas>
        </div>;
      }}
      documentEditor={<section className="mode-workspace-document-pane">
        <div className="mode-workspace-document-toolbar"><span>MODE.md</span><button onClick={()=>setDocumentEditing(!documentEditing)}>{documentEditing?'预览':'编辑'}</button></div>
        {documentEditing?<textarea aria-label="模式说明" autoFocus value={body} onChange={event=>setBody(event.target.value)}/>:<div className="mode-workspace-document-preview" onDoubleClick={()=>setDocumentEditing(true)}><Markdown text={body || '尚未填写'}/></div>}
      </section>}
      skills={librarySkills}
      localSkills={candidates}
      onLocalSkillAdded={addLocalSkill}
      Dialog={WorkspaceFrame}
      onSave={handleSave}
      onClose={requestClose}
    />
  </FrameContext.Provider>;
}
