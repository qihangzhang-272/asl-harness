import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import SkillFiles,{SkillPanel} from './SkillFiles.jsx';
import EditorPage from './EditorPage.jsx';
import DiagramEditor from './DiagramEditor.jsx';
import PanelResize from './PanelResize.jsx';
import DiagramExamples from './DiagramExamples.jsx';
import EnvironmentGuide from './EnvironmentGuide.jsx';
import SkillLibrary from './SkillLibrary.jsx';
import Markdown from './Markdown.jsx';
import {Placement} from './ParadigmEditor.jsx';
import ModeWorkspace from './ModeWorkspace.jsx';
import AgentPage from './AgentPage.jsx';
import SourceLibrary, {SourceTree} from './SourceLibrary.jsx';
import {navigate} from './motion.js';
import { LocalModes } from './LocalModes.jsx';
import { useReadTasks, ReadStatus } from './useReadTasks.jsx';
import {ArchitectureMap} from './Architecture.jsx';
import {modeEditorKind} from './mode-diagrams.mjs';
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
} from "lucide-react";
import {
  adoptionRequest,
  candidateImportRequest,
  localSkillCandidates,
  errorText,
  shortText,
  restoreView,
  matchLocalModes,
} from "./presentation.mjs";

const baseName = (value) => (value || "").split(/[\\/]/).filter(Boolean).pop();
const AGENT_CHOICES = [
  {id:'codex-app',name:'Codex',scopes:['project','user']},
  {id:'claude-code',name:'Claude Code',scopes:['project','user']},
  {id:'deepseek-harness',name:'DeepSeek Harness',scopes:['preset']},
  {id:'workbuddy',name:'WorkBuddy',scopes:['project']},
];
const NoticeContext = createContext(null);
async function api(method, ...args) {
  const reply = await window.asl[method](...args);
  if (!reply.ok) throw Object.assign(new Error(errorText(reply.error,reply.code)),
    {code:reply.code,details:reply.details,diagnostic:reply.error});
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
            <button className="primary" disabled={!catalog || readOnly} onClick={() => onAdd(s)}><Plus size={15} />加入模式</button>
            <button onClick={() => onInspect(s)}>查看解析<ChevronRight size={15} /></button>
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
  return (
    <EditorPage title={item ? "编辑技能" : "创建技能"} onClose={onClose} wide>
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
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary">保存技能</button>
        </div>
      </form>
    </EditorPage>
  );
}

