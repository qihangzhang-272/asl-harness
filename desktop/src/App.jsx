import {SetupDialog,ConnectDialog} from './AgentDialogs.jsx';
import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import SkillFiles from './SkillFiles.jsx';
import SkillCanvas from './SkillCanvas.jsx';
import EditorPage,{useLeaveGuard} from './EditorPage.jsx';
import PanelResize from './PanelResize.jsx';
import DiagramExamples from './DiagramExamples.jsx';
import EnvironmentGuide from './EnvironmentGuide.jsx';
import EnvironmentDocuments from './EnvironmentDocuments.jsx';
import ArchiveBrowser from './ArchiveBrowser.jsx';
import ModeHistory from './ModeHistory.jsx';
import SkillLibrary from './SkillLibrary.jsx';
import Markdown from './Markdown.jsx';
import {Placement} from './ParadigmEditor.jsx';
import ModeWorkspace from './ModeWorkspace.jsx';
import AgentPage from './AgentPage.jsx';
import {useViewState,useScrollMemory} from './useViewState.jsx';
import {ReadCache} from './read-cache.mjs';
import {diagramsIn} from './mermaid-document.mjs';
import {marked} from 'marked';
import {createHistory,commitHistory,undoHistory,redoHistory} from './graph-model.mjs';
import SourceLibrary, {SourceTree} from './SourceLibrary.jsx';
import {navigate} from './motion.js';
import { LocalModes } from './LocalModes.jsx';
import { useReadTasks, ReadStatus } from './useReadTasks.jsx';
import {ArchitectureMap} from './Architecture.jsx';
import {
  Layers3,
  Puzzle,
  Compass,
  SlidersHorizontal,
  Plus,
  Search,
  X,
  ChevronRight,
  ArrowUpRight,
  FolderOpen,
  Download,
  Upload,
  Pencil,
  Archive,
  Check,
  Circle,
  LoaderCircle,
  Network,
  List,
  Box,
  Link2,
  Cloud,
  AlertCircle,
  RotateCw,
  Copy,
  History,
} from "lucide-react";
import {
  adoptionRequest,
  candidateImportRequest,
  localSkillCandidates,
  errorText,
  coreError,
  shortText,
  restoreView,
  matchLocalModes,
  libraryGroups,
  repositorySkillKey,
} from "./presentation.mjs";

const baseName = (value) => (value || "").split(/[\\/]/).filter(Boolean).pop();
const NoticeContext = createContext(null);
async function api(method, ...args) {
  const reply = await window.asl[method](...args);
  if (!reply.ok) throw coreError(reply);
  return reply.value;
}
function IconButton({ icon: Icon, label, ...props }) {
  return (
    <button className="icon-button" title={label} aria-label={label} {...props}>
      <Icon size={17} />
    </button>
  );
}
function Tag({ children, tone = "" }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}
function Dialog({ title, children, onClose, wide = false }) {
  const ref = useRef(null);
  const notice = useContext(NoticeContext);
  useEffect(() => {
    ref.current.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "wide" : ""}
      inert={notice?.busy}
      onCancel={(e) => {
        e.preventDefault();
        if (!notice?.busy) onClose();
      }}
    >
      <div className="dialog-head">
        <h2>{title}</h2>
        <IconButton icon={X} label="关闭" onClick={onClose} />
      </div>
      <div className="dialog-body">
        {notice?.reads && <ReadStatus tasks={notice.reads}/>}
        {notice?.error && (
          <div className="dialog-error" role="alert">
            <AlertCircle size={17} />
            <span>{notice.text}</span>
          </div>
        )}
        {children}
      </div>
    </dialog>
  );
}
function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Empty({ icon: Icon = Box, title, children }) {
  return (
    <div className="empty">
      <Icon size={36} strokeWidth={1.4} />
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function DiscoveredSkills({ report, catalog, readOnly, onInspect, onAdd, onMode, empty = "尚未发现技能" }) {
  const [query, setQuery] = useState("");
  const [limit,setLimit]=useState(12);
  useEffect(()=>setLimit(12),[query,report?.snapshot]);
  const found = localSkillCandidates([],report?.skills || []);
  const filtered = found.filter(s => `${s.title} ${s.description} ${s.id}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <div className="field-heading"><b>{found.length} 个技能</b><button onClick={() => onMode()}><Layers3 size={15} />管理工作模式</button></div>
    {readOnly && <p className="muted">示例库仅供预览。请先打开或创建自己的技能库，再添加技能。</p>}
    {!!found.length && <div className="search"><Search size={16} /><input aria-label="筛选发现的技能" placeholder="搜索已发现的技能" value={query} onChange={e => setQuery(e.target.value)} /></div>}
    <div className="discovered-list">
      {filtered.slice(0,limit).map(s => {
        const existing = catalog?.skills.some(k => k.id === s.id);
        const modes = catalog?.modes.filter(m => m.skills.includes(s.id)) || [];
        return <article className="discovered-skill" key={s.source}>
          <div><strong>{s.title}</strong><p>{shortText(s.description, 160)}</p>
            <Tag>{existing ? "库内有同名技能 · 可复用" : s.inspection?.status === "needs-review" ? "含配套内容" : "可添加"}</Tag>
            {!!modes.length && <div className="discovered-modes"><small>库内版本已在</small>{modes.map(m => <button key={m.id} onClick={() => onMode(m.id)}><Layers3 size={13} />{m.title}</button>)}</div>}
            <details><summary>来源</summary><small className="path-line">{s.origin || s.location || s.source}</small></details>
          </div>
          <div className="discovered-actions">
            <button className="primary" disabled={readOnly} onClick={() => onAdd(s)}><Plus size={15} />{catalog?'加入模式':'新建模式'}</button>
            <button onClick={() => onInspect(s)}>查看内容<ChevronRight size={15} /></button>
          </div>
        </article>;
      })}
    </div>
    {filtered.length>limit&&<button onClick={()=>setLimit(value=>value+12)}>显示更多 · 还有 {filtered.length-limit} 项</button>}
    {!filtered.length && <Empty title={found.length ? "没有匹配的技能" : empty}><p>也可交给 AI 阅读原仓库，整理成工作模式。</p></Empty>}
    {!!report?.issues?.length && <details className="scan-issues"><summary>{report.issues.length} 处需要整理</summary>{report.issues.map((issue, i) => <p className="path-line" key={i}>{issue.path}：{issue.message}</p>)}</details>}
  </>;
}

function SkillEditor({ item, texts, onSave, onClose }) {
  const [id, setId] = useState(item?.id || "");
  const [description, setDescription] = useState("");
  const [document, setDocument] = useState(
    texts?.["SKILL.md"] ||
      "# 新技能\n\n## 用法\n\n## 完成标准\n\n- 交付符合用户要求、可检查的结果。\n",
  );
  const [source, setSource] = useState(
    texts?.["SOURCE.md"] || "# Source\n\n- Origin: local://authored\n",
  );
  const original=useRef({id,description,document,source});
  const dirty=Object.entries({id,description,document,source}).some(([key,value])=>value!==original.current[key]);
  const leave=useLeaveGuard(dirty);
  const close=()=>leave(onClose);
  return (
    <EditorPage title={item ? "编辑技能" : "创建技能"} onClose={close} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            operation: "skill.save",
            id,
            document: item
              ? document
              : `---\nname: ${id}\ndescription: ${JSON.stringify(description)}\n---\n${document}`,
            sourceDocument: source,
            ...(item ? { expected: item.fingerprint } : {}),
          });
        }}
      >
        {!item && (
          <div className="form-columns">
            <Field label="标识">
              <input
                required
                pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="my-skill"
              />
            </Field>
            <Field label="用途">
              <input
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="这个技能能帮助你做什么"
              />
            </Field>
          </div>
        )}
        <Field label="技能内容">
          <textarea
            className="code-editor"
            rows={17}
            required
            value={document}
            onChange={(e) => setDocument(e.target.value)}
          />
        </Field>
        <details>
          <summary>来源</summary>
          <textarea
            rows={5}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        </details>
        <div className="dialog-actions">
          <button type="button" onClick={close}>
            取消
          </button>
          <button className="primary">保存技能</button>
        </div>
      </form>
    </EditorPage>
  );
}


export default function App() {
  const [initial, setInitial] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const currentRoot = useRef(null);
  const catalogCache = useRef(new Map());
  const fileReads=useRef(new ReadCache());
  const canvasHistories=useRef(new Map());
  const [loadingRoot, setLoadingRoot] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [locations, setLocations] = useState(null);
  const [modeId, setModeId] = useState(null);
  const [page, updatePage] = useState("modes");
  const navigationVersion = useRef(0);
  const setPage = value => { navigationVersion.current++; updatePage(value); };
  const [view, setView] = useState("map");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const reads = useReadTasks(error => setMessage({ error: true, text: error.message }));
  const read = reads.read;
  const [modal, setModal] = useState(null);
  const [ready,setReady]=useState(false);
  const [resumeDiscovery,setResumeDiscovery]=useState(null);
  useEffect(() => setMessage(null), [modal?.kind]);
  const [native, setNative] = useState(null);
  const [agentHost,setAgentHost]=useState('codex-app');
  const [provider, setProvider] = useState("github-import");
  const [localReport, setLocalReport] = useState(null);
  const [indexing,setIndexing]=useState(false);
  const localIndex=useRef(null);
  const [localModeReport, setLocalModeReport] = useState(null);
  const [githubUrl, setGithubUrl] = useState("");
  const [cloud, setCloud] = useState(null);
  const [cloudViews,setCloudViews]=useViewState('cloud-locations',{});
  const cloudRequest = useRef(0);
  const cloudCache = useRef(new Map());
  const cloudJobs = useRef(new Map());
  const [,setSourceVersion]=useState(0);
  function repositoryReport(url,refresh=false){
    const previous=cloudJobs.current.get(url);
    if(previous&&(!refresh||previous.refresh))return previous.promise;
    if(!refresh&&cloudCache.current.has(url))return Promise.resolve(cloudCache.current.get(url));
    const job={refresh};
    job.promise=(previous?previous.promise.catch(()=>{}):Promise.resolve()).then(()=>api('githubSkills',url,refresh))
      .then(report=>{cloudCache.current.set(url,report);setSourceVersion(v=>v+1);return report;})
      .finally(()=>{if(cloudJobs.current.get(url)===job)cloudJobs.current.delete(url);});
    cloudJobs.current.set(url,job);return job.promise;
  }
  const [githubReport, setGithubReport] = useState(null);
  const [updates, setUpdates] = useState(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updateTick, setUpdateTick] = useState(0);
  const upstreamKey = JSON.stringify(catalog?.modes.filter(m => m.upstream).map(m => [m.id, m.upstream]));
  useEffect(() => {
    let active = true, pending = false, checked = 0;
    const refresh = async () => {
      if (!workspace || workspace === initial?.example || !catalog?.modes.some(m=>m.upstream) || pending) return;
      pending = true; checked = Date.now(); setCheckingUpdates(true);
      try { const result = await api("repositoryUpdates", workspace); if (active) setUpdates(result); }
      catch (error) { if (active) setUpdates({ error: error.message, modes: [] }); }
      finally { pending = false; if (active) setCheckingUpdates(false); }
    };
    setUpdates(null);
    refresh();
    const timer = setInterval(refresh, 15 * 60 * 1000);
    const focus = () => { if (Date.now() - checked >= 15 * 60 * 1000) refresh(); };
    window.addEventListener("focus", focus);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [workspace, upstreamKey, updateTick]);
  const [marketQuery, setMarketQuery] = useState("");
  const [market, setMarket] = useState(null);
  const [marketError, setMarketError] = useState("");
  const gate = useRef(false);
  const loadRequest = useRef(0);
  useEffect(() => {
    reads.cancel('github'); reads.cancel('local'); reads.cancel('market'); reads.cancel('detail');
  }, [workspace]);
  const [externalChange, setExternalChange] = useState(false);
  const [contentSaving,setContentSaving]=useState(false);
  const [editorVersion,setEditorVersion]=useState(0);
  useEffect(()=>{const changed=()=>setEditorVersion(n=>n+1);document.addEventListener('asl:editor-state',changed);return()=>document.removeEventListener('asl:editor-state',changed);},[]);
  useEffect(() => {
    if (!workspace || workspace === initial?.example) return;
    const stop = window.asl.onEnvironmentChanged(data => {
      if (data.workspace !== workspace) return;
      if (data.error) { setMessage({error:true,text:`实时检测不可用：${data.error}。可以手动刷新。`}); return; }
      fileReads.current.clear();
      setExternalChange(true);
    });
    api('watch', workspace).catch(error=>setMessage({error:true,text:error.message}));
    return stop;
  }, [workspace]);
  useEffect(() => {
    if (externalChange && !modal && !busy && !contentSaving) {
      if(!document.dispatchEvent(new Event('asl:before-content-refresh',{cancelable:true}))){
        setMessage({text:'文件已更新，未保存内容已保留。',action:()=>{
          if(!window.confirm('读取新版本会放弃未保存修改，继续？'))return;
          document.dispatchEvent(new Event('asl:discard-drafts'));setExternalChange(false);
          read('environment','读取新版本',call=>load(workspace,call,{protectDrafts:true}));
        },actionLabel:'读取新版本',confirmDiscard:true});return;
      }
      setExternalChange(false);
      read('environment', '刷新工作环境', async call=>{
        try { await load(workspace, call, {protectDrafts:true}); }
        catch (error) { throw new Error(`本地文件需要修正：${error.message}。界面暂保留上次有效内容。`); }
      });
    }
  }, [modal, externalChange, busy, contentSaving,editorVersion]);
  const contentRef = useRef(null);
  useScrollMemory(`page:${workspace||''}:${page}:${modeId||''}:${cloud?.url||''}:${cloud?.mode||''}:${cloud?.view||''}`,contentRef,cloud?!!cloud.report&&!cloud.skill&&(!!cloud.mode||cloud.view==='skills'):!!catalog);
  async function task(action) {
    if (gate.current) { setMessage({ text: '当前保存或预览尚未结束，请稍候。' }); return; }
    gate.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage({ error: true, text: error.message });
    } finally {
      gate.current = false;
      setBusy(false);
    }
  }
  async function load(root, call = api, {restore = false, targetMode, protectDrafts = false} = {}) {
    fileReads.current.clear();
    const request = ++loadRequest.current;
    const navigation = navigationVersion.current;
    const changed = root !== currentRoot.current;
    currentRoot.current = root;
    setWorkspace(root);
    setLoadingRoot(root);
    setLoadError(null);
    if (changed) {
      setCatalog(catalogCache.current.get(root) || null);
      setModeId(targetMode || null);setView('map');setSelected(null);setQuery('');
      setGithubReport(null);
    } else if (targetMode !== undefined) setModeId(targetMode);
    try {
      const data = await call('run', 'catalog', {workspace: root});
      if (request !== loadRequest.current) return false;
      // A read can begin before the user opens an editor. Recheck before replacing its content.
      if(protectDrafts&&!document.dispatchEvent(new Event('asl:before-content-refresh',{cancelable:true}))){setExternalChange(true);return false;}
      catalogCache.current.set(root, data);
      setCatalog(data);
      setSelected(previous=>previous?data.skills.find(skill=>skill.id===previous.id)||null:null);
      setModeId(previous=>data.modes.some(m=>m.id===previous)?previous:null);
      // Catalog display does not wait for a preferences write or a Skill file read.
      const preferences = await call('remember', root);
      if (request !== loadRequest.current) return false;
      if (restore && navigation === navigationVersion.current) {
        const saved=restoreView(data,preferences.views?.[root]);
        setModeId(saved.mode || null);setView(saved.view);setQuery(saved.query);updatePage(saved.page);
        setProvider(saved.provider);setGithubUrl(saved.githubUrl);
        setSelected(data.skills.find(s=>s.id===saved.skill)||null);
        if(saved.page==='discover' && (saved.provider==='local'||saved.provider==='github-import'&&saved.githubUrl))setResumeDiscovery(saved);
      }
      setInitial(previous=>({...previous,views:preferences.views,libraries:preferences.libraries}));
      return true;
    } catch(error) {
      if(request===loadRequest.current)setLoadError({root,message:error.message});
      throw error;
    } finally {
      if (request === loadRequest.current) setLoadingRoot(null);
    }
  }
  useEffect(() => {
    api('nativeLocations').then(setLocations).catch(()=>{});
    let active=true;
    let last=0;
    const discover=async refresh=>{
      if(localIndex.current)return;
      setIndexing(true);
      const job=api('localSkills',null,refresh);localIndex.current=job;
      try {const report=await job;if(active)setLocalReport(previous=>previous?.directory?previous:report);return report;}
      catch(error){if(active&&!refresh)setMessage({error:true,text:`本机技能读取失败：${error.message}`});}
      finally{if(localIndex.current===job)localIndex.current=null;if(active)setIndexing(false);last=Date.now();}
    };
    discover(false).then(report=>{if(active&&report?.cached)discover(true);});
    const focus=()=>{if(Date.now()-last>5*60*1000)discover(true);};
    window.addEventListener('focus',focus);
    read('environment', '打开工作环境', async call => {
      const data = await call("initial");
      setInitial(data);
      setReady(true);
      if(data.activeSource)openCloud(data.activeSource.url,data.activeSource.mode);
      if (data.workspace) await load(data.workspace, call, {restore:true,protectDrafts:true});
    });
    return()=>{active=false;window.removeEventListener('focus',focus);};
  }, []);
  useEffect(()=>{
    if(!ready||!workspace||!catalog||busy||cloud||loadingRoot)return;
    api('rememberView',workspace,{mode:modeId||'',page,view,skill:selected?.id||'',query,provider,githubUrl})
      .catch(error=>setMessage({error:true,text:`界面位置未保存：${error.message}`}));
  },[ready,workspace,catalog,busy,cloud,loadingRoot,modeId,page,view,selected?.id,query,provider,githubUrl]);
  useEffect(()=>{
    if(!resumeDiscovery||busy||cloud)return;
    const saved=resumeDiscovery;setResumeDiscovery(null);
    read(saved.provider === 'local' ? 'local' : 'github', '恢复发现结果', async call=>{
      if(saved.provider==='local')setLocalReport(await call('localSkills'));
      else setGithubReport(await call('githubSkills',saved.githubUrl));
    });
  },[resumeDiscovery,busy,cloud]);
  useEffect(()=>{
    if(!initial||workspace)return;
    const check=()=>task(async()=>{const data=await api('initial');if(data.workspace)await load(data.workspace,api,{protectDrafts:true});});
    window.addEventListener('focus',check);
    return ()=>window.removeEventListener('focus',check);
  },[initial,workspace]);
  useEffect(() => {
    if (page === "agents" && !native && !reads.items.some(item=>item.key==='native')) read('native', '读取 Agent 配置', async call => setNative(await call("native")));
    if (page === "discover" && provider === "local" && !localReport && !localIndex.current) read('local', '发现本机技能', async call => setLocalReport(await call("localSkills")));
  }, [page, provider]);
  const repositoryKey=JSON.stringify(initial?.repositories||[]);
  useEffect(()=>{
    if(!ready)return;
    let stopped=false;
    // One bounded queue shares in-flight work with navigation; no repeated click-time scan.
    (async()=>{for(const url of (initial?.repositories||[]).slice(0,50)){
      if(stopped)break;
      try{await repositoryReport(url,updateTick>0);}catch{/* Keep the existing snapshot and let explicit refresh report errors. */}
    }})();
    return()=>{stopped=true;};
  },[ready,repositoryKey,updateTick]);
  useEffect(() => {
    if (!ready) return;
    read('native', '读取 Agent 配置', async call=>setNative(await call('native')));
    scanLocalModes();
    let last = Date.now();
    const refresh = () => {
      if (document.hidden || gate.current || Date.now() - last < 5*60*1000) return;
      last = Date.now(); scanLocalModes();
    };
    const timer = setInterval(refresh, 5*60*1000);
    window.addEventListener('focus', refresh);
    return ()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};
  }, [ready, workspace, updateTick]);
  const scanLocalModes = parent => read('local-modes', '识别本机工作模式', async call => setLocalModeReport(await call('localModes', parent)));
  const chooseModeDirectory = async () => {
    const parent = await api('choose', 'skillSearchRoot');
    if (parent) await scanLocalModes(parent);
  };
  const openLocalMode = async item => {
    if (busy) return;
    setModal(null);setSelected(null);setCloud(null);cloudRequest.current++;
    reads.cancel('cloud');reads.cancel('cloud-readme');api('selectSource',null).catch(error=>setMessage({error:true,text:error.message}));
    if(item.workspace===workspace && catalog){navigate(()=>{setModeId(item.id);setPage('modes');});return;}
    await openLibrary(item.workspace, item.id);
  };
  const mode = catalog?.modes.find((m) => m.id === modeId);
  const modeIntro = useMemo(()=>marked.lexer(mode?.document||'').find(token=>token.type==='paragraph')?.text||'',[mode?.document]);
  const modeInstallations=(native?.connections||[]).filter(item=>item.workspace===workspace&&item.mode===modeId);
  const readOnly = workspace === initial?.example || /[\\/]resources[\\/]example-environment[\\/]*$/i.test(workspace || '');
  const modeSkills = useMemo(
    () =>
      mode
        ? mode.skills.map((id) => catalog.skills.find((s) => s.id === id))
        : [],
    [mode, catalog],
  );
  // The Mode 技能 view groups by the authored architecture, not by a second taxonomy.
  const modeCatalog = useMemo(
    () => (mode ? {...catalog, modes: [mode], skills: modeSkills.filter(Boolean)} : catalog),
    [catalog, mode, modeSkills],
  );
  async function chooseLibrary() {
    const root = await api("choose", "environment");
    if (root) await openLibrary(root);
  }
  const canvasSkills=useMemo(()=>{
    const byId=new Map((catalog?.skills||[]).map(skill=>[skill.id,skill]));
    for(const skill of localSkillCandidates(catalog?.skills,localReport?.skills))if(!byId.has(skill.id))byId.set(skill.id,skill);
    return [...byId.values()];
  },[catalog?.skills,localReport]);
  function historyFor(item){
    const entry=canvasHistories.current.get(item.path);
    return entry?.fingerprint===item.fingerprint?entry.history:null;
  }
  async function readSkillFile(item,file,refresh=false){
    return fileReads.current.read(JSON.stringify([workspace,item.path,item.id,item.fingerprint,file]),()=>api('run','files',{workspace,skill:item.id,file}),refresh);
  }
  async function saveDiagram(item,document,{skill,placement,history:step}={}) {
    const root=workspace;
    const snapshot=mode=>({document:mode.document,roots:mode.roots,architecture:mode.architecture});
    const previous=historyFor(item)||createHistory(snapshot(item));
    const restored=step==='undo'?undoHistory(previous):step==='redo'?redoHistory(previous):null;
    if(restored){document=restored.present.document;if(restored===previous)return;}
    let imported=false;
    loadRequest.current++;setLoadingRoot(null);
    setContentSaving(true);
    try {
    if(skill&&!catalog.skills.some(s=>s.id===skill.id)){
      const request=candidateImportRequest(skill);
      if(!request)throw new Error('找不到完整技能目录，请重新扫描本机');
      const preview=await api('run','edit',{workspace:root,request});
      const result=await api('run','edit',{workspace:root,request:{...request,expectedSource:preview.sourceFingerprint},apply:true});
      if(result.canceled)throw new Error('已取消添加');
      imported=true;
    }
    const request={operation:'mode.save',id:item.id,expected:item.fingerprint,skills:restored?restored.present.roots:skill?[...new Set([...item.roots,skill.id])]:item.roots,document,...(restored?{architecture:restored.present.architecture}:placement?{placement}:{})};
    const result=await api('run','edit',{workspace:root,request,apply:true});
    if(result.canceled)throw new Error('未保存修改');
    if(result.catalog){
      const saved=result.catalog.modes.find(mode=>mode.id===item.id);
      if(saved){
        canvasHistories.current.delete(item.path);
        canvasHistories.current.set(item.path,{fingerprint:saved.fingerprint,history:restored||commitHistory(previous,snapshot(saved))});
        if(canvasHistories.current.size>32)canvasHistories.current.delete(canvasHistories.current.keys().next().value);
      }
      catalogCache.current.set(root,result.catalog);if(currentRoot.current===root){setCatalog(result.catalog);setExternalChange(false);}}
    else{catalogCache.current.delete(root);if(currentRoot.current===root)await load(root);}
    setMessage({text:result.history&&['unavailable','not-repository'].includes(result.history.status)?`${item.title} 已保存，本次未留下演变记录。`:`${item.title} 已保存`});
    } catch(error) {
      // A changed explanation does not invalidate the user's still-mounted graph draft.
      if(error.code==='EDIT_STALE'){
        try{
          const next=await api('run','catalog',{workspace:root}),current=next.modes.find(mode=>mode.id===item.id);
          if(current&&JSON.stringify(diagramsIn(current.document).map(d=>d.source))===JSON.stringify(diagramsIn(item.document).map(d=>d.source))&&currentRoot.current===root){
            catalogCache.current.set(root,next);setCatalog(next);setExternalChange(false);
          }
        }catch{/* Preserve the failed draft and the original write error. */}
      }
      setMessage(imported?{error:true,text:'技能已保存到库，尚未加入此模式。读取新版后可再次添加。',actionLabel:'读取模式后重试',action:()=>read('environment','读取工作模式',call=>load(root,call,{protectDrafts:true}))}
        :{error:true,text:`${item.title} 未保存：${error.message}`});throw error;
    } finally {setContentSaving(false);}
  }
  const openLibrary = (root, targetMode = null) => {
    setModal(null);setCloud(null);cloudRequest.current++;reads.cancel('cloud');reads.cancel('cloud-readme');
    api('selectSource',null).catch(error=>setMessage({error:true,text:error.message}));
    setPage('modes');
    return read('environment', '打开模式库', call => load(root, call, {targetMode}));
  };
  function goPage(id) {
    setModal(null);setCloud(null);cloudRequest.current++;reads.cancel('cloud');reads.cancel('cloud-readme');reads.cancel('detail');
    api('selectSource',null).catch(error=>setMessage({error:true,text:error.message}));
    if(cloud&&id===page)return;
    navigate(()=>{setPage(id);if(id==='modes')setModeId(null);setSelected(null);setQuery('');});
  }
  async function editContent(request, addedTo) {
    const preview = await api("run", "edit", { workspace, request });
    setModal({
      kind: "review",
      request: preview.sourceFingerprint
        ? { ...request, expectedSource: preview.sourceFingerprint }
        : request,
      preview,
      addedTo,
    });
  }
  async function saveContent(request) {
    if(!catalog){
      const {operation,expected,...draft}=request;
      const target=initial.managedLibrary;
      const preview=await api('run','create',{target,request:draft});
      const result=await api('run','create',{target,request:draft,expected:preview.fingerprint,apply:true});
      if(result.canceled)return;
      await openLibrary(target,request.id);
      setModal(null);setMessage({text:'工作模式已保存到本地。'});return;
    }
    const result=await api("run", "edit", {workspace, request, apply:true});
    if(result.canceled)return;
    await load(workspace);
    setModal(null);
    if(request.operation === "mode.save" && request.id) {setCloud(null);showMode(request.id);api('selectSource',null).catch(error=>setMessage({error:true,text:error.message}));}
    setMessage({text:result.history&&['unavailable','not-repository'].includes(result.history.status)?'已保存，本次未留下演变记录。':'已保存到本地。'});
  }
  async function saveFile(request,refresh=true) {
    const result=await api('run','edit',{workspace,request,apply:true});
    if(result.canceled)throw new Error('未保存更改');
    fileReads.current.clear();
    if(refresh)await load(workspace);
  }
  async function applyEdit() {
    const result = await api("run", "edit", {
      workspace,
      request: modal.request,
      apply: true,
    });
    if (result.canceled) return;
    setModal(null);
    await load(workspace);
    setMessage({ text: modal.addedTo
      ? `已添加到 ${modal.addedTo.title}。可从卡片上的模式名称查看；已连接的 Agent 需重新应用模式。`
      : result.archivePath ? "已归档，原文件已保留。" : "已保存。" });
  }
  async function importSkill() {
    const source = await api("choose", "skillFolder");
    if (!source) return;
    const report = await api("localSkills", source);
    if (report.skills.length === 1) await inspectDiscovered(report.skills[0]);
    else { setLocalReport({...report,directory:source}); setProvider("local"); setPage("discover"); }
  }
  function adoptSkill(skill, targetMode) {
    if(!catalog){void createModeWithSkill(skill);return;}
    setModal({ kind: "local-import", ...skill, mode: targetMode || (page === "modes" ? mode?.id || "" : ""), category: "",
      useExisting: catalog.skills.some(s => s.id === skill.id) });
  }
  // Explicit "create a new Mode from this discovered skill": land the skill in the
  // library first (reusing a same-name version), then open a new draft. Cancelling the
  // import or the draft never creates an empty Mode.
  async function createModeWithSkill(skill) {
    if (!skill?.id) return;
    if(!catalog){setCloud(null);setModal({kind:'mode-workspace',draft:{roots:[skill.id],packages:[{...skill,path:skill.source}]}});return;}
    const existing = catalog.skills.find(s => s.id === skill.id);
    if (!existing) {
      const request = candidateImportRequest(skill, null);
      if (!request) throw new Error("这个技能没有可导入的完整技能目录，请先在发现页查看它。");
      const preview = await api("run", "edit", {workspace, request});
      const confirmed = preview?.sourceFingerprint ? {...request, expectedSource: preview.sourceFingerprint} : request;
      const result = await api("run", "edit", {workspace, request: confirmed, apply: true});
      if (result?.canceled) { setMessage({ text: "已取消导入，未新建模式。" }); return; }
      setCatalog(await api("run", "catalog", {workspace}));
    }
    setModal({ kind: "mode-workspace", draft: { roots: [skill.id] } });
  }
  function showMode(id) { setModeId(id || null); setSelected(null); setQuery(""); setPage("modes"); }
  async function inspectDiscovered(skill) {
    const document = await api("sourceDocument", skill.source);
    setModal({ kind: "discovered-detail", skill, document });
  }
  async function inspectGithub(url = githubUrl) {
    setGithubUrl(url);
    return openCloud(url,undefined,false,true);
  }
  function navigateCloud(patch){setCloud(previous=>({...previous,...patch}));}
  async function openCloud(url, id, refresh=false,connect=false) {
    setModal(null);
    const sequence=++cloudRequest.current;
    reads.cancel('cloud');reads.cancel('cloud-readme');
    const report=cloudCache.current.get(url);
    const saved=cloudViews[url];
    const next=refresh&&cloud?.url===url?{...cloud,report}:{url,...(saved&&(id===undefined||id===saved.mode)?saved:{mode:id||null,view:'overview',skill:null}),report};
    if(!refresh&&report&&initial?.repositories.includes(url)){setCloud(next);return;}
    setCloud({...next,loading:true});
    if(!report)read('cloud-readme','读取仓库介绍',async call=>{
      try{const readme=await call('repositoryOverview',url);if(sequence===cloudRequest.current)setCloud(previous=>({...previous,readme}));}
      catch{/* Full inspection supplies the final error/retry; this independent preview is optional. */}
    });
    // Preloading may share the download; cancellation discards this reader's result.
    // Connection is a separate write, only after the cancellable read has finished.
    const result=await read('cloud','读取模式库',()=>repositoryReport(url,refresh).then(report=>({report}),error=>({error})),()=>{
      if(sequence!==cloudRequest.current)return;
      reads.cancel('cloud-readme');
      setCloud(previous=>previous?.url===url?{...previous,loading:false,error:'已停止读取'}:previous);
    });
    if(!result||sequence!==cloudRequest.current)return;
    try {
      if(result.error)throw result.error;
      const report=result.report;
      reads.cancel('cloud-readme');
      if(cloudCache.current.size>50)cloudCache.current.delete(cloudCache.current.keys().next().value);
      if(connect&&!initial?.repositories.includes(url)) {
        const repositories=await api('connectRepository',url,report.snapshot);
        if(sequence!==cloudRequest.current)return;
        setInitial(p=>({...p,repositories}));
      }
      setCloud(previous=>previous?.url===url?{...previous,report,loading:false,error:null}:previous);
    } catch(error){if(sequence===cloudRequest.current)setCloud(previous=>({...previous,loading:false,error:error.message}));}
  }
  useEffect(()=>{
    if(cloud?.report)api('selectSource',{url:cloud.url,mode:cloud.mode||null}).catch(error=>setMessage({error:true,text:error.message}));
  },[cloud?.url,cloud?.mode,cloud?.report]);
  useLayoutEffect(()=>{
    if(cloud?.report)setCloudViews(previous=>({...previous,[cloud.url]:{mode:cloud.mode,view:cloud.view,skill:cloud.skill}}));
  },[cloud?.url,cloud?.mode,cloud?.view,cloud?.skill,cloud?.report]);
  // Cloud refresh only replaces the remote preview, never the user's adopted Mode.
  useEffect(()=>{
    if(!cloud?.url||modal||busy)return;
    const url=cloud.url;
    let active=true,pending=false,last=Date.now();
    const refresh=async()=>{
      if(document.hidden||pending||Date.now()-last<5*60*1000)return;
      pending=true;last=Date.now();
      try{
        const report=await repositoryReport(url,true);
        cloudCache.current.set(url,report);
        if(active)setCloud(previous=>previous?.url===url?{...previous,report,error:null,
          mode:report.modes.some(m=>m.id===previous.mode)?previous.mode:null}:previous);
      }catch(error){if(active)setCloud(previous=>previous?.url===url?{...previous,error:`云端更新暂不可用，保留上次查看内容。${error.message}`}:previous);}
      finally{pending=false;}
    };
    const timer=setInterval(refresh,5*60*1000);
    window.addEventListener('focus',refresh);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh);};
  }, [cloud?.url, modal, busy]);
  function connectCloud() { goPage('discover');setProvider('github-import'); }
  async function sourceMenu(url) {
    const result=await api('sourceMenu',url);
    if(!result.removed)return;
    setInitial(previous=>({...previous,repositories:result.repositories}));cloudCache.current.delete(url);
    if(cloud?.url===url){goPage('modes');setModeId(null);}
  }
  async function localMenu(root,id){
    const {action}=await api('libraryMenu',root,id);if(!action)return;
    if(action==='open-library'){await chooseLibrary();return;}
    if(!await openLibrary(root,id||null))return;
    const data=catalogCache.current.get(root),item=data?.modes.find(m=>m.id===id);
    if(action==='new-mode')setModal({kind:'mode-workspace'});
    else if(action==='environment-documents')setModal({kind:'environment-documents'});
    else if(action==='archive-browser')setModal({kind:'archive-browser'});
    else if(action==='mode-history'&&item)setModal({kind:'mode-history',item});
    else if(action==='new-library')setModal({kind:'library-create',workspace:root,modes:data.modes});
    else if(action==='edit-mode'&&item)setModal({kind:'mode-workspace',item});
    else if(action==='copy-mode'&&item)setModal({kind:'mode-workspace',item:{...item,id:`${item.id}-copy`,fingerprint:null}});
    else if(action==='archive-mode'&&item)setModal({kind:'review',request:{operation:'mode.archive',id:item.id,expected:item.fingerprint},preview:await api('run','edit',{workspace:root,request:{operation:'mode.archive',id:item.id,expected:item.fingerprint}})});
  }
  function openGuide(modeId, repository=null) {
    const target=workspace&&!readOnly?workspace:initial.managedLibrary;
    setModal({kind:'agent-guide',workspace:target,mode:modeId||'',repository});
  }
  async function refreshLocal(call=api) {
    const target=modal?.workspace||workspace;
    if(target)await load(target,call,{protectDrafts:true});
    else{const data=await call('initial');if(data.workspace)await load(data.workspace,call,{protectDrafts:true});}
  }
  async function importRepositoryMode(item, chosenTarget, nextAgent=false, sourceReport=githubReport) {
    if (!chosenTarget) {
      const local = await api('localModes');
      setLocalModeReport(local);
      const matches = matchLocalModes(local.modes, item.id, sourceReport.repository).filter(m=>m.sameSource);
      if (matches.length===1) chosenTarget=matches[0].workspace;
      else if (matches.length>1) { setGithubReport(sourceReport);setModal({ kind: 'repository-target', item, matches, nextAgent }); return; }
    }
    const pack = await api("repositoryMode", sourceReport.snapshot, item.id);
    const target = chosenTarget || pack.target;
    const report = await api("run", "import", { source: pack.source, target });
    if (!report.changed&&!report.conflicts.length&&nextAgent) {
      await load(target);setCloud(null);setModeId(item.id);setModal({kind:'connect',modeId:item.id});return;
    }
    setModal({ kind: "import-review", source: pack.source, target, report, title: item.title, replace: false, nextAgent });
  }
  async function searchMarket() {
    setMarketError("");
    try {
      await read('market', '搜索公开目录', async call => setMarket(await call("discover", provider, marketQuery)));
    } catch (e) {
      setMarketError(e.message);
      setMarket(null);
    }
  }
  async function exportMode() {
    const output = await api("choose", "export");
    if (!output) return;
    const values = { workspace, mode: mode.id, output };
    const report = await api("run", "export", values);
    setModal({ kind: "export", values, report });
  }
  async function importPack() {
    const source = await api("choose", "package");
    if (!source) return;
    const report = await api("run", "inspect", { source });
    if (!catalog || readOnly) {
      const target = initial.managedLibrary;
      setModal({ kind: "import-review", source, target, report: await api("run", "import", { source, target }), replace: false });
    } else setModal({ kind: "import-target", source, report });
  }
  async function previewImport(target) {
    const report = await api("run", "import", { source: modal.source, target });
    setModal({ kind: "import-review", source: modal.source, target, report, replace: false });
  }
  const editorOpen=['mode-workspace','library-create','skill-editor','skill-files','discovered-detail','import-review','connect','agent-guide','environment-documents','archive-browser','mode-history'].includes(modal?.kind);
  const activePage=cloud?'modes':page;

  return (
    <NoticeContext.Provider value={{ ...message, busy, reads }}>
      <div className={`app${['mode-workspace','agent-guide'].includes(modal?.kind)?' mode-editing':''}`} aria-busy={busy}>
        <aside className="sidebar">
          <PanelResize name="navigation"/>
          <div className="brand" title={initial?.version ? `ASL Harness v${initial.version}${initial.packaged ? '' : ' · 开发版'}` : undefined}>
            <span className="brand-symbol">
              <Layers3 size={22} />
            </span>
            <strong>ASL</strong>
          </div>
          <nav className="primary-nav">
            {[
              ["modes", "工作模式", Layers3],
              ["skills", "全部技能", Puzzle],
              ["discover", "发现", Compass],
              ["updates", "来源与更新", RotateCw],
              ["agents", "Agent 配置", SlidersHorizontal],
            ].map(([id, label, Icon]) => (
              <button
                key={id}
                aria-label={label}
                title={label}
                className={activePage === id ? "active" : ""}
                onClick={() => goPage(id)}
              >
                <Icon size={18} />
                <span>{label}</span>
                {id === "skills" && catalog && (
                  <small>{catalog.skills.length}</small>
                )}
                {id === "updates" && updates?.modes.some(m => m.status === "new-commit") && <small>{updates.modes.filter(m => m.status === "new-commit").length}</small>}
              </button>
            ))}
          </nav>
          <SourceTree groups={libraryGroups(localModeReport?.modes,initial?.libraries,workspace,catalog?.modes??null)}
            repositories={initial?.repositories||[]} workspace={workspace} mode={modeId} cloud={cloud}
            onLocal={openLocalMode} onCloud={openCloud} onNavigate={navigateCloud} onContext={url=>task(()=>sourceMenu(url))}
            onRoot={openLibrary} onLocalContext={(root,id)=>task(()=>localMenu(root,id))}/>
          {catalog&&!readOnly&&<button className="new-mode-button" onClick={()=>setModal({kind:'mode-workspace'})}><Plus size={15}/>新建模式</button>}
          <div className="sidebar-footer">
            <button onClick={() => task(importPack)}>
              <Download size={16} />
              导入模式
            </button>
          </div>
        </aside>
        <div className="app-main">
          <header className="topbar">
            <span>
              <button className="breadcrumb-button" onClick={()=>goPage(activePage)}>{activePage === "modes"
                ? "工作模式"
                : page === "skills"
                  ? "全部技能"
                  : page === "discover"
                    ? "发现"
                    : page === "updates" ? "来源与更新" : "Agent 配置"}</button>
              {activePage === "modes" && (cloud || mode) && (
                <>
                  <ChevronRight size={14} />
                  <span title={cloud?.url || workspace}>{baseName(cloud?.url || workspace)}</span><ChevronRight size={14}/>
                  <b>{cloud?(cloud.skill?cloud.report?.skills.find(s=>repositorySkillKey(s)===cloud.skill||s.id===cloud.skill)?.title:cloud.mode?cloud.report?.modes.find(m=>m.id===cloud.mode)?.title:cloud.view==='skills'?'技能':'仓库介绍'):mode.title}</b>
                </>
              )}
            </span>
            <div>
              {initial&&<button className="text-button" onClick={()=>cloud?.report?openGuide('',cloud.report):openGuide(page==='modes'&&mode?mode.id:undefined,page==='discover'&&provider==='github-import'?githubReport:null)}><Pencil size={15}/>交给 AI 整理</button>}
              {workspace === initial?.example && (
                <Tag tone="amber">内置示例 · 只读</Tag>
              )}
              {busy ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                initial && (
                  <IconButton
                    icon={RotateCw}
                    label="刷新技能库"
                    onClick={() => cloud?openCloud(cloud.url,cloud.mode,true,true):read('environment','刷新工作环境',refreshLocal)}
                  />
                )
              )}
            </div>
          </header>
          <div id="editor-page" hidden={!editorOpen} inert={busy}/>
          <div className="content-with-detail" style={editorOpen?{display:'none'}:undefined}>
            <main className="content" ref={contentRef}>
              {!modal && <ReadStatus tasks={reads}/>}
              {cloud ? <SourceLibrary source={cloud} busy={busy} onNavigate={navigateCloud}
                onRefresh={()=>openCloud(cloud.url,cloud.mode,true,true)}
                onUse={item=>task(()=>importRepositoryMode(item,null,true,cloud.report))}
                onSave={item=>task(()=>importRepositoryMode(item,null,false,cloud.report))}
                localModes={catalog?.modes||[]}
                onOrganize={!readOnly?(item,skill)=>setModal({kind:'mode-workspace',item,draft:{report:cloud.report,query:skill?.id||'',repository:true}}):null}/>
              : !catalog && loadingRoot && !["discover", "agents", "updates"].includes(page) ? <div className="source-loading" role="status"><h2>{baseName(loadingRoot)}</h2><span className="loading-line"/><span className="loading-line"/></div>
              : !catalog && loadError && page==="modes" ? <div className="empty-state" role="alert"><h2>未能打开模式库</h2><p>{errorText(loadError.message)}</p><button onClick={()=>openGuide('')}>交给 AI 修复</button><button onClick={()=>openLibrary(loadError.root)}>重试</button><button onClick={()=>task(chooseLibrary)}>选择其他模式库</button></div>
              : !catalog && !["discover", "agents", "updates"].includes(page) ? (
                <div className="welcome">
                  <div className="welcome-logo">
                    <Layers3 size={42} />
                  </div>
                  <h1>
                    你的工作能力，
                    <br />
                    各就其位。
                  </h1>
                  <p>围绕工作场景组织技能，内容留在本地。</p>
                  <button
                    className="primary"
                    disabled={!initial}
                    onClick={()=>setModal({kind:'mode-workspace'})}
                  >
                    <FolderOpen size={18} />
                    从这台电脑开始
                  </button>
                  <button className="welcome-secondary" onClick={connectCloud}><Download size={17}/>导入别人分享的工作模式</button>
                  <button className="text-button" onClick={() => chooseLibrary()}>打开本地环境（高级）</button>
                  {initial?.libraries?.length > 0 && (
                    <div className="recent-list">
                      {initial.libraries.map((root) => (
                        <button
                          key={root}
                          onClick={() => openLibrary(root)}
                        >
                          <Layers3 size={18} />
                          <span>{baseName(root)}</span>
                          <ChevronRight size={15} />
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    className="text-button"
                    onClick={() => openLibrary(initial.example)}
                  >
                    查看内置示例
                    <ChevronRight size={14} />
                  </button>
                </div>
              ) : (
                <>
                  {page === "updates" && <section className="updates-page">
                    <div className="page-heading">
                      <div>
                        <h1>来源与更新</h1>
                        <p
                          className="update-status"
                          title={updates?.checkedAt ? `完整检查时间：${new Date(updates.checkedAt).toLocaleString()}` : "尚未检查"}
                        >
                          {checkingUpdates
                            ? "正在检查"
                            : updates?.checkedAt
                              ? `更新于 ${new Date(updates.checkedAt).toLocaleTimeString(undefined, {hour: "2-digit", minute: "2-digit"})}`
                              : "尚未检查"}
                        </p>
                      </div>
                      <div className="heading-actions">
                        <button aria-label="连接云端仓库" onClick={connectCloud}><Plus size={16} />连接仓库</button>
                        <button aria-label="立即检查更新" disabled={checkingUpdates || !catalog} onClick={() => setUpdateTick(value => value + 1)}><RotateCw size={16} className={checkingUpdates ? "spin" : ""} />{checkingUpdates ? "检查中" : "检查更新"}</button>
                      </div>
                    </div>
                    {updates?.error && <p className="inline-note">{updates.error}。本地模式仍可使用。</p>}
                    {!!initial?.repositories?.length&&<div className="update-list">{initial.repositories.map(url=>{const report=cloudCache.current.get(url);return <article className="update-card" key={url}><button className="row-main" onClick={()=>openCloud(url)}><Cloud size={20}/><strong>{url.replace('https://github.com/','')}</strong><ChevronRight size={15}/></button><p>{report?.checkedAt?`更新于 ${new Date(report.checkedAt).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}`:'已连接'}</p><button aria-label={`刷新 ${baseName(url)}`} onClick={()=>openCloud(url,null,true)}><RotateCw size={15}/>刷新仓库</button></article>;})}</div>}
                    {!catalog?.modes.some(m => m.upstream) ? (!initial?.repositories?.length&&<Empty icon={Link2} title="还没有添加仓库"/>) : <div className="update-list">{catalog.modes.filter(m => m.upstream).map(item => {
                      const row = updates?.modes.find(r => r.mode === item.id);
                      return <article className="update-card" key={item.id}>
                        <div className="field-heading">
                          <button className="row-main" onClick={() => showMode(item.id)}><Layers3 size={20} /><strong>{item.title}</strong><ChevronRight size={15} /></button>
                          <Tag tone={row?.status === "error" ? "warning" : ""}>{({current:"上游暂无新提交", "new-commit":"上游有新提交", error:"暂时无法检查"})[row?.status] || "等待检查"}</Tag>
                        </div>
                        <p>{item.upstream.repository.replace("https://github.com/", "")}</p>
                        <p>已导入 {item.upstream.commit.slice(0, 8)}{row?.status === "new-commit" && ` → 云端 ${row.commit.slice(0, 8)}`}</p>
                        {row?.error && <p className="error-text">{row.error}；本地内容不受影响。</p>}
                        <div className="heading-actions">
                          <button onClick={() => task(() => api("external", item.upstream.repository))}><ArrowUpRight size={15} />查看仓库</button>
                          <button className={row?.status === "new-commit" ? "primary" : ""} onClick={() => inspectGithub(item.upstream.url)}>查看差异<ChevronRight size={15} /></button>
                        </div>
                      </article>;
                    })}</div>}
                  </section>}
                  {page === 'modes' && catalog && !mode && <section className="mode-library-overview">
                    <div className="page-heading"><h1>工作模式</h1><div className="heading-actions"><button onClick={()=>setModal({kind:'environment-documents'})}>偏好与记录</button><button onClick={()=>setModal({kind:'archive-browser'})}><Archive size={16}/>归档</button><button className="primary" disabled={readOnly} onClick={()=>setModal({kind:'mode-workspace'})}><Plus size={16}/>新建模式</button></div></div>
                    {!!catalog.issues?.length&&<details className="scan-issues"><summary>{catalog.issues.length} 处内容需要检查</summary>{catalog.issues.map((issue,index)=><p className="path-line" key={index}>{issue.path}：{issue.message}</p>)}</details>}
                    <h2 className="library-section-title" title={workspace}><FolderOpen size={18}/>{baseName(workspace)}</h2>
                    <div className="source-mode-grid">{catalog.modes.map(item=><button className="source-mode-card" key={item.id} onClick={()=>showMode(item.id)}>
                      <span className="source-mode-icon"><Layers3 size={24}/></span><h2>{item.title}</h2>
                      <footer><span>{item.skills.length} 个技能</span><ChevronRight size={17}/></footer>
                    </button>)}</div>
                  </section>}
                  {page === "modes" && mode && (
                    <div className="mode-page">
                      <div className="page-heading">
                        <div>
                          <h1>{mode.title}</h1>
                          {modeIntro&&<p>{shortText(modeIntro,110)}</p>}
                        </div>
                        <div className="heading-actions">
                          {!mode.upstream && (
                            <IconButton
                              icon={Cloud}
                              label="为这个模式连接云端仓库"
                              disabled={readOnly}
                              onClick={connectCloud}
                            />
                          )}
                          <IconButton
                            icon={Copy}
                            label="复制模式"
                            disabled={readOnly}
                            onClick={() =>
                              setModal({
                                kind: "mode-workspace",
                                item: {
                                  ...mode,
                                  id: `${mode.id}-copy`,
                                  fingerprint: null,
                                },
                              })
                            }
                          />
                          <IconButton
                            icon={Pencil}
                            label="编辑模式"
                            disabled={readOnly}
                            onClick={() =>
                              setModal({ kind: 'mode-workspace', item: mode })
                            }
                          />
                          <IconButton icon={History} label="演变记录" onClick={()=>setModal({kind:'mode-history',item:mode})}/>
                          <IconButton
                            icon={Archive}
                            label="归档模式"
                            disabled={readOnly}
                            onClick={() =>
                              task(() =>
                                editContent({
                                  operation: "mode.archive",
                                  id: mode.id,
                                  expected: mode.fingerprint,
                                }),
                              )
                            }
                          />
                          <button onClick={() => task(exportMode)}>
                            <Upload size={16} />
                            分享
                          </button>
                          <button
                            className="primary"
                            aria-label={`在 Agent 中使用 ${mode.title}`}
                            onClick={() => setModal({ kind: "connect" })}
                          >
                            添加到 Agent
                            <ArrowUpRight size={16} />
                          </button>
                        </div>
                      </div>
                      {!!modeInstallations.length&&<div className="mode-installations">{modeInstallations.map(item=><button key={item.id} title={item.location} onClick={()=>{setAgentHost(item.host);goPage('agents');}}><Check size={14}/>{native.hosts.find(h=>h.id===item.host)?.name} · {item.scope==='user'?'所有项目':item.scope==='preset'?'工作模式':baseName(item.project)}<ChevronRight size={14}/></button>)}</div>}
                      {mode.upstream && (
                        <div className="mode-origin">
                          <Link2 size={16} />
                          <span>{mode.upstream.repository.replace("https://github.com/", "")}<small>已导入 {mode.upstream.commit.slice(0, 8)} · 本地可编辑副本</small></span>
                          <button onClick={() => inspectGithub(mode.upstream.url)}><RotateCw size={14} />检查上游</button>
                        </div>
                      )}
                      <details className="mode-method" key={mode.id}>
                        <summary>模式说明</summary>
                        <Markdown text={mode.document.replace(/^#\s+.+\r?\n?/, '').trim()}/>
                      </details>
                      <div className="mode-toolbar">
                        <div className="tabs">
                          {[
                            ["map", "逻辑架构", Network],
                            ["list", "技能", List],
                          ].map(([id, label, Icon]) => (
                            <button
                              key={id}
                              onClick={() => setView(id)}
                              className={view === id ? "active" : ""}
                            >
                              <Icon size={16} />
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {view === "map" ? (
                        <SkillCanvas selected={selected} onSelect={setSelected} readOnly={readOnly} readFile={readSkillFile} saveFile={saveFile}>
                        <ArchitectureMap
                          key={`${workspace}:${mode.id}`}
                          mode={mode}
                          skills={modeSkills}
                          availableSkills={canvasSkills}
                          compact={!!selected}
                          selectedId={selected?.id}
                          onSkill={item=>setSelected(item)}
                          onEdit={readOnly?null:title=>setModal({kind:'mode-workspace',item:mode,title,editSource:true})}
                          onSaveDocument={readOnly?null:saveDiagram}
                          historyFor={historyFor}
                        />
                        </SkillCanvas>
                      ) : (
                        <SkillLibrary
                          catalog={modeCatalog}
                          selected={selected} onSelect={setSelected}
                          query={query}
                          onSkill={item=>setModal({kind:'skill-files',item})}
                          readOnly={readOnly} readFile={readSkillFile} saveFile={saveFile}
                          onEditMode={readOnly?undefined:(_,title)=>setModal({kind:'mode-workspace',item:mode,title,editSource:true})}
                          onSaveDocument={readOnly?null:saveDiagram}
                          historyFor={historyFor}
                        />
                      )}
                    </div>
                  )}
                  {page === "skills" && catalog && (
                    <>
                      <div className="page-heading">
                        <div>
                          <h1>全部技能</h1>
                          <p>{catalog.skills.length} 个已纳入当前技能库的技能</p>
                        </div>
                        <div className="heading-actions">
                          <button disabled={readOnly} onClick={() => task(importSkill)}>
                            <Download size={16} />
                            导入
                          </button>
                          <button onClick={() => { setProvider("local"); setPage("discover"); }}><Compass size={16} />发现本机技能</button>
                          <button
                            className="primary"
                            onClick={() => setModal({ kind: "skill-editor" })}
                            disabled={readOnly}
                          >
                            <Plus size={16} />
                            创建技能
                          </button>
                        </div>
                      </div>
                      <div className="search large">
                        <Search size={17} />
                        <input
                          aria-label="搜索技能"
                          placeholder="搜索名称、用途"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                        {query && (
                          <IconButton
                            icon={X}
                            label="清除搜索"
                            onClick={() => setQuery("")}
                          />
                        )}
                      </div>
                      <SkillLibrary catalog={catalog} query={query} selected={selected} onSelect={setSelected} onSkill={item=>setModal({kind:'skill-files',item})}
                        readOnly={readOnly} readFile={readSkillFile} saveFile={saveFile}
                        onEditMode={readOnly?undefined:(id,title)=>setModal({kind:'mode-workspace',item:catalog.modes.find(m=>m.id===id),title,editSource:true})} onSaveDocument={readOnly?null:saveDiagram} historyFor={historyFor}/>
                    </>
                  )}
                  {page === "discover" && (
                    <>
                      <div className="page-heading">
                        <div>
                          <h1>发现</h1>
                          <p>本机技能、GitHub 仓库与公开目录。</p>
                        </div>
                        <div className="heading-actions">
                          <button aria-label="打开本地模式库" onClick={()=>chooseLibrary()}><FolderOpen size={16}/>打开本地库</button>
                        {catalog && (
                          <button disabled={readOnly} aria-label="从文件夹导入技能" onClick={() => task(importSkill)}>
                            <FolderOpen size={16} />
                            从文件夹导入
                          </button>
                        )}
                        </div>
                      </div>
                      <div className="market-search">
                        <div className="tabs">
                          <button className={provider === "local" ? "active" : ""} onClick={() => setProvider("local")}>本机技能</button>
                          <button className={provider === "local-modes" ? "active" : ""} onClick={() => setProvider("local-modes")}>本机工作模式</button>
                          <button className={provider === "github-import" ? "active" : ""} onClick={() => setProvider("github-import")}>粘贴 GitHub 链接</button>
                          <button className={provider === 'diagrams' ? 'active' : ''} onClick={()=>setProvider('diagrams')}>图示</button>
                          <button
                            className={provider === "dsh" ? "active" : ""}
                            onClick={() => {
                              setProvider("dsh");
                              setMarket(null);
                            }}
                          >
                            DeepSeek 插件
                          </button>
                          <button
                            className={provider === "github" ? "active" : ""}
                            onClick={() => {
                              setProvider("github");
                              setMarket(null);
                            }}
                          >
                            GitHub 项目
                          </button>
                        </div>
                        {provider==='diagrams'&&<DiagramExamples/>}
                        {["dsh", "github"].includes(provider) && <form
                          className="search large"
                          onSubmit={(e) => {
                            e.preventDefault();
                            searchMarket();
                          }}
                        >
                          <Search size={18} />
                          <input
                            value={marketQuery}
                            onChange={(e) => setMarketQuery(e.target.value)}
                            placeholder={
                              provider === "dsh"
                                ? "搜索插件"
                                : "搜索技能或模式仓库"
                            }
                            aria-label="搜索市场"
                          />
                          <button className="primary" disabled={busy}>
                            搜索
                          </button>
                        </form>}
                      </div>
                      {provider==='local-modes'&&<LocalModes report={localModeReport} onOpen={openLocalMode} onScan={()=>scanLocalModes()} onChoose={()=>task(chooseModeDirectory)}/>}
                      {provider === "local" && <>
                        <div className="field-heading"><span className="muted">{localReport?.directory ? "自选目录" : indexing?'正在检查更新':localReport?.checkedAt?`检查于 ${new Date(localReport.checkedAt).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}`:'本机技能'}</span><div className="heading-actions">
                          <button onClick={() => read('local', '发现目录技能', async call => { const root = await call('choose', 'skillSearchRoot'); if (root) setLocalReport({...await call('localSkills', root),directory:root}); })}><FolderOpen size={16} />选择目录</button>
                          <button onClick={() => read('local', '发现本机技能', async call => setLocalReport(await call('localSkills',null,true)))}><RotateCw size={16} />扫描本机</button>
                        </div></div>
                        <button className="primary" onClick={()=>openGuide('')}><Copy size={16}/>交给 AI 整理</button>
                        <DiscoveredSkills report={localReport} catalog={catalog} readOnly={readOnly} onAdd={adoptSkill} onMode={showMode} onInspect={skill => task(() => inspectDiscovered(skill))} />
                      </>}
                      {provider === "github-import" && <>
                        <form className="search large" onSubmit={e => { e.preventDefault(); inspectGithub(); }}>
                          <Link2 size={18} /><input required type="url" aria-label="GitHub 仓库地址" placeholder="https://github.com/作者/仓库，或技能目录链接" value={githubUrl} onChange={e => setGithubUrl(e.target.value)} />
                          <button className="primary">读取仓库</button>
                        </form>
                        {!!initial?.repositories?.length && !githubReport && <div className="recent-repositories"><small>最近查看</small>{initial.repositories.map(url => <button key={url} onClick={() => inspectGithub(url)}>{url.replace("https://github.com/", "")}<ChevronRight size={14} /></button>)}</div>}
                      </>}
                      {["dsh", "github"].includes(provider) && (marketError ? (
                        <Empty icon={AlertCircle} title="暂时无法连接来源">
                          <p>{marketError}</p>
                          <button onClick={() => searchMarket()}>
                            重试
                          </button>
                        </Empty>
                      ) : market ? (
                        <div className="market-grid">
                          {market.map((item) => (
                            <article key={item.id} className="market-card">
                              <div className="market-card-top">
                                <span className="skill-symbol">
                                  <Box size={20} />
                                </span>
                                <Tag>
                                  {item.compatibility === "deepseek-harness"
                                    ? "DeepSeek 专用"
                                    : "待查看兼容性"}
                                </Tag>
                              </div>
                              <h3>{item.name}</h3>
                              <p>{shortText(item.description, 150)}</p>
                              <div>
                                <span className="muted">
                                  {item.stars != null
                                    ? `☆ ${item.stars.toLocaleString()}`
                                    : ""}
                                </span>
                                {item.kind === "repository" && <button onClick={() => inspectGithub(item.url)}><Download size={15} />选择技能</button>}
                                <button
                                  onClick={() =>
                                    task(() => api("external", item.url))
                                  }
                                >
                                  查看项目
                                  <ArrowUpRight size={15} />
                                </button>
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <div className="discovery-start">
                          <Compass size={38} />
                          <h3>从成熟生态中挑选</h3>
                          <p>
                            {provider === "dsh"
                              ? "浏览 DeepSeek 社区插件目录"
                              : "按星数查看 GitHub 项目"}
                          </p>
                          <button
                            className="primary"
                            onClick={() => searchMarket()}
                          >
                            浏览{provider === "dsh" ? "插件" : "项目"}
                          </button>
                          <small>浏览不会自动安装软件。</small>
                        </div>
                      ))}
                    </>
                  )}
                  {page === "agents" && <AgentPage native={native} catalog={catalog} workspace={workspace} busy={busy} Tag={Tag} task={task} api={api} hostId={agentHost} setHostId={setAgentHost}
                    onConnect={values=>setModal({kind:"connect",...values})} onSetup={values=>setModal({kind:"setup",...values})}
                    onOpen={item=>openLocalMode({...item,id:item.mode})}
                    refresh={()=>read("native", "读取 Agent 配置", async call=>setNative(await call("native")))}/>}
                </>
              )}
            </main>
          </div>
          {message && (
            <div
              role={message.error ? "alert" : "status"}
              className={`toast ${message.error ? "error" : ""}`}
            >
              {message.error ? <AlertCircle size={18} /> : <Check size={18} />}
              <span>{message.text}</span>
              {message.action&&<button data-confirm-discard={message.confirmDiscard||undefined} onClick={message.action}>{message.actionLabel}</button>}
              <IconButton
                icon={X}
                label="关闭提示"
                onClick={() => setMessage(null)}
              />
            </div>
          )}
        </div>
        {modal?.kind === "libraries" && (
          <Dialog title="技能库" onClose={() => setModal(null)}>
            <button className="primary" onClick={connectCloud}><Link2 size={16} />连接云端仓库</button>
            <div className="library-list">
              {initial?.libraries?.map((root) => (
                <button
                  key={root}
                  onClick={() =>
                    task(async () => {
                      await load(root);
                      setModal(null);
                    })
                  }
                >
                  <Layers3 size={20} />
                  <span>
                    <strong>{baseName(root)}</strong>
                    <small>{root}</small>
                  </span>
                  {root === workspace ? (
                    <Check size={17} />
                  ) : (
                    <ChevronRight size={17} />
                  )}
                </button>
              ))}
            </div>
            <div className="dialog-actions">
              <button
                onClick={() =>
                  task(async () => {
                    await chooseLibrary();
                    setModal(null);
                  })
                }
              >
                <FolderOpen size={16} />
                连接其他技能库
              </button>
            </div>
          </Dialog>
        )}
        {modal?.kind === 'repository-target' && <Dialog title="选择本地模式" onClose={()=>setModal(null)} wide>
          <p>本机已有 {modal.item.title}。先打开已有内容，或选择要比较和更新的位置。</p>
          <div className="list-surface">{modal.matches.map(item=><div className="project-row" key={item.workspace}>
            <FolderOpen size={18}/><span><strong>{item.title} · {item.sameSource ? '同源模式' : '仅名称相同'}</strong><small>{item.workspace}</small></span>
            <button onClick={()=>openLocalMode(item)}>打开</button><button className="primary" onClick={()=>task(()=>importRepositoryMode(modal.item,item.workspace,modal.nextAgent))}>选择此库</button>
          </div>)}</div>
          <div className="dialog-actions"><button onClick={()=>setModal(null)}>取消</button>
            {workspace && !readOnly && !modal.matches.some(item=>item.workspace===workspace) && <button onClick={()=>task(()=>importRepositoryMode(modal.item,workspace))}>加入当前环境</button>}
            <button onClick={()=>task(async()=>{const target=await api('choose','newEnvironment');if(target)await importRepositoryMode(modal.item,target);})}>另存为独立环境</button>
          </div>
        </Dialog>}
        {modal?.kind === "mode-workspace" && (
          <ModeWorkspace
            preloadedReport={localReport}
            mode={modal.item || null}
            initialTitle={modal.title}
            editSource={modal.editSource}
            readFile={readSkillFile}
            saveFile={request=>saveFile(request,false)}
            draft={modal.draft || null}
            catalog={catalog}
            workspace={workspace||initial?.managedLibrary}
            api={api}
            read={read}
            reads={reads}
            Dialog={EditorPage}
            Field={Field}
            onSave={saveContent}
            onCatalog={next => setCatalog(next)}
            onClose={() => setModal(null)}
          />
        )}
        {modal?.kind==='library-create'&&<EditorPage title="新建工作库" onClose={()=>setModal(null)}><form onSubmit={event=>{event.preventDefault();const id=new FormData(event.currentTarget).get('mode');task(async()=>{const target=await api('choose','newEnvironment');if(!target)return;const result=await api('createLibrary',{workspace:modal.workspace,mode:id,target});if(!result.canceled)await openLibrary(target,id);});}}><Field label="首个工作模式"><select name="mode">{modal.modes.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></Field><div className="dialog-actions"><button type="button" onClick={()=>setModal(null)}>取消</button><button className="primary">选择位置并创建</button></div></form></EditorPage>}
        {modal?.kind === "skill-editor" && (
          <SkillEditor
            item={modal.item}
            texts={modal.texts}
            onSave={(request) => task(() => saveContent(request))}
            onClose={() => setModal(null)}
          />
        )}
        {modal?.kind === 'skill-files' && <SkillFiles item={modal.item} initialFile={modal.initialFile} Dialog={EditorPage} readOnly={readOnly} onClose={()=>setModal(null)}
          readFile={(file,refresh)=>readSkillFile(modal.item,file,refresh)}
          saveFile={saveFile}/>}
        {modal?.kind === 'agent-guide' && <EnvironmentGuide workspace={modal.workspace} mode={modal.mode} repository={modal.repository} api={api} read={read}
          onVerified={async root=>{if(await load(root)){setCloud(null);setPage('modes');setModeId(null);setModal(null);}}}
          onClose={()=>{reads.cancel('agent-guide');setModal(null);}}/>}
        {modal?.kind === "review" && (
          <Dialog
            title={
              modal.request.operation.endsWith(".archive")
                ? "归档内容"
                : "保存更改"
            }
            onClose={() => setModal(null)}
          >
            <div className="review-summary">
              <span className="large-symbol">
                {modal.request.operation.endsWith(".archive") ? (
                  <Archive size={25} />
                ) : (
                  <Check size={25} />
                )}
              </span>
              <h3>{modal.request.id}</h3>
              <p>
                {modal.request.operation.endsWith(".archive")
                  ? "从活动库移出，完整文件保留在归档。"
                  : "修改会保存到原技能库。"}
              </p>
            </div>
            {modal.preview.affectedModes.length > 0 && (
              <section>
                <h3>涉及的模式</h3>
                <div className="connection-tags">
                  {modal.preview.affectedModes.map((id) => (
                    <Tag key={id}>
                      {catalog.modes.find((m) => m.id === id)?.title || id}
                    </Tag>
                  ))}
                </div>
              </section>
            )}
            <details>
              <summary>查看文件变更范围</summary>
              <pre>{modal.preview.changedPaths.join("\n")}</pre>
            </details>
            <div className="dialog-actions">
              <button onClick={() => setModal(null)}>取消</button>
              <button
                className="primary"
                disabled={busy}
                onClick={() => task(applyEdit)}
              >
                确认
                {modal.request.operation.endsWith(".archive") ? "归档" : "保存"}
              </button>
            </div>
          </Dialog>
        )}
        {modal?.kind === "connect" && (
          <ConnectDialog api={api} Field={Field} Tag={Tag}
            mode={catalog.modes.find(m => m.id === modal.modeId) || mode || catalog.modes[0]}
            modes={catalog.modes}
            workspace={workspace}
            initialHost={modal.host}
            initialScope={modal.scope}
            initialProject={modal.project}
            locations={locations}
            task={task}
            onClose={() => setModal(null)}
            onApplied={(text,values,result) => { setMessage({ text });setAgentHost(values.host);setPage('agents');if(result)setModal({kind:'setup',values,resultMessage:text,activation:result.activation});api("native").then(setNative).catch(error=>setMessage({error:true,text:error.message})); }}
          />
        )}
        {modal?.kind === "discovered-detail" && <EditorPage title={modal.skill.title} onClose={() => setModal(null)}>
          <Markdown text={modal.document}/>
          <details><summary>文件与依赖</summary>
          {modal.skill.inspection?.reasons.length ? <div className="inline-note"><span><b>需要先核对配套内容</b>{modal.skill.inspection.reasons.map(reason => <small key={reason}>{reason}</small>)}</span></div> : <p>未发现脚本、运行声明或目录外引用，可继续检查完整技能包。</p>}
          {modal.skill.inspection?.dependencies.map(d => <div className="dependency-preview" key={d.file}><b>{d.kind} · {d.file}</b><p>{d.requirements.join("、") || "以原声明为准"}</p>{d.setupScripts.length > 0 && <small>安装脚本：{d.setupScripts.join("、")}（未执行）</small>}{d.parseWarning && <small>{d.parseWarning}</small>}</div>)}
          <details><summary>包含的文件（{modal.skill.inspection?.files.length || 0}）</summary><pre className="repository-tree">{modal.skill.inspection?.files.join("\n")}</pre></details>
          <details><summary>查看原文</summary><pre className="repository-tree">{modal.document}</pre></details>
          <p className="path-line">{modal.skill.origin || modal.skill.source}</p>
          </details>
          <div className="dialog-actions"><button onClick={() => setModal(null)}>关闭</button>
            {modal.skill.origin && <button onClick={() => task(() => api("external", modal.skill.origin))}>查看原仓库<ArrowUpRight size={15} /></button>}
            {!readOnly&&<button className="primary" onClick={() => adoptSkill(modal.skill)}>{catalog?'加入模式':'新建模式'}</button>}
          </div>
        </EditorPage>}
        {modal?.kind === 'environment-documents' && <EnvironmentDocuments workspace={workspace} api={api} readOnly={readOnly} onClose={()=>setModal(null)} onSaved={()=>setExternalChange(true)}/>}
        {modal?.kind === 'archive-browser' && <ArchiveBrowser workspace={workspace} api={api} readOnly={readOnly} onClose={()=>setModal(null)} onSaved={()=>load(workspace)}/>}
        {modal?.kind === 'mode-history' && <ModeHistory workspace={workspace} mode={catalog.modes.find(item=>item.id===modal.item.id)||modal.item} skills={catalog.skills} api={api} readOnly={readOnly} onClose={()=>setModal(null)} onSaved={()=>load(workspace)} onContinue={item=>setModal({kind:'mode-workspace',item})}/>}
        {modal?.kind === "setup" && <SetupDialog api={api} Dialog={Dialog} Tag={Tag} values={modal.values} activation={modal.activation} resultMessage={modal.resultMessage} title={catalog?.modes.find(m => m.id === modal.values.mode)?.title || modal.values.mode} task={task} onReadNote={({skill,path})=>task(async()=>{const root=modal.values.workspace;if(!await load(root))return;const item=catalogCache.current.get(root)?.skills.find(item=>item.id===skill);const prefix=item?.path.replaceAll('\\','/')+'/';const normalized=path.replaceAll('\\','/');if(!item||!normalized.startsWith(prefix))throw new Error('说明不在对应技能包内，请重新检查');setModal({kind:'skill-files',item,initialFile:normalized.slice(prefix.length)});})} onClose={() => setModal(null)} />}
        {modal?.kind === "add-to-mode" && (
          <Dialog title="加入工作模式" onClose={() => setModal(null)}>
            <div className="library-list">
              {catalog.modes.map((m) => (
                <button
                  key={m.id}
                  disabled={m.skills.includes(selected.id)}
                  onClick={() => adoptSkill(selected,m.id)}
                >
                  <Layers3 size={18} />
                  <span>{m.title}</span>
                  {m.skills.includes(selected.id) ? (
                    <Check size={16} />
                  ) : (
                    <Plus size={16} />
                  )}
                </button>
              ))}
            </div>
            {!readOnly && <div className="dialog-actions">
              <button onClick={() => setModal(null)}>取消</button>
              <button type="button" onClick={() => { setModal(null); task(() => createModeWithSkill(selected)); }}>
                <Plus size={15} />新建模式并使用此技能
              </button>
            </div>}
          </Dialog>
        )}
        {modal?.kind === "local-import" && (
          <Dialog title="添加到 Mode" onClose={() => setModal(null)}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                task(() => editContent(adoptionRequest(modal, catalog), catalog.modes.find(m => m.id === modal.mode)));
              }}
            >
              <h3>{modal.title}</h3>
              <Field label="选择 Mode">
                <select
                  aria-label="选择 Mode"
                  required
                  value={modal.mode}
                  onChange={(e) => setModal({ ...modal, mode: e.target.value, category: "", placement:"" })}
                >
                  <option value="">请选择工作模式</option>
                  {catalog.modes.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </Field>
              {!catalog.modes.length && <p>还没有 Mode。<button type="button" onClick={() => { setModal(null); task(() => createModeWithSkill(modal)); }}><Plus size={14} />新建模式并使用此技能</button></p>}
              {!catalog.modes.find(m=>m.id===modal.mode)?.skills.includes(modal.id)&&<Placement mode={catalog.modes.find(m=>m.id===modal.mode)} value={modal.placement} onChange={placement=>setModal({...modal,placement})}/>}
              {!!catalog.modes.find(m => m.id === modal.mode)?.capabilities?.length && <Field label="能力类别">
                <select aria-label="能力类别" value={modal.category} onChange={e => setModal({ ...modal, category: e.target.value })}>
                  <option value="">未分类</option>{catalog.modes.find(m => m.id === modal.mode).capabilities.map(g => <option key={g.title} value={g.title}>{g.title}</option>)}
                </select>
              </Field>}
              {catalog.skills.some(s => s.id === modal.id) && <Field label="库中已有同名技能">
                <select aria-label="库中已有同名技能" value={modal.useExisting ? "reuse" : "replace"} onChange={e => setModal({ ...modal, useExisting: e.target.value === "reuse" })}>
                  <option value="reuse">使用库内版本（保留已有修改）</option>
                  <option value="replace">用这次发现的版本替换</option>
                </select>
                {!modal.useExisting && <small role="alert">将替换库内技能，影响所有引用它的 Mode；保存前会显示范围。</small>}
              </Field>}
              {!modal.useExisting && modal.inspection?.status === "needs-review" && <div className="inline-note"><span><b>配套内容会随技能保存，但不会自动安装或执行</b><small>目录外的共享依赖不会自动复制。添加后仍需配置，不能视为已经可运行。</small>
                <details><summary>查看需核对的内容</summary>{modal.inspection.reasons.map(reason => <small key={reason}>{reason}</small>)}</details>
              </span></div>}
              <p className="path-line">{modal.origin || modal.source}</p>
              <div className="dialog-actions">
                <button type="button" onClick={() => setModal(null)}>
                  取消
                </button>
                <button type="button" onClick={() => { setModal(null); task(() => createModeWithSkill(modal)); }}>
                  <Plus size={15} />
                  新建模式并使用此技能
                </button>
                <button className="primary" disabled={!modal.mode}>预览添加</button>
              </div>
            </form>
          </Dialog>
        )}
        {modal?.kind === "export" && (
          <Dialog title="分享工作模式" onClose={() => setModal(null)}>
            <div className="review-summary">
              <span className="large-symbol">
                <Upload size={25} />
              </span>
              <h3>{mode.title}</h3>
              <p>
                {mode.skills.length} 个技能 · {modal.report.files.length} 个文件
              </p>
            </div>
            <p className="muted">不包含个人资料、任务内容和登录信息。</p>
            <details>
              <summary>查看文件</summary>
              <pre>{modal.report.files.join("\n")}</pre>
            </details>
            {modal.report.localReferences.length > 0 && (
              <p className="inline-note">
                部分内容包含本机路径，请检查后分享。
              </p>
            )}
            <div className="dialog-actions">
              <button onClick={() => setModal(null)}>取消</button>
              <button
                className="primary"
                onClick={() =>
                  task(async () => {
                    const result = await api("run", "export", {
                      ...modal.values,
                      apply: true,
                    });
                    if (!result.canceled) {
                      setModal(null);
                      setMessage({ text: "模式包已导出。" });
                    }
                  })
                }
              >
                导出
              </button>
            </div>
          </Dialog>
        )}
        {modal?.kind === "import-target" && (
          <Dialog title="导入工作模式" onClose={() => setModal(null)}>
            <h3>{modal.report.mode}</h3>
            <p>{modal.report.skills.length} 个完整技能</p>
            <div className="dialog-actions">
              {workspace && !readOnly && (
                <button onClick={() => task(() => previewImport(workspace))}>
                  加入当前技能库
                </button>
              )}
              <button
                className="primary"
                onClick={() =>
                  task(async () => {
                    const target = await api("choose", "newEnvironment");
                    if (target) await previewImport(target);
                  })
                }
              >
                创建独立技能库
              </button>
            </div>
          </Dialog>
        )}
        {modal?.kind === "import-review" && (
          <EditorPage title="导入与更新" onClose={() => setModal(null)}>
            <div className="import-target"><FolderOpen size={18}/><div><strong>{baseName(modal.target)}</strong><details><summary>本地位置</summary><p>{modal.target}</p></details></div></div>
            <div className="apply-summary"><Layers3 size={20} /><span>{modal.title || modal.report.mode}<small>{modal.report.skills.length} 个完整技能 · {modal.report.profileAction === "preserved" ? "保留本地个人资料" : "不导入个人资料"}</small></span></div>
            {!modal.report.changed && !modal.report.conflicts.length && <p className="inline-note">所选 Mode 的内容已一致，无需更新。</p>}
            <div className="review-list import-changes">
              {Object.entries(modal.report.actions).filter(([, action]) => action !== "unchanged").sort((a, b) => (a[1] === "conflict" ? -1 : 0) - (b[1] === "conflict" ? -1 : 0)).map(([id, action]) => (
                <div className="import-package" key={id}>
                  <div className="field-heading"><span>{id}</span>
                  <Tag tone={action === "conflict" ? "amber" : ""}>
                    {
                      {
                        add: "本地保存",
                        unchanged: "已存在",
                        conflict: "与来源内容不同",
                        replace: "替换",
                        'source-update': '登记云端来源',
                      }[action]
                    }
                  </Tag></div>
                  {!!modal.report.differences?.[id]?.length && <details><summary>查看文件差异</summary>{modal.report.differences[id].filter(change=>change.kind!=='line-endings').map(change=><div className="file-diff" key={change.path}><div><code>{change.path}</code><Tag>{({'content':'内容修改',added:'导入新增',removed:'本地独有 · 替换会移除','source-record':'上游版本记录'})[change.kind]}</Tag></div>{change.diff&&<pre>{change.diff}</pre>}{change.truncated&&<small>仅显示前 12,000 字符，请在本地核对完整文件。</small>}{change.binary&&<small>二进制或大文件，请在本地对比。</small>}</div>)}</details>}
                </div>
              ))}
            </div>
            {Object.values(modal.report.actions).includes("unchanged") && <p className="muted">{Object.values(modal.report.actions).filter(action => action === "unchanged").length} 项内容已一致，保持不变。</p>}
            {Object.values(modal.report.differences || {}).some(changes=>changes.some(c=>c.kind==='line-endings')) && <p className="muted">已忽略 {Object.values(modal.report.differences).flat().filter(c=>c.kind==='line-endings').length} 个文件的换行差别，不会因此覆盖本地文件。</p>}
            {modal.report.conflicts.length > 0 && (
              <><p className="inline-note">以下比较的是所选环境与导入来源。仅凭不同，不能判断是谁修改过；减号为当前内容，加号为来源内容。</p><label className="check-line"><input type="checkbox" checked={modal.replace} onChange={e => setModal({ ...modal, replace: e.target.checked })} />用来源版本替换以上差异内容</label></>
            )}
            {!!modal.report.affectedModes?.length && <p className="inline-note">共享技能变更可能影响：{modal.report.affectedModes.join("、")}</p>}
            {!!modal.report.dependencyFiles?.length && <details><summary>配套环境（{modal.report.dependencyFiles.length} 项声明）</summary><ul>{modal.report.dependencyFiles.map(file => <li key={file}>{file}</li>)}</ul><p>只导入内容；安装工具、连接服务和登录请在应用 Mode 后检查配置。</p></details>}
            <div className="dialog-actions">
              <button onClick={() => setModal(null)}>取消</button>
              <button
                className="primary"
                disabled={modal.report.conflicts.length > 0 && !modal.replace}
                onClick={() =>
                  task(async () => {
                    const result = await api("run", "import", {
                      source: modal.source,
                      target: modal.target,
                      replace: modal.replace === true,
                      expected: modal.report.fingerprint,
                      apply: true,
                    });
                    if (!result.canceled) {
                      const target = modal.target, nextAgent=modal.nextAgent;
                      setModal(null);
                      await load(target);setCloud(null);
                      showMode(result.mode);
                      if(nextAgent)setModal({kind:'connect',modeId:result.mode});
                      else setMessage({text:'已保存到本地'});
                    }
                  })
                }
              >
                {modal.nextAgent?'保存并继续':'保存到本地'}
              </button>
            </div>
          </EditorPage>
        )}
      </div>
    </NoticeContext.Provider>
  );
}