function SkillDetails({
  skill,
  texts,
  modes,
  readOnly,
  onClose,
  onEdit,
  onArchive,
  onAdd,
  onRemove,
  onBrowse,
}) {
  const [tab, setTab] = useState("overview");
  useEffect(() => setTab("overview"), [skill.id]);
  const completion = texts?.["SKILL.md"]?.match(
    /## 完成标准\s*([\s\S]*?)(?=\n## |$)/,
  )?.[1];
  return (
    <aside className="inspector">
      <div className="inspector-top">
        <span>技能详情</span>
        <IconButton icon={X} label="关闭详情" onClick={onClose} />
      </div>
      <div className="inspector-body">
        <div className="large-symbol">
          <Puzzle size={28} />
        </div>
        <h2>{skill.title}</h2>
        <p className="description">{shortText(skill.description, 150)}</p>
        <div className="inspector-actions">
          <button onClick={onBrowse}><FolderOpen size={15}/>文件与结构</button>
          <button onClick={onAdd} disabled={readOnly}>
            <Plus size={15} />
            加入模式
          </button>
          <IconButton
            icon={Pencil}
            label="编辑技能"
            disabled={!texts || readOnly}
            onClick={onEdit}
          />
          <IconButton icon={Archive} label="归档技能" onClick={onArchive} disabled={readOnly} />
        </div>
        <div className="tabs small">
          {[
            ["overview", "概览"],
            ["requirements", "配置"],
            ["content", "原文"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={tab === value ? "active" : ""}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "overview" && (
          <>
            <section>
              <h3>使用这个技能的模式</h3>
              {skill.usedBy.length ? (
                skill.usedBy.map((id) => (
                  <div className="detail-line" key={id}>
                    <Layers3 size={15} />
                    <span>{modes.find((m) => m.id === id)?.title || id}</span>
                    <Tag>{modes.find((m) => m.id === id)?.roots.includes(skill.id) ? "直接加入" : "依赖带入"}</Tag>
                    {onRemove && (
                      <IconButton
                        icon={X}
                        label={`从 ${id} 移出`}
                        disabled={readOnly}
                        onClick={() => onRemove(id)}
                      />
                    )}
                  </div>
                ))
              ) : (
                <p className="muted">尚未加入模式</p>
              )}
            </section>
            <section>
              <h3>交付要求</h3>
              <p className="plain-markdown">
                {completion?.trim() || "查看完整技能说明"}
              </p>
            </section>
            <section>
              <h3>来源</h3>
              <p className="source-line">{skill.source}</p>
              <span className="muted">
                {skill.fileCount} 个文件 · 完整本地包
              </span>
            </section>
          </>
        )}
        {tab === "requirements" && (
          <>
            {skill.requires.length > 0 && (
              <section>
                <h3>依赖技能</h3>
                {skill.requires.map((id) => (
                  <div key={id} className="detail-line">
                    <Link2 size={15} />
                    {id}
                  </div>
                ))}
              </section>
            )}
            {skill.dependencies.length ? (
              skill.dependencies.map((dep, index) => (
                <section key={index}>
                  <h3>
                    {dep.kind}
                    <Tag>待检查</Tag>
                  </h3>
                  {dep.requirements.map((name) => (
                    <div className="detail-line" key={name}>
                      <Circle size={12} />
                      <span>{name}</span>
                    </div>
                  ))}
                  {dep.environmentVariables.length > 0 && (
                    <p>需要：{dep.environmentVariables.join("、")}</p>
                  )}
                  {dep.parseWarning && (
                    <p className="muted">{dep.parseWarning}</p>
                  )}
                  <details>
                    <summary>声明文件</summary>
                    <code>{dep.file}</code>
                  </details>
                </section>
              ))
            ) : (
              <section>
                <h3>运行说明</h3>
                <p className="muted">
                  没有可识别的依赖清单。以技能原文中的安装和连接说明为准。
                </p>
                <button onClick={() => setTab("content")}>
                  查看说明
                  <ChevronRight size={15} />
                </button>
              </section>
            )}
            <p className="muted">账号登录由对应 Agent 处理。</p>
          </>
        )}
        {tab === "content" && <><button onClick={onBrowse}><FolderOpen size={15}/>浏览全部 {skill.fileCount} 个文件</button><pre className="document">{texts?.["SKILL.md"] || "正在读取…"}</pre></>}
      </div>
    </aside>
  );
}

function SetupDialog({ values, title, onClose, task, resultMessage }) {
  const [report, setReport] = useState(null);
  const [assistants, setAssistants] = useState([]);
  const [assistant, setAssistant] = useState("");
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(false);
  async function check(probe = false) {
    setChecking(true);
    try {
      setReport(await api("run", "readiness", { ...values, probe }));
      if (session) setSession(await api("setupStatus", session.id));
    } finally { setChecking(false); }
  }
  useEffect(() => {
    task(async () => {
      const native = await api("native");
      setAssistants(native.assistants);
      setAssistant(native.assistants.find(a => a.available && a.id === values.host)?.id || native.assistants.find(a => a.available)?.id || "");
      await check();
    });
  }, []);
  const labels = { found: "已找到", configured: "有配置 · 待实测", missing: "待安装 / 连接", unknown: "需检查", ok: "渠道体检通过", warn: "需处理", off: "未连接", error: "检查异常" };
  return <Dialog title="配置这台电脑" onClose={onClose}>
    {resultMessage && <p role="status" className="inline-note">{resultMessage}</p>}
    <div className="apply-summary"><SlidersHorizontal size={19} /><span>{title}<small>{{"codex-app": "Codex", "claude-code": "Claude Code", "deepseek-harness": "DeepSeek Harness", workbuddy: "WorkBuddy"}[values.host]} · {values.scope === "user" ? "当前用户" : values.scope === "preset" ? "工作模式" : "所选项目"}</small></span></div>
    {report ? <>
      {report.nativeDiscoveryUnverified && <div className="inline-note"><FolderOpen size={18} /><span>所选目录还需与 Agent 关联<small>{report.chosenSkillsDirectory}</small></span></div>}
      <div className="setup-checks">
        {report.checks.map(item => <div className="sync-item" key={`${item.kind}:${item.name}`}><span><strong>{item.name}</strong><small>{item.kind === "mcp" ? "MCP" : item.kind === "binary" ? "本机工具" : "登录 / 环境变量"}</small></span><Tag tone={["missing", "unknown"].includes(item.status) ? "warning" : ""}>{labels[item.status]}</Tag></div>)}
        {!report.checks.length && <p>未声明额外安装项。</p>}
      </div>
      {!!report.setupNotes.length && <details className="setup-notes"><summary>配置助手还会阅读 {report.setupNotes.length} 份技能说明</summary>{report.setupNotes.map((item, index) => <small key={index}>{item.skill}</small>)}</details>}
      {report.doctor && <div className="setup-channels"><h3>Agent Reach</h3>{report.doctor.map(item => <div className="sync-item" key={item.id}><span>{item.name}</span><Tag tone={item.status === "ok" ? "green" : "warning"}>{labels[item.status] || "需检查"}</Tag></div>)}</div>}
      {report.doctorError && <p className="error-text">{report.doctorError}</p>}
    </> : <div className="inline-note"><LoaderCircle size={18} className="spin" />正在检查本机环境…</div>}
    <Field label="用谁来配置"><select value={assistant} onChange={e => setAssistant(e.target.value)}><option value="" disabled>选择已安装的 Agent</option>{assistants.map(item => <option key={item.id} value={item.id} disabled={!item.available}>{item.name}{!item.available && " · 未安装"}</option>)}</select><small>沿用该工具的模型、套餐和登录。安装授权在原生窗口确认。</small></Field>
    {session && <div className="inline-note">{session.status === "failed" ? <AlertCircle size={18} /> : <Check size={18} />}<span>{session.status === "failed" ? "原生 Agent 未成功完成。请检查其模型与连接，或换一个助手重试。" : session.status === "ended" ? "配置会话已结束，请复查本机结果。" : "配置助手已打开，请在原生窗口继续。"}<small>会话结束不代表所有连接已验证。</small></span></div>}
    <div className="dialog-actions"><button onClick={() => task(() => check(true))} disabled={checking}><RotateCw size={16} className={checking ? "spin" : ""} />重新检查</button><button disabled={!report || checking} onClick={()=>task(()=>api('copyText',report.brief))}><Copy size={16}/>复制配置提示词</button><button className="primary" disabled={!assistant || !report || checking} onClick={() => task(async () => { const result = await api("setup", assistant, values); if (!result.canceled) setSession(result); })}>打开原生助手<ArrowUpRight size={16} /></button></div>
  </Dialog>;
}

function ConnectDialog({
  mode: initialMode,
  modes,
  workspace,
  onClose,
  task,
  onApplied,
  initialHost = "codex-app",
  initialScope,
  initialProject = "",
  locations,
}) {
  const [modeId, setModeId] = useState(initialMode.id);
  const mode = modes.find((item) => item.id === modeId) || initialMode;
  const [native, setNative] = useState(locations || null);
  const [locationError, setLocationError] = useState('');
  const [host, setHost] = useState(initialHost);
  const [project, setProject] = useState(initialProject);
  const [preset, setPreset] = useState("");
  const [scope, setScope] = useState(initialScope || (["codex-app", "claude-code"].includes(initialHost) ? "user" : "project"));
  const [customSkillsDir, setSkillsDir] = useState(null);
  const currentHost=native?.hosts.find(h=>h.id===host);
  const skillsDir=customSkillsDir ?? (currentHost?.userMode?.skillsDir && currentHost.userMode.skillsDir!==currentHost.skillRoot ? currentHost.userMode.skillsDir : "");
  const [preview, setPreview] = useState(null);
  useEffect(() => setPreview(null), [scope, host, modeId, project, preset, skillsDir]);
  useEffect(()=>{
    if(!native||preset)return;
    const choices=native.presets.filter(p=>!p.managed);
    const base=choices.find(p=>/standard|default/i.test(p.name))||choices[0];
    if(base)setPreset(base.path);
  },[native]);
  useEffect(() => {
    let active=true;
    api('nativeLocations').then(value=>{if(active)setNative(value);})
      .catch(error=>{if(active)setLocationError(error.message);});
    return ()=>{active=false;};
  }, []);
  const selected = (native?.hosts || AGENT_CHOICES).find((h) => h.id === host);
  return (
    <EditorPage title={selected ? `在 ${selected.name} 使用` : '选择 Agent'} onClose={onClose}>
      <Field label="工作模式">
        <select
          value={mode.id}
          onChange={(event) => setModeId(event.target.value)}
        >
          {modes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </Field>
      <div className="agent-picker">
        {(native?.hosts || AGENT_CHOICES).map((h) => (
          <button
            key={h.id}
            disabled={!h.scopes.length}
            title={!h.scopes.length ? "已识别本机目录，尚未支持应用模式" : h.directory}
            onClick={() => {
              setHost(h.id);
              setSkillsDir(null);
              setProject("");
              setScope(h.scopes.includes("user") ? "user" : "project");
            }}
            className={host === h.id ? "selected" : ""}
          >
            <span className={`host-symbol ${h.id}`}>{h.name[0]}</span>
            <strong>{h.name}{!h.scopes.length && <small>暂未接入</small>}</strong>
            {host === h.id && <Check size={16} />}
          </button>
        ))}
      </div>
      {locationError && <p role="alert">{locationError}<button onClick={()=>api('nativeLocations').then(value=>{setNative(value);setLocationError('');}).catch(error=>setLocationError(error.message))}>重试</button></p>}
          <div className="field-heading">
            <b>在哪里使用</b>
          </div>
          <button type="button" className={`scope-option ${scope === "project" ? "selected" : ""}`} onClick={() => {
            if(host==="deepseek-harness"||(project&&scope!=="project"))setScope("project");
            else task(async()=>{const folder=await api("choose","project");if(folder){setProject(folder);setScope("project");}});
          }} aria-pressed={scope === "project"}>
            {scope === "project" ? <Check size={17} /> : <Circle size={17} />}
            <div>
              <strong>
                {host === "deepseek-harness" ? "添加到 DeepSeek 的工作模式" : project ? `项目 · ${baseName(project)}` : "选择项目文件夹"}
              </strong>
            </div>
          </button>
          {selected?.scopes.includes("user") && (
            <button type="button" className={`scope-option ${scope === "user" ? "selected" : ""}`} onClick={() => setScope("user")} aria-pressed={scope === "user"}>
              {scope === "user" ? <Check size={17} /> : <Circle size={17} />}
              <div>
                <strong>当前用户的所有项目</strong>
              </div>
            </button>
          )}
          {host === "deepseek-harness" ? (
            <details className="preset-options" open={!preset}><summary>{preset?'工具设置':'选择要沿用的工具设置'}</summary><Field label="沿用 DeepSeek 的工具">
              <select
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
              >
                <option value="">选择工具设置</option>
                {native?.presets.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() =>
                  task(async () => {
                    const value = await api("choose", "basePreset");
                    if (value) setPreset(value);
                  })
                }
              >
                <FolderOpen size={15} />
                选择其他配置文件夹
              </button>
            </Field></details>
          ) : scope === "project" ? (project && <p className="path-line">{project}</p>)
          : <div className="user-location"><div>{native?<Check size={16}/>:<LoaderCircle size={16} className="spin"/>}<strong>用户技能目录</strong></div><p className="path-line">{skillsDir || selected?.skillRoot || '正在读取位置…'}</p><details><summary>高级设置</summary><button onClick={() => task(async () => { const folder = await api("choose", "userSkills"); if (folder) setSkillsDir(folder); })}><FolderOpen size={15} />更换技能目录</button>{skillsDir && <button onClick={() => setSkillsDir("")}>恢复标准目录</button>}</details></div>}
          {preview && <div className="sync-preview">
            <h3>同步预览</h3>
            {preview.previousMode && <small>原默认模式：{preview.previousMode}</small>}
            {preview.items.filter(item => item.action !== "unchanged").map(item => <div className="sync-item" key={item.skill}>
              <span>{item.skill}</span><Tag tone={item.action === "conflict" ? "warning" : ""}>{({add:"加入",update:"更新",remove:"移出",conflict:"需处理同名内容"})[item.action]}</Tag>
            </div>)}
            {!preview.needsSync && <p>已与技能源一致。</p>}
            {preview.conflicts.map(text => <p className="error-text" key={text}>{text}</p>)}
            <small>只管理 ASL 同步的副本；不删除你的原技能源。</small>
          </div>}
          <div className="dialog-actions">
            {scope === "user" && native?.hosts.find(h => h.id === host)?.userMode?.mode === mode.id ? <button onClick={() => task(async () => {
              const plan = await api("run", "userSync", { workspace, mode: mode.id, host, remove: true, ...(skillsDir && { skillsDir }) });
              const result = await api("run", "userSync", { workspace, mode: mode.id, host, remove: true, expected: plan.fingerprint, apply: true, ...(skillsDir && { skillsDir }) });
              if (!result.canceled) { onClose(); onApplied("已停用用户级默认模式，原技能源不变。",{host}); }
            })}>停用默认模式</button> : <button onClick={onClose}>取消</button>}
            <button
              className="primary"
              disabled={!native || !!locationError || !selected || (host === "deepseek-harness" ? !preset : scope === "project" ? !project : !!preview?.conflicts.length)}
              onClick={() =>
                task(async () => {
                  let result;
                  let target = scope === "project" ? project : "";
                  if (scope === "user" && host !== "deepseek-harness") {
                    if (!preview) {
                      setPreview(await api("run", "userSync", { workspace, mode: mode.id, host, ...(skillsDir && { skillsDir }) }));
                      return;
                    }
                    result = await api("run", "userSync", { workspace, mode: mode.id, host, expected: preview.fingerprint, apply: true, ...(skillsDir && { skillsDir }) });
                  } else if (host === "deepseek-harness") {
                    const output = await api("presetTarget", mode.id);
                    target = output;
                    result = await api("run", "preset", {
                      workspace,
                      mode: mode.id,
                      basePreset: preset,
                      output,
                    });
                  } else
                    result = await api("run", "project", {
                      workspace,
                      mode: mode.id,
                      project,
                      host,
                    });
                  if (!result.canceled) {
                    onClose();
                    const status = host === "deepseek-harness"
                      ? result.presetRegistered ? "已添加到 DeepSeek，请在新会话中选择这个工作模式。" : "工作模式已保存，但 DeepSeek 尚未识别。请检查配置位置。"
                      : result.discovery === "requires-connection" ? "已放入所选目录，还需关联 Agent。" : `${selected.name} 的模式已同步。`;
                    onApplied(status, { workspace, mode: mode.id, host, scope: host === "deepseek-harness" ? "preset" : scope, ...(target && { project: target }), ...(scope === "user" && skillsDir && { skillsDir }) });
                  }
                })
              }
            >
              {scope === "user" && !preview ? "继续" : `配置到 ${selected?.name || 'Agent'}`}
              <ArrowUpRight size={16} />
            </button>
          </div>
    </EditorPage>
  );
}

export default function App() {
  const [initial, setInitial] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const currentRoot = useRef(null);
  const catalogCache = useRef(new Map());
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
  const [texts, setTexts] = useState(null);
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
  const [extraSkillRoot, setExtraSkillRoot] = useState(null);
  const [githubUrl, setGithubUrl] = useState("");
  const [cloud, setCloud] = useState(null);
  const cloudRequest = useRef(0);
  const cloudCache = useRef(new Map());
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
  useEffect(() => {
    if (!workspace || workspace === initial?.example) return;
    const stop = window.asl.onEnvironmentChanged(data => {
      if (data.workspace !== workspace) return;
      if (data.error) { setMessage({error:true,text:`实时检测不可用：${data.error}。可以手动刷新。`}); return; }
      setExternalChange(true);
    });
    api('watch', workspace).catch(error=>setMessage({error:true,text:error.message}));
    return stop;
  }, [workspace]);
  useEffect(() => {
    if (externalChange && !modal && !busy) {
      setExternalChange(false);
      read('environment', '刷新工作环境', async call=>{
        try { await load(workspace, call); }
        catch (error) { throw new Error(`本地文件需要修正：${error.message}。界面暂保留上次有效内容。`); }
      });
    }
  }, [modal, externalChange, busy]);
  const detailRequest = useRef(0);
  const contentRef = useRef(null);
  useEffect(() => { contentRef.current?.scrollTo(0, 0); }, [page, modeId]);
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
  async function load(root, call = api, {restore = false, targetMode} = {}) {
    const request = ++loadRequest.current;
    const navigation = navigationVersion.current;
    const changed = root !== currentRoot.current;
    currentRoot.current = root;
    setWorkspace(root);
    setLoadingRoot(root);
    setLoadError(null);
    if (changed) {
      detailRequest.current++;setTexts(null);
      setCatalog(catalogCache.current.get(root) || null);
      setModeId(targetMode || null);setView('map');setSelected(null);setQuery('');
      setGithubReport(null);
    } else if (targetMode !== undefined) setModeId(targetMode);
    try {
      const data = await call('run', 'catalog', {workspace: root});
      if (request !== loadRequest.current) return false;
      catalogCache.current.set(root, data);
      setCatalog(data);
      setModeId(previous=>data.modes.some(m=>m.id===previous)?previous:null);
      // Catalog display does not wait for a preferences write or a Skill file read.
      const preferences = await call('remember', root);
      if (request !== loadRequest.current) return false;
      if (restore && navigation === navigationVersion.current) {
        const saved=restoreView(data,preferences.views?.[root]);
        setModeId(saved.mode || null);setView(saved.view);setQuery(saved.query);updatePage(saved.page);
        setProvider(saved.provider);setGithubUrl(saved.githubUrl);
        if(saved.skill) read('detail','读取技能',next=>selectSkill(data.skills.find(s=>s.id===saved.skill),root,next));
        if(saved.page==='discover' && (saved.provider==='local'||saved.provider==='github-import'&&saved.githubUrl))setResumeDiscovery(saved);
      }
      setInitial(previous=>({...previous,views:preferences.views,libraries:[root,...(previous?.libraries||[]).filter(p=>p!==root)]}));
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
      try {const report=await job;if(active)setLocalReport(report);return report;}
      catch(error){if(active&&!refresh)setMessage({error:true,text:`本机技能读取失败：${error.message}`});}
      finally{if(localIndex.current===job)localIndex.current=null;if(active)setIndexing(false);last=Date.now();}
    };
    discover(false).then(report=>{if(active&&report?.cached)discover(true);});
    const focus=()=>{if(Date.now()-last>5*60*1000)discover(true);};
    window.addEventListener('focus',focus);
    read('environment', '打开工作环境', async call => {
      const data = await call("initial");
      setInitial(data);
      if(data.activeSource)openCloud(data.activeSource.url,data.activeSource.mode);
      if (data.workspace) await load(data.workspace, call, {restore:!data.activeSource});
      setReady(true);
    });
    return()=>{active=false;window.removeEventListener('focus',focus);};
  }, []);
  useEffect(()=>{
    if(!ready||!workspace||!catalog||busy)return;
    api('rememberView',workspace,{mode:modeId||'',page,view,skill:selected?.id||'',query,provider,githubUrl})
      .catch(error=>setMessage({error:true,text:`界面位置未保存：${error.message}`}));
  },[ready,workspace,catalog,busy,loadingRoot,modeId,page,view,selected?.id,query,provider,githubUrl]);
  useEffect(()=>{
    if(!resumeDiscovery||busy)return;
    const saved=resumeDiscovery;setResumeDiscovery(null);
    read(saved.provider === 'local' ? 'local' : 'github', '恢复发现结果', async call=>{
      if(saved.provider==='local')setLocalReport(await call('localSkills'));
      else setGithubReport(await call('githubSkills',saved.githubUrl));
    });
  },[resumeDiscovery,busy]);
  useEffect(()=>{
    if(!initial||workspace)return;
    const check=()=>task(async()=>{const data=await api('initial');if(data.workspace)await load(data.workspace);});
    window.addEventListener('focus',check);
    return ()=>window.removeEventListener('focus',check);
  },[initial,workspace]);
  useEffect(() => {
    if (page === "agents") read('native', '读取 Agent 配置', async call => setNative(await call("native")));
    if (page === "discover" && provider === "local" && !localReport) read('local', '发现本机技能', async call => setLocalReport(await call("localSkills")));
  }, [page, provider]);
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
    reads.cancel('cloud');api('selectSource',null).catch(error=>setMessage({error:true,text:error.message}));
    if(item.workspace===workspace && catalog){navigate(()=>{setModeId(item.id);setPage('modes');});return;}
    await openLibrary(item.workspace, item.id);
  };
  const mode = catalog?.modes.find((m) => m.id === modeId);
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
  async function saveDiagram(item,document) {
    const root=workspace,request={operation:'mode.save',id:item.id,expected:item.fingerprint,skills:item.roots,document};
    const result=await api('run','edit',{workspace:root,request,apply:true});
    if(result.canceled)throw new Error('未保存修改');
    catalogCache.current.delete(root);
    if(currentRoot.current===root)await load(root);
  }
  const openLibrary = (root, targetMode = null) => {
    setModal(null);setCloud(null);cloudRequest.current++;reads.cancel('cloud');
    api('selectSource',null).catch(error=>setMessage({error:true,text:error.message}));
    setPage('modes');
    return read('environment', '打开模式库', call => load(root, call, {targetMode}));
  };
  function goPage(id) {
    if (['skill-editor','skill-files'].includes(modal?.kind) && !window.confirm('离开编辑页？未保存的修改会丢失。')) return;
    setModal(null);setCloud(null);cloudRequest.current++;reads.cancel('cloud');reads.cancel('detail');detailRequest.current++;
    api('selectSource',null).catch(error=>setMessage({error:true,text:error.message}));
    navigate(()=>{setPage(id);if(id==='modes')setModeId(null);setSelected(null);setQuery('');});
  }
  async function selectSkill(skill,root=workspace,call=api) {
    setSelected(skill);
    setTexts(null);
    const sequence = ++detailRequest.current;
    const data = await call("readSkill", root, skill.id);
    if (sequence === detailRequest.current) setTexts(data);
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
    const result=await api("run", "edit", {workspace, request, apply:true});
    if(result.canceled)return;
    await load(workspace);
    setModal(null);
    if(request.operation === "mode.save" && request.id) showMode(request.id);
    setMessage({text:"已保存到本地；Agent 可读取同一份内容。"});
  }
  async function saveFile(request,refresh=true) {
    const result=await api('run','edit',{workspace,request,apply:true});
    if(result.canceled)throw new Error('未保存更改');
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
  async function removeFromMode(id) {
    const current = catalog.modes.find((m) => m.id === id);
    if (!current.roots.includes(selected.id))
      throw new Error("这是其他技能的必要依赖，请先调整依赖它的技能。");
    await editContent({
      operation: "mode.save",
      id: current.id,
      expected: current.fingerprint,
      document: current.document,
      skills: current.roots.filter((s) => s !== selected.id),
    });
  }
  async function importSkill() {
    const source = await api("choose", "skillFolder");
    if (!source) return;
    const report = await api("localSkills", source);
    if (report.skills.length === 1) await inspectDiscovered(report.skills[0]);
    else { setLocalReport(report); setExtraSkillRoot(source); setProvider("local"); setPage("discover"); }
  }
  function adoptSkill(skill, targetMode) {
    setModal({ kind: "local-import", ...skill, mode: targetMode || (page === "modes" ? mode?.id || "" : ""), category: "",
      useExisting: catalog.skills.some(s => s.id === skill.id) });
  }
  // Explicit "create a new Mode from this discovered skill": land the skill in the
  // library first (reusing a same-name version), then open a new draft. Cancelling the
  // import or the draft never creates an empty Mode.
  async function createModeWithSkill(skill) {
    if (!skill?.id) return;
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
    return openCloud(url);
  }
  function navigateCloud(patch){setCloud(previous=>({...previous,...patch}));}
  async function openCloud(url, id, refresh=false) {
    setSelected(null);setModal(null);setPage('modes');
    const sequence=++cloudRequest.current;
    reads.cancel('cloud');reads.cancel('cloud-readme');
    const report=cloudCache.current.get(url);
    const next={url,mode:id||null,view:'overview',skill:null,report};
    if(!refresh&&report){setCloud(next);return;}
    setCloud({...next,loading:true});
    if(!report)read('cloud-readme','读取仓库介绍',async call=>{
      try{const readme=await call('repositoryOverview',url);if(sequence===cloudRequest.current)setCloud(previous=>({...previous,readme}));}
      catch{/* Full inspection supplies the final error/retry; this independent preview is optional. */}
    });
    return read('cloud','读取模式库',async call=>{try {
      const report=await call('githubSkills',url);
      cloudCache.current.set(url,report);
      if(cloudCache.current.size>12)cloudCache.current.delete(cloudCache.current.keys().next().value);
      if(sequence!==cloudRequest.current)return;
      setCloud(previous=>previous?.url===url?{...previous,report,loading:false,error:null}:previous);
      setInitial(p=>({...p,repositories:[url,...(p.repositories||[]).filter(v=>v!==url)]}));
    } catch(error){if(sequence===cloudRequest.current)setCloud(previous=>({...previous,loading:false,error:error.message}));}});
  }
  useEffect(()=>{
    if(cloud?.report)api('selectSource',{url:cloud.url,mode:cloud.mode||null}).catch(error=>setMessage({error:true,text:error.message}));
  },[cloud?.url,cloud?.mode,cloud?.report]);
  // Cloud refresh only replaces the remote preview, never the user's adopted Mode.
  useEffect(()=>{
    if(!cloud?.url||modal||busy)return;
    const url=cloud.url;
    let active=true,pending=false,last=Date.now();
    const refresh=async()=>{
      if(document.hidden||pending||Date.now()-last<5*60*1000)return;
      pending=true;last=Date.now();
      try{
        const report=await api('githubSkills',url);
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
  function openGuide(modeId, repository=null) {
    const target=workspace&&!readOnly?workspace:initial.managedLibrary;
    setModal({kind:'agent-guide',workspace:target,mode:modeId||'',repository});
  }
  async function refreshLocal() {
    const target=modal?.workspace||workspace;
    if(target){await load(target);setModal(null);}
    else{const data=await api('initial');if(data.workspace)await load(data.workspace);}
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
  const editorOpen=['mode-workspace','diagram-editor','skill-editor','skill-files','import-review','connect','agent-guide'].includes(modal?.kind);

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
                className={page === id ? "active" : ""}
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
          <SourceTree local={[...(localModeReport?.modes||[]).filter(m=>m.workspace!==workspace),...(catalog?.modes||[]).map(m=>({...m,workspace}))]}
            repositories={initial?.repositories||[]} workspace={workspace} mode={modeId} cloud={cloud}
            onLocal={openLocalMode} onCloud={openCloud} onNavigate={navigateCloud} onContext={url=>task(()=>sourceMenu(url))}/>
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
              <button className="breadcrumb-button" onClick={()=>goPage(page)}>{page === "modes"
                ? "工作模式"
                : page === "skills"
                  ? "全部技能"
                  : page === "discover"
                    ? "发现"
                    : page === "updates" ? "来源与更新" : "Agent 配置"}</button>
              {page === "modes" && (cloud || mode) && (
                <>
                  <ChevronRight size={14} />
                  <span title={cloud?.url || workspace}>{baseName(cloud?.url || workspace)}</span><ChevronRight size={14}/>
                  <b>{cloud?(cloud.skill?cloud.report?.skills.find(s=>s.source===cloud.skill||s.id===cloud.skill)?.title:cloud.mode?cloud.report?.modes.find(m=>m.id===cloud.mode)?.title:cloud.view==='skills'?'技能':'仓库介绍'):mode.title}</b>
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
                    onClick={() => cloud?openCloud(cloud.url,cloud.mode,true):task(refreshLocal)}
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
                onRefresh={()=>openCloud(cloud.url,cloud.mode,true)}
                onUse={item=>task(()=>importRepositoryMode(item,null,true,cloud.report))}
                onSave={item=>task(()=>importRepositoryMode(item,null,false,cloud.report))}
                onAdd={catalog&&!readOnly?adoptSkill:null}/>
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
                    onClick={()=>openGuide()}
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
                    {!catalog?.modes.some(m => m.upstream) ? <Empty icon={Link2} title="未连接仓库"/> : <div className="update-list">{catalog.modes.filter(m => m.upstream).map(item => {
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
                    <div className="page-heading"><h1>工作模式</h1><button className="primary" disabled={readOnly} onClick={()=>setModal({kind:'mode-workspace'})}><Plus size={16}/>新建模式</button></div>
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
                          {mode.document.split("\n").find(line => line.trim() && !line.startsWith("#")) && (
                            <p>
                              {shortText(
                                mode.document
                                  .split("\n")
                                  .find(
                                    (line) =>
                                      line.trim() && !line.startsWith("#"),
                                  ),
                                110,
                              )}
                            </p>
                          )}
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
                              setModal({ kind: modeEditorKind(mode), item: mode })
                            }
                          />
                          {modeEditorKind(mode)==='diagram-editor'&&<IconButton icon={Puzzle} label="管理技能" disabled={readOnly}
                            onClick={()=>setModal({kind:'mode-workspace',item:mode})}/>}
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
                        <ArchitectureMap
                          key={`${workspace}:${mode.id}`}
                          mode={mode}
                          skills={modeSkills}
                          onSkill={item=>setSelected(item)}
                          onEdit={readOnly?null:title=>setModal({kind:'diagram-editor',item:mode,title})}
                          onSaveDocument={readOnly?null:saveDiagram}
                        />
                      ) : (
                        <SkillLibrary
                          catalog={modeCatalog}
                          query={query}
                          onSkill={skill=>read('detail', '读取技能', call=>selectSkill(skill,workspace,call))}
                          onEditMode={readOnly?undefined:(_,title)=>setModal({kind:'diagram-editor',item:mode,title})}
                          onSaveDocument={readOnly?null:saveDiagram}
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
                      <SkillLibrary catalog={catalog} query={query} onSkill={item=>setModal({kind:'skill-files',item})}
                        onEditMode={readOnly?undefined:(id,title)=>setModal({kind:'diagram-editor',item:catalog.modes.find(m=>m.id===id),title})} onSaveDocument={readOnly?null:saveDiagram}/>
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
                        <div className="field-heading"><span className="muted">{extraSkillRoot ? "自选目录" : indexing?'正在检查更新':localReport?.checkedAt?`检查于 ${new Date(localReport.checkedAt).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}`:'本机技能'}</span><div className="heading-actions">
                          <button onClick={() => read('local', '发现目录技能', async call => { const root = await call('choose', 'skillSearchRoot'); if (root) { setExtraSkillRoot(root); setLocalReport(await call('localSkills', root)); } })}><FolderOpen size={16} />选择目录</button>
                          <button onClick={() => read('local', '发现本机技能', async call => { setExtraSkillRoot(null); setLocalReport(await call('localSkills',null,true)); })}><RotateCw size={16} />扫描本机</button>
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
            {selected && catalog && (
              page==='modes'&&view==='map'?<SkillFiles key={`${workspace}:${selected.id}`} item={selected} Dialog={SkillPanel} embedded readOnly={readOnly} onClose={()=>setSelected(null)}
                readFile={file=>api('run','files',{workspace,skill:selected.id,file})}
                saveFile={saveFile}/>:<SkillDetails
                skill={selected}
                readOnly={readOnly}
                texts={texts}
                modes={catalog.modes}
                onClose={() => {
                  setSelected(null);
                  detailRequest.current++;
                }}
                onEdit={() =>
                  setModal({ kind: "skill-files", item: selected })
                }
                onBrowse={()=>setModal({kind:'skill-files',item:selected})}
                onArchive={() =>
                  task(() =>
                    editContent({
                      operation: "skill.archive",
                      id: selected.id,
                      expected: selected.fingerprint,
                    }),
                  )
                }
                onAdd={() => setModal({ kind: "add-to-mode" })}
                onRemove={(id) => task(() => removeFromMode(id))}
              />
            )}
          </div>
          {message && (
            <div
              role={message.error ? "alert" : "status"}
              className={`toast ${message.error ? "error" : ""}`}
            >
              {message.error ? <AlertCircle size={18} /> : <Check size={18} />}
              <span>{message.text}</span>
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
        {modal?.kind === 'diagram-editor'&&<DiagramEditor mode={modal.item} initialTitle={modal.title} skills={catalog.skills} onSave={saveContent} onClose={()=>setModal(null)}
          readFile={(item,file)=>api('run','files',{workspace,skill:item.id,file})}
          saveFile={request=>saveFile(request,false)}/>}
        {modal?.kind === "mode-workspace" && catalog && (
          <ModeWorkspace
            mode={modal.item || null}
            draft={modal.draft || null}
            catalog={catalog}
            workspace={workspace}
            api={api}
            read={read}
            reads={reads}
            Dialog={EditorPage}
            Field={Field}
            onSave={(request) => task(() => saveContent(request))}
            onCatalog={next => setCatalog(next)}
            onClose={() => setModal(null)}
          />
        )}
        {modal?.kind === "skill-editor" && (
          <SkillEditor
            item={modal.item}
            texts={modal.texts}
            onSave={(request) => task(() => saveContent(request))}
            onClose={() => setModal(null)}
          />
        )}
        {modal?.kind === 'skill-files' && <SkillFiles item={modal.item} Dialog={EditorPage} readOnly={readOnly} onClose={()=>setModal(null)}
          readFile={file=>api('run','files',{workspace,skill:modal.item.id,file})}
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
          <ConnectDialog
            mode={catalog.modes.find(m => m.id === modal.modeId) || mode || catalog.modes[0]}
            modes={catalog.modes}
            workspace={workspace}
            initialHost={modal.host}
            initialScope={modal.scope}
            initialProject={modal.project}
            locations={locations}
            task={task}
            onClose={() => setModal(null)}
            onApplied={(text,values) => { setMessage({ text });setAgentHost(values.host);setPage('agents');api("native").then(setNative).catch(error=>setMessage({error:true,text:error.message})); }}
          />
        )}
        {modal?.kind === "discovered-detail" && <Dialog title={modal.skill.title} onClose={() => setModal(null)} wide>
          <p>{modal.skill.description}</p>
          <p className="muted">文件解析结果，未执行技能，也未验证实际效果。</p>
          {modal.skill.inspection?.reasons.length ? <div className="inline-note"><span><b>需要先核对配套内容</b>{modal.skill.inspection.reasons.map(reason => <small key={reason}>{reason}</small>)}</span></div> : <p>未发现脚本、运行声明或目录外引用，可继续检查完整技能包。</p>}
          {modal.skill.inspection?.dependencies.map(d => <div className="dependency-preview" key={d.file}><b>{d.kind} · {d.file}</b><p>{d.requirements.join("、") || "以原声明为准"}</p>{d.setupScripts.length > 0 && <small>安装脚本：{d.setupScripts.join("、")}（未执行）</small>}{d.parseWarning && <small>{d.parseWarning}</small>}</div>)}
          <details><summary>包含的文件（{modal.skill.inspection?.files.length || 0}）</summary><pre className="repository-tree">{modal.skill.inspection?.files.join("\n")}</pre></details>
          <details><summary>技能原文</summary><pre className="repository-tree">{modal.document}</pre></details>
          <p className="path-line">{modal.skill.origin || modal.skill.source}</p>
          <div className="dialog-actions"><button onClick={() => setModal(null)}>关闭</button>
            {modal.skill.origin && <button onClick={() => task(() => api("external", modal.skill.origin))}>查看原仓库<ArrowUpRight size={15} /></button>}
            <button className="primary" disabled={!catalog || readOnly} onClick={() => adoptSkill(modal.skill)}>添加到 Mode</button>
          </div>
        </Dialog>}
        {modal?.kind === "setup" && <SetupDialog values={modal.values} resultMessage={modal.resultMessage} title={catalog?.modes.find(m => m.id === modal.values.mode)?.title || modal.values.mode} task={task} onClose={() => setModal(null)} />}
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
