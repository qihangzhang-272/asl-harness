import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
} from "@xyflow/react";
import {
  Layers3,
  Puzzle,
  Compass,
  SlidersHorizontal,
  Plus,
  Search,
  X,
  ChevronRight,
  ChevronDown,
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
  AlertCircle,
  RotateCw,
  Copy,
  Palette,
  PenLine,
  Send,
  PanelsTopLeft,
  ChartNoAxesCombined,
} from "lucide-react";
import {
  capabilityGroups,
  errorText,
  graphForMode,
  shortText,
} from "./presentation.mjs";

const icons = {
  Search,
  Palette,
  PenLine,
  Send,
  PanelsTopLeft,
  ChartNoAxesCombined,
  Box,
};
const baseName = (value) => (value || "").split(/[\\/]/).filter(Boolean).pop();
const NoticeContext = createContext(null);
async function api(method, ...args) {
  const reply = await window.asl[method](...args);
  if (!reply.ok) throw new Error(errorText(reply.error));
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
function SkillRow({ skill, onClick, selected = false, trailing }) {
  return (
    <div className={`skill-row ${selected ? "selected" : ""}`}>
      <button className="row-main" onClick={onClick}>
        <span className="skill-symbol">
          <Puzzle size={18} />
        </span>
        <span>
          <strong>{skill.title}</strong>
          <small>{shortText(skill.description, 92)}</small>
        </span>
      </button>
      {trailing || <ChevronRight size={16} />}
    </div>
  );
}

function CapabilityNode({ data }) {
  const Icon = data.group
    ? icons[data.group.icon] || Box
    : data.kind === "mode"
      ? Layers3
      : Puzzle;
  return (
    <div className={`map-node ${data.kind}`}>
      <Handle type="target" position={Position.Left} />
      <span className="node-symbol">
        <Icon size={19} />
      </span>
      <div>
        <strong>{data.title}</strong>
        <small>
          {data.kind === "skill"
            ? shortText(data.skill.description, 34)
            : `${data.count} 个技能`}
        </small>
      </div>
      {data.kind === "group" && (
        <ChevronRight size={16} className={data.open ? "expanded" : ""} />
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { capability: CapabilityNode };
function DependencyMap({ mode, skills, onSkill }) {
  const [expanded, setExpanded] = useState(new Set());
  useEffect(() => setExpanded(new Set()), [mode.id]);
  const graph = useMemo(
    () => graphForMode(mode, skills, expanded),
    [mode, skills, expanded],
  );
  return (
    <div className="map-canvas">
      <ReactFlow
        key={`${mode.id}:${[...expanded].join(",")}`}
        {...graph}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.22, maxZoom: 1.05 }}
        minZoom={0.25}
        maxZoom={1.8}
        nodesDraggable={false}
        nodesConnectable={false}
        deleteKeyCode={null}
        onNodeClick={(_, node) => {
          if (node.data.kind === "skill") onSkill(node.data.skill);
          if (node.data.kind === "group")
            setExpanded((previous) => {
              const next = new Set(previous);
              next.has(node.data.group.id)
                ? next.delete(node.data.group.id)
                : next.add(node.data.group.id);
              return next;
            });
        }}
      >
        <Background color="#d7dce3" gap={22} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
      <div className="map-caption">
        点开能力分组，查看技能 <span>实线：包含 · 虚线：依赖</span>
      </div>
    </div>
  );
}

function CapabilityMap({ mode, skills, onSkill, onManage }) {
  const [expanded, setExpanded] = useState(new Set());
  const [relations, setRelations] = useState(false);
  useEffect(() => {
    setExpanded(new Set());
    setRelations(false);
  }, [mode.id]);
  const groups = capabilityGroups(skills, mode.capabilities);
  return (
    <>
      <div className="capability-foot">
        <span>{mode.capabilities ? "手动分类 · 随模式保存" : "建议分类 · 可自行调整"}</span>
        <button className="text-button" disabled={!onManage} onClick={onManage}><Pencil size={15} />管理类别</button>
      </div>
      <div className="capability-grid">
        {groups.map((group) => {
          const Icon = icons[group.icon] || Box;
          const visible = expanded.has(group.id)
            ? group.skills
            : group.skills.slice(0, 4);
          return (
            <section
              className={`capability-card tone-${group.id}`}
              key={group.id}
            >
              <header>
                <span className="capability-icon">
                  <Icon size={19} />
                </span>
                <h3>{group.title}</h3>
                <span className="count">{group.skills.length}</span>
              </header>
              <div className="capability-skills">
                {visible.map((skill) => (
                  <button
                    key={skill.id}
                    onClick={() => onSkill(skill)}
                    title={skill.description}
                  >
                    <Puzzle size={15} />
                    <span>{skill.title}</span>
                    <ChevronRight size={14} />
                  </button>
                ))}
              </div>
              {group.skills.length > 4 && (
                <button
                  className="expand-group"
                  onClick={() =>
                    setExpanded((previous) => {
                      const next = new Set(previous);
                      next.has(group.id)
                        ? next.delete(group.id)
                        : next.add(group.id);
                      return next;
                    })
                  }
                >
                  {expanded.has(group.id)
                    ? "收起"
                    : `查看全部 ${group.skills.length} 个技能`}
                  <ChevronDown size={14} />
                </button>
              )}
            </section>
          );
        })}
      </div>
      <div className="capability-foot">
        {skills.some((s) => s.requires.length) && (
          <button
            className="text-button"
            onClick={() => setRelations(!relations)}
          >
            <Network size={15} />
            {relations ? "收起关系图" : "查看技能依赖"}
          </button>
        )}
      </div>
      {relations && (
        <DependencyMap mode={mode} skills={skills} onSkill={onSkill} />
      )}
    </>
  );
}

function CategoryEditor({ mode, skills, onSave, onClose }) {
  const [groups, setGroups] = useState(() => (mode.capabilities || capabilityGroups(skills)
    .map(g => ({ title: g.title, skills: g.skills.map(s => s.id) }))).map(g => ({ ...g, skills: [...g.skills] })));
  const [query, setQuery] = useState("");
  const duplicate = groups.some((g, i) => !g.title.trim() || groups.some((o, j) => i !== j && o.title.trim() === g.title.trim()));
  return <Dialog title="管理能力类别" onClose={onClose} wide>
    <p className="muted">类别只影响这张地图。删除类别不会删除技能，技能会回到“未分类”。</p>
    <div className="category-editor">
      {groups.map((g, i) => <div className="category-name" key={i}>
        <input aria-label={`类别名称 ${i + 1}`} maxLength={80} value={g.title}
          onChange={e => setGroups(groups.map((v, n) => n === i ? { ...v, title: e.target.value } : v))} />
        <Tag>{g.skills.length}</Tag>
        <IconButton icon={X} label={`删除类别 ${i + 1}`} onClick={() => setGroups(groups.filter((_, n) => n !== i))} />
      </div>)}
      <button onClick={() => setGroups([...groups, { title: "", skills: [] }])}><Plus size={16} />新增类别</button>
    </div>
    <div className="search"><Search size={16} /><input aria-label="筛选要分类的技能" placeholder="搜索技能并调整归属" value={query} onChange={e => setQuery(e.target.value)} /></div>
    <div className="picker-list">
      {skills.filter(s => `${s.title} ${s.id}`.toLowerCase().includes(query.toLowerCase())).map(s => <div className="category-assignment" key={s.id}>
        <span>{s.title}</span>
        <select aria-label={`${s.title}的类别`} value={groups.findIndex(g => g.skills.includes(s.id))}
          onChange={e => setGroups(groups.map((g, i) => ({ ...g, skills: [...g.skills.filter(id => id !== s.id), ...(i === Number(e.target.value) ? [s.id] : [])] })))}>
          <option value={-1}>未分类</option>
          {groups.map((g, i) => <option key={i} value={i}>{g.title || "新类别"}</option>)}
        </select>
      </div>)}
    </div>
    {duplicate && <p className="muted">请填写不重复的类别名称。</p>}
    <div className="dialog-actions"><button onClick={onClose}>取消</button><button className="primary" disabled={duplicate} onClick={() => onSave({ operation: "mode.save", id: mode.id,
      expected: mode.fingerprint, document: mode.document, skills: mode.roots, capabilities: groups })}>保存分类</button></div>
  </Dialog>;
}

function DiscoveredSkills({ report, catalog, onInspect, empty = "尚未发现技能" }) {
  const [query, setQuery] = useState("");
  const found = report?.skills || [];
  const filtered = found.filter(s => `${s.title} ${s.description} ${s.id}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <div className="field-heading"><b>{found.length} 个技能</b><span className="muted">仅发现，尚未导入</span></div>
    {!!found.length && <div className="search"><Search size={16} /><input aria-label="筛选发现的技能" placeholder="搜索已发现的技能" value={query} onChange={e => setQuery(e.target.value)} /></div>}
    <div className="discovered-list">
      {filtered.map(s => <article className="discovered-skill" key={s.source}>
        <div><strong>{s.title}</strong><p>{shortText(s.description, 160)}</p><Tag>{s.inspection?.status === "needs-review" ? "有配套内容 · 需核对" : "可预览添加"}</Tag><details><summary>来源{catalog?.skills.some(k => k.id === s.id) ? " · 库中已有同名技能" : ""}</summary><small className="path-line">{s.origin || s.location || s.source}</small></details></div>
        <button onClick={() => onInspect(s)}>查看解析<ChevronRight size={15} /></button>
      </article>)}
    </div>
    {!filtered.length && <Empty title={found.length ? "没有匹配的技能" : empty}><p>需要包含有效的 SKILL.md；普通仓库和插件不会被自动当作技能。</p></Empty>}
    {!!report?.issues?.length && <details className="scan-issues"><summary>{report.issues.length} 个目录或文件未纳入</summary>{report.issues.map((issue, i) => <p className="path-line" key={i}>{issue.path}：{issue.message}</p>)}</details>}
  </>;
}

function ModeEditor({ item, allSkills, onSave, onClose }) {
  const [id, setId] = useState(
    item?.id || `mode-${crypto.randomUUID().slice(0, 8)}`,
  );
  const [name, setName] = useState(
    item?.document.match(/^#\s+(.+)$/m)?.[1] || "",
  );
  const [body, setBody] = useState(
    item?.document.replace(/^#\s+.+\r?\n?/m, "").trim() || "",
  );
  const [roots, setRoots] = useState(new Set(item?.roots || []));
  const [query, setQuery] = useState("");
  return (
    <Dialog
      title={item?.fingerprint ? "编辑工作模式" : "新建工作模式"}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const included = new Set(roots);
          for (const id of included) {
            for (const dependency of allSkills.find(s => s.id === id)?.requires || []) included.add(dependency);
          }
          onSave({
            operation: "mode.save",
            id,
            document: `# ${name.trim()}\n\n${body}`,
            skills: [...roots],
            ...(item?.fingerprint ? { expected: item.fingerprint } : {}),
            ...(!item?.fingerprint && item?.capabilities ? {
              capabilities: item.capabilities.map(group => ({ ...group, skills: group.skills.filter(id => included.has(id)) })),
            } : {}),
          });
        }}
      >
        <Field label="名称">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如 内容创作"
          />
        </Field>
        <Field label="用途与约定">
          <textarea
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="在什么场景使用这个模式"
          />
        </Field>
        {!item?.fingerprint && (
          <details>
            <summary>文件夹名称</summary>
            <input
              required
              aria-label="模式文件夹名称"
              pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
              value={id}
              onChange={(e) => setId(e.target.value)}
            />
          </details>
        )}
        <div className="field-heading">
          <b>包含的技能</b>
          <Tag>{roots.size}</Tag>
        </div>
        <div className="search">
          <Search size={16} />
          <input
            aria-label="筛选可添加技能"
            placeholder="搜索技能"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="picker-list">
          {allSkills
            .filter((s) =>
              `${s.title} ${s.description}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((skill) => (
              <label key={skill.id} className="check-row">
                <input
                  type="checkbox"
                  checked={roots.has(skill.id)}
                  onChange={(e) =>
                    setRoots((previous) => {
                      const next = new Set(previous);
                      e.target.checked
                        ? next.add(skill.id)
                        : next.delete(skill.id);
                      return next;
                    })
                  }
                />
                <span>
                  <strong>{skill.title}</strong>
                  <small>{shortText(skill.description, 70)}</small>
                </span>
              </label>
            ))}
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary" disabled={!roots.size}>
            保存模式
          </button>
        </div>
      </form>
    </Dialog>
  );
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
    <Dialog title={item ? "编辑技能" : "创建技能"} onClose={onClose} wide>
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
    </Dialog>
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
        {tab === "content" && (
          <pre className="document">{texts?.["SKILL.md"] || "正在读取…"}</pre>
        )}
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
    <div className="apply-summary"><SlidersHorizontal size={19} /><span>{title}<small>{{"codex-app": "Codex", "claude-code": "Claude Code", "deepseek-harness": "DeepSeek Harness", workbuddy: "WorkBuddy"}[values.host]} · {values.scope === "user" ? "当前用户" : values.scope === "preset" ? "独立预设" : "所选项目"}</small></span></div>
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
    <div className="dialog-actions"><button onClick={() => task(() => check(true))} disabled={checking}><RotateCw size={16} className={checking ? "spin" : ""} />重新检查</button><button className="primary" disabled={!assistant || !report || checking} onClick={() => task(async () => { const result = await api("setup", assistant, values); if (!result.canceled) setSession(result); })}>让 AI 配置<ArrowUpRight size={16} /></button></div>
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
  initialScope = "project",
  initialProject = "",
}) {
  const [modeId, setModeId] = useState(initialMode.id);
  const mode = modes.find((item) => item.id === modeId) || initialMode;
  const [native, setNative] = useState(null);
  const [host, setHost] = useState(initialHost);
  const [project, setProject] = useState(initialProject);
  const [preset, setPreset] = useState("");
  const [scope, setScope] = useState(initialScope);
  const [skillsDir, setSkillsDir] = useState("");
  const [preview, setPreview] = useState(null);
  useEffect(() => setPreview(null), [scope, host, modeId, project, preset, skillsDir]);
  useEffect(() => {
    const current = native?.hosts.find(h => h.id === host);
    setSkillsDir(current?.userMode?.skillsDir && current.userMode.skillsDir !== current.skillRoot ? current.userMode.skillsDir : "");
  }, [native, host]);
  useEffect(() => {
    api("native")
      .then(setNative)
      .catch((error) => task(() => Promise.reject(error)));
  }, []);
  const selected = native?.hosts.find((h) => h.id === host);
  return (
    <Dialog title="应用工作模式" onClose={onClose}>
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
        {native?.hosts.map((h) => (
          <button
            key={h.id}
            disabled={!h.scopes.length}
            title={!h.scopes.length ? "已识别本机目录，尚未支持应用模式" : h.directory}
            onClick={() => {
              setHost(h.id);
              setProject("");
              setScope("project");
            }}
            className={host === h.id ? "selected" : ""}
          >
            <span className={`host-symbol ${h.id}`}>{h.name[0]}</span>
            <strong>{h.name}{!h.scopes.length && <small>暂未接入</small>}</strong>
            {host === h.id && <Check size={16} />}
          </button>
        ))}
      </div>
          <div className="field-heading">
            <b>在哪里使用</b>
          </div>
          <button type="button" className={`scope-option ${scope === "project" ? "selected" : ""}`} onClick={() => setScope("project")} aria-pressed={scope === "project"}>
            {scope === "project" ? <Check size={17} /> : <Circle size={17} />}
            <div>
              <strong>
                {host === "deepseek-harness" ? "一个独立预设" : "仅这个项目"}
              </strong>
              <small>
                {host === "deepseek-harness"
                  ? "在 DeepSeek 新会话中选择"
                  : "其他项目保持不变"}
              </small>
            </div>
          </button>
          {selected?.scopes.includes("user") && (
            <button type="button" className={`scope-option ${scope === "user" ? "selected" : ""}`} onClick={() => setScope("user")} aria-pressed={scope === "user"}>
              {scope === "user" ? <Check size={17} /> : <Circle size={17} />}
              <div>
                <strong>我的所有项目</strong>
                <small>设为当前用户的默认工作模式</small>
              </div>
            </button>
          )}
          {host === "deepseek-harness" ? (
            <Field label="基于哪个预设">
              <select
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
              >
                <option value="">选择预设</option>
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
                选择其他预设
              </button>
            </Field>
          ) : scope === "project" ? (
            <Field label="项目文件夹">
              <button
                className="folder-field"
                onClick={() =>
                  task(async () => {
                    const value = await api("choose", "project");
                    if (value) setProject(value);
                  })
                }
              >
                <FolderOpen size={18} />
                <span>{project || "选择项目"}</span>
                <ChevronRight size={16} />
              </button>
            </Field>
          ) : <Field label="用户技能目录"><button className="folder-field" onClick={() => task(async () => { const folder = await api("choose", "userSkills"); if (folder) setSkillsDir(folder); })}><FolderOpen size={18} /><span>{skillsDir || selected?.skillRoot}</span><ChevronRight size={16} /></button>{skillsDir ? <><small>自选目录。同步后需核对 Agent 是否已关联。</small><button className="text-button" onClick={() => setSkillsDir("")}>恢复默认目录</button></> : <small>{host === "codex-app" ? "这是原生共享技能目录，其他支持它的 Agent 也可能读取。" : "这是 Claude Code 当前使用的用户技能目录。"}</small>}</Field>}
          <div className="apply-summary">
            <Layers3 size={18} />
            <span>
              {mode.title}
              <small>
                {mode.skills.length} 个技能 · {selected?.name}
              </small>
            </span>
          </div>
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
              if (!result.canceled) { onClose(); onApplied("已停用用户级默认模式，原技能源不变。"); }
            })}>停用默认模式</button> : <button onClick={onClose}>取消</button>}
            <button
              className="primary"
              disabled={host === "deepseek-harness" ? !preset : scope === "project" ? !project : !!preview?.conflicts.length}
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
                    const output = await api("choose", "newPreset");
                    if (!output) return;
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
                      ? result.presetRegistered ? "已加入 DeepSeek 预设，请在新会话中选择。" : "已导出预设，但未放入 DeepSeek 预设目录，尚未启用。"
                      : result.discovery === "requires-connection" ? "已放入所选目录，还需关联 Agent。" : `${selected.name} 的模式已同步。`;
                    onApplied(status, { workspace, mode: mode.id, host, scope: host === "deepseek-harness" ? "preset" : scope, ...(target && { project: target }), ...(scope === "user" && skillsDir && { skillsDir }) });
                  }
                })
              }
            >
              {scope === "user" && !preview ? "查看同步预览" : "应用模式"}
              <ArrowUpRight size={16} />
            </button>
          </div>
    </Dialog>
  );
}

export default function App() {
  const [initial, setInitial] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [modeId, setModeId] = useState(null);
  const [page, setPage] = useState("modes");
  const [view, setView] = useState("map");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [texts, setTexts] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [modal, setModal] = useState(null);
  useEffect(() => setMessage(null), [modal?.kind]);
  const [native, setNative] = useState(null);
  const [provider, setProvider] = useState("local");
  const [localReport, setLocalReport] = useState(null);
  const [extraSkillRoot, setExtraSkillRoot] = useState(null);
  const [githubUrl, setGithubUrl] = useState("");
  const [githubReport, setGithubReport] = useState(null);
  const [marketQuery, setMarketQuery] = useState("");
  const [market, setMarket] = useState(null);
  const [marketError, setMarketError] = useState("");
  const gate = useRef(false);
  const detailRequest = useRef(0);
  async function task(action) {
    if (gate.current) return;
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
  async function load(root) {
    detailRequest.current++;
    setTexts(null);
    const data = await api("run", "catalog", { workspace: root });
    setWorkspace(root);
    setCatalog(data);
    setModeId((previous) =>
      data.modes.some((m) => m.id === previous) ? previous : data.modes[0]?.id,
    );
    setSelected(null);
    await api("remember", root);
    setInitial((previous) => ({
      ...previous,
      libraries: [
        root,
        ...(previous?.libraries || []).filter((p) => p !== root),
      ],
    }));
  }
  useEffect(() => {
    task(async () => {
      const data = await api("initial");
      setInitial(data);
      if (data.workspace) await load(data.workspace);
    });
  }, []);
  useEffect(() => {
    if (page === "agents") task(async () => setNative(await api("native")));
    if (page === "discover" && !localReport) task(async () => setLocalReport(await api("localSkills")));
  }, [page]);
  const mode = catalog?.modes.find((m) => m.id === modeId);
  const readOnly = workspace === initial?.example;
  const modeSkills = useMemo(
    () =>
      mode
        ? mode.skills.map((id) => catalog.skills.find((s) => s.id === id))
        : [],
    [mode, catalog],
  );
  async function chooseLibrary() {
    const root = await api("choose", "environment");
    if (root) await load(root);
  }
  async function selectSkill(skill) {
    setSelected(skill);
    setTexts(null);
    const sequence = ++detailRequest.current;
    const data = await api("readSkill", workspace, skill.id);
    if (sequence === detailRequest.current) setTexts(data);
  }
  async function editContent(request) {
    const preview = await api("run", "edit", { workspace, request });
    setModal({
      kind: "review",
      request: preview.sourceFingerprint
        ? { ...request, expectedSource: preview.sourceFingerprint }
        : request,
      preview,
    });
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
    setMessage({
      text: result.archivePath ? "已归档，原文件已保留。" : "已保存。",
    });
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
  function adoptSkill(skill) {
    setModal({ kind: "local-import", source: skill.source, origin: skill.origin, id: skill.id, mode: mode?.id || "", category: "" });
  }
  async function inspectDiscovered(skill) {
    const document = await api("sourceDocument", skill.source);
    setModal({ kind: "discovered-detail", skill, document });
  }
  async function inspectGithub(url = githubUrl) {
    setGithubReport(null);
    setGithubUrl(url);
    setGithubReport(await api("githubSkills", url));
    setProvider("github-import");
  }
  async function searchMarket() {
    setMarketError("");
    try {
      setMarket(await api("discover", provider, marketQuery));
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
    setModal({ kind: "import-target", source, report });
  }
  async function previewImport(target) {
    const report = await api("run", "import", { source: modal.source, target });
    setModal({ kind: "import-review", source: modal.source, target, report });
  }
  const filteredSkills = (catalog?.skills || []).filter((s) =>
    `${s.title} ${s.description} ${s.id}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  return (
    <NoticeContext.Provider value={{ ...message, busy }}>
      <div className="app" inert={busy} aria-busy={busy}>
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-symbol">
              <Layers3 size={22} />
            </span>
            <strong>ASL</strong>
            <span>Workspace</span>
          </div>
          <button
            className="library-switch"
            onClick={() => setModal({ kind: "libraries" })}
          >
            <span className="library-avatar">
              {workspace ? (
                baseName(workspace)[0].toUpperCase()
              ) : (
                <FolderOpen size={18} />
              )}
            </span>
            <span>
              <strong>{workspace ? baseName(workspace) : "选择技能库"}</strong>
              <small>
                {catalog
                  ? `${catalog.modes.length} 个模式 · ${catalog.skills.length} 个技能`
                  : "连接你的工作能力"}
              </small>
            </span>
            <ChevronDown size={15} />
          </button>
          <nav className="primary-nav">
            {[
              ["modes", "工作模式", Layers3],
              ["skills", "全部技能", Puzzle],
              ["discover", "发现", Compass],
              ["agents", "Agent 配置", SlidersHorizontal],
            ].map(([id, label, Icon]) => (
              <button
                key={id}
                className={page === id ? "active" : ""}
                onClick={() => {
                  setPage(id);
                  setSelected(null);
                  setQuery("");
                }}
              >
                <Icon size={18} />
                <span>{label}</span>
                {id === "skills" && catalog && (
                  <small>{catalog.skills.length}</small>
                )}
              </button>
            ))}
          </nav>
          <div className="sidebar-label">
            我的模式
            <IconButton
              icon={Plus}
              label="新建模式"
              disabled={!catalog || readOnly}
              onClick={() => setModal({ kind: "mode-editor" })}
            />
          </div>
          <nav className="mode-nav">
            {catalog?.modes.map((m, index) => (
              <button
                className={
                  modeId === m.id && page === "modes" ? "selected" : ""
                }
                key={m.id}
                onClick={() => {
                  setModeId(m.id);
                  setPage("modes");
                  setSelected(null);
                }}
              >
                <span className={`mode-dot color-${index % 4}`} />
                <span>{m.title}</span>
                <small>{m.skills.length}</small>
              </button>
            ))}
          </nav>
          <div className="sidebar-footer">
            <button onClick={() => task(importPack)}>
              <Download size={16} />
              导入模式
            </button>
            <IconButton
              icon={FolderOpen}
              label="切换技能库"
              onClick={() => task(chooseLibrary)}
            />
          </div>
        </aside>
        <div className="app-main">
          <header className="topbar">
            <span>
              {page === "modes"
                ? "工作模式"
                : page === "skills"
                  ? "全部技能"
                  : page === "discover"
                    ? "发现"
                    : "Agent 配置"}
              {page === "modes" && mode && (
                <>
                  <ChevronRight size={14} />
                  <b>{mode.title}</b>
                </>
              )}
            </span>
            <div>
              {workspace === initial?.example && (
                <Tag tone="amber">内置示例 · 只读</Tag>
              )}
              {busy ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                catalog && (
                  <IconButton
                    icon={RotateCw}
                    label="刷新技能库"
                    onClick={() => task(() => load(workspace))}
                  />
                )
              )}
            </div>
          </header>
          <div className="content-with-detail">
            <main className="content">
              {!catalog && page !== "discover" && page !== "agents" ? (
                <div className="welcome">
                  <div className="welcome-logo">
                    <Layers3 size={42} />
                  </div>
                  <h1>
                    你的工作能力，
                    <br />
                    各就其位。
                  </h1>
                  <p>管理模式与技能，在熟悉的 Agent 中使用。</p>
                  <button
                    className="primary"
                    onClick={() => task(chooseLibrary)}
                  >
                    <FolderOpen size={18} />
                    连接技能库
                  </button>
                  {initial?.libraries?.length > 0 && (
                    <div className="recent-list">
                      {initial.libraries.map((root) => (
                        <button
                          key={root}
                          onClick={() => task(() => load(root))}
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
                    onClick={() => task(() => load(initial.example))}
                  >
                    查看内置示例
                    <ChevronRight size={14} />
                  </button>
                </div>
              ) : (
                <>
                  {page === "modes" && mode && (
                    <div className="mode-page">
                      <div className="page-heading">
                        <div>
                          <div className="eyebrow">工作模式</div>
                          <h1>{mode.title}</h1>
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
                        </div>
                        <div className="heading-actions">
                          <IconButton
                            icon={Copy}
                            label="复制模式"
                            disabled={readOnly}
                            onClick={() =>
                              setModal({
                                kind: "mode-editor",
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
                              setModal({ kind: "mode-editor", item: mode })
                            }
                          />
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
                            onClick={() => setModal({ kind: "connect" })}
                          >
                            使用此模式
                            <ArrowUpRight size={16} />
                          </button>
                        </div>
                      </div>
                      <div className="mode-toolbar">
                        <div className="tabs">
                          {[
                            ["map", "能力地图", Network],
                            ["list", "技能列表", List],
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
                        <button
                          className="text-button"
                          disabled={readOnly}
                          onClick={() =>
                            setModal({ kind: "mode-editor", item: mode })
                          }
                        >
                          <Plus size={16} />
                          添加技能
                        </button>
                      </div>
                      {view === "map" ? (
                        <>
                          <CapabilityMap
                            mode={mode}
                            skills={modeSkills}
                            onSkill={(skill) => task(() => selectSkill(skill))}
                            onManage={readOnly ? null : () => setModal({ kind: "categories" })}
                          />
                        </>
                      ) : (
                        <div className="mode-skill-list">
                          <p className="muted">来自 mode.yaml 的技能清单与技能声明的依赖，不做关键词分组。</p>
                          <div className="list-surface">
                                {modeSkills.map((skill) => (
                                  <SkillRow
                                    key={skill.id}
                                    skill={skill}
                                    selected={selected?.id === skill.id}
                                    onClick={() =>
                                      task(() => selectSkill(skill))
                                    }
                                  />
                                ))}
                          </div>
                        </div>
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
                      <div className="list-surface">
                        {filteredSkills.map((skill) => (
                          <SkillRow
                            key={skill.id}
                            skill={skill}
                            selected={selected?.id === skill.id}
                            onClick={() => task(() => selectSkill(skill))}
                            trailing={
                              <Tag>
                                {skill.usedBy.length
                                  ? `${skill.usedBy.length} 个模式`
                                  : "未使用"}
                              </Tag>
                            }
                          />
                        ))}
                      </div>
                      {!filteredSkills.length && <Empty title="没有找到技能" />}
                    </>
                  )}
                  {page === "discover" && (
                    <>
                      <div className="page-heading">
                        <div>
                          <h1>发现新的能力</h1>
                          <p>寻找技能、插件与可复用的工作模式。</p>
                        </div>
                        {catalog && (
                          <button disabled={readOnly} onClick={() => task(importSkill)}>
                            <FolderOpen size={16} />
                            从文件夹导入
                          </button>
                        )}
                      </div>
                      <div className="market-search">
                        <div className="tabs">
                          <button className={provider === "local" ? "active" : ""} onClick={() => setProvider("local")}>本机技能</button>
                          <button className={provider === "github-import" ? "active" : ""} onClick={() => setProvider("github-import")}>粘贴 GitHub 链接</button>
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
                        {["dsh", "github"].includes(provider) && <form
                          className="search large"
                          onSubmit={(e) => {
                            e.preventDefault();
                            task(searchMarket);
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
                      {provider === "local" && <>
                        <div className="field-heading"><span className="muted">{extraSkillRoot ? "自选目录中的技能" : "从本机 Agent 的技能目录发现，不自动导入"}</span><div className="heading-actions">
                          <button onClick={() => task(async () => { const root = await api("choose", "skillSearchRoot"); if (root) { setExtraSkillRoot(root); setLocalReport(await api("localSkills", root)); } })}><FolderOpen size={16} />选择目录</button>
                          <button onClick={() => task(async () => { setExtraSkillRoot(null); setLocalReport(await api("localSkills")); })}><RotateCw size={16} />扫描本机</button>
                        </div></div>
                        <DiscoveredSkills report={localReport} catalog={catalog} onInspect={skill => task(() => inspectDiscovered(skill))} />
                      </>}
                      {provider === "github-import" && <>
                        <form className="search large" onSubmit={e => { e.preventDefault(); task(() => inspectGithub()); }}>
                          <Link2 size={18} /><input required type="url" aria-label="GitHub 仓库地址" placeholder="https://github.com/作者/仓库，或技能目录链接" value={githubUrl} onChange={e => setGithubUrl(e.target.value)} />
                          <button className="primary">读取仓库</button>
                        </form>
                        <p className="muted">解析技能、文件和依赖声明，不执行代码，不自动拆分仓库。</p>
                        {!!initial?.repositories?.length && !githubReport && <div className="recent-repositories"><small>最近查看</small>{initial.repositories.map(url => <button key={url} onClick={() => task(() => inspectGithub(url))}>{url.replace("https://github.com/", "")}<ChevronRight size={14} /></button>)}</div>}
                        {githubReport && <><p className="path-line">{githubReport.repository} · {githubReport.commit.slice(0, 8)}</p>
                          <details><summary>仓库结构与配套声明</summary><p className="muted">这些是解析线索；不表示每个技能都依赖它们。</p>
                            {githubReport.repositoryDependencies?.map(d => <p key={d.file}>{d.file} · {d.kind}</p>)}
                            <pre className="repository-tree">{githubReport.repositoryFiles?.slice(0, 120).join("\n")}{githubReport.repositoryFiles?.length > 120 ? "\n… 其余文件请在仓库查看" : ""}</pre>
                          </details>
                          <DiscoveredSkills report={githubReport} catalog={catalog} onInspect={skill => task(() => inspectDiscovered(skill))} empty="这个仓库没有可直接识别的技能" /></>}
                      </>}
                      {["dsh", "github"].includes(provider) && (marketError ? (
                        <Empty icon={AlertCircle} title="暂时无法连接来源">
                          <p>{marketError}</p>
                          <button onClick={() => task(searchMarket)}>
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
                                {item.kind === "repository" && <button onClick={() => task(() => inspectGithub(item.url))}><Download size={15} />选择技能</button>}
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
                            onClick={() => task(searchMarket)}
                          >
                            浏览{provider === "dsh" ? "插件" : "项目"}
                          </button>
                          <small>浏览不会自动安装软件。</small>
                        </div>
                      ))}
                    </>
                  )}
                  {page === "agents" && (
                    <>
                      <div className="page-heading">
                        <div>
                          <h1>Agent 配置</h1>
                          <p>选择模式，明确应用的位置。</p>
                        </div>
                        <button disabled={busy} onClick={() => task(async () => setNative(await api("native")))}><RotateCw size={16} />重新检测</button>
                      </div>
                      <div className="agent-grid">
                        {native?.hosts.map((host) => (
                          <article className="agent-card" key={host.id}>
                            <div className="agent-card-title">
                              <span className={`host-symbol ${host.id}`}>
                                {host.name[0]}
                              </span>
                              <h2>{host.name}</h2>
                              <Tag tone={host.configured ? "green" : ""}>
                                {host.configured ? "已找到配置" : host.directoryFound ? "只有目录" : "未找到配置"}
                              </Tag>
                            </div>
                            <small className="native-location" title={host.directory}>{host.directory}</small>
                            <div className="agent-meta">
                              <span>可用范围</span>
                              <b>
                                {host.scopes.length
                                  ? host.scopes
                                      .map((s) =>
                                        s === "project"
                                          ? "所选项目"
                                          : s === "user" ? "当前用户" : "独立预设",
                                      )
                                      .join("、")
                                  : "尚未接入"}
                              </b>
                            </div>
                            {host.userMode && <div className="agent-meta"><span>默认工作模式</span><b>{host.userMode.mode}</b></div>}
                            <div className="agent-meta">
                              <span>本机 MCP 声明</span>
                              <b>{host.connections?.length ?? "未检测"}</b>
                            </div>
                            {host.connections?.length > 0 && (
                              <div className="connection-tags">
                                {host.connections.map((name) => (
                                  <Tag key={name}>{name}</Tag>
                                ))}
                              </div>
                            )}
                            <button
                              disabled={!catalog?.modes.length || !host.scopes.length}
                              onClick={() =>
                                setModal({ kind: "connect", host: host.id })
                              }
                            >
                              {host.scopes.length ? "配置工作模式" : "暂不支持应用模式"}
                              <ChevronRight size={15} />
                            </button>
                            {host.userMode?.workspace === workspace && catalog.modes.some(m => m.id === host.userMode.mode) && <div className="agent-tools"><button onClick={() => setModal({ kind: "connect", host: host.id, scope: "user", modeId: host.userMode.mode })}>同步 / 停用</button><button onClick={() => setModal({ kind: "setup", values: { workspace, mode: host.userMode.mode, host: host.id, scope: "user", ...(host.userMode.skillsDir !== host.skillRoot && { skillsDir: host.userMode.skillsDir }) } })}>检查配置</button></div>}
                          </article>
                        ))}
                      </div>
                      {native?.targets?.length > 0 && (
                        <section className="configured-projects">
                          <h2>配置过的项目</h2>
                          <div className="list-surface">
                            {native.targets.map((target) => (
                              <div
                                className="project-row"
                                key={`${target.host}:${target.project}`}
                              >
                                <FolderOpen size={18} />
                                <span>
                                  <strong>{baseName(target.project)}</strong>
                                  <small>{target.project}</small>
                                </span>
                                <Tag>
                                  {native.hosts.find(h => h.id === target.host)?.name || target.host}{" "}
                                  · 项目级
                                </Tag>
                              </div>
                            ))}
                          </div>
                        </section>
                      )}
                    </>
                  )}
                </>
              )}
            </main>
            {selected && catalog && (
              <SkillDetails
                skill={selected}
                readOnly={readOnly}
                texts={texts}
                modes={catalog.modes}
                onClose={() => {
                  setSelected(null);
                  detailRequest.current++;
                }}
                onEdit={() =>
                  setModal({ kind: "skill-editor", item: selected, texts })
                }
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
        {modal?.kind === "mode-editor" && (
          <ModeEditor
            item={modal.item}
            allSkills={catalog.skills}
            onSave={(request) => task(() => editContent(request))}
            onClose={() => setModal(null)}
          />
        )}
        {modal?.kind === "skill-editor" && (
          <SkillEditor
            item={modal.item}
            texts={modal.texts}
            onSave={(request) => task(() => editContent(request))}
            onClose={() => setModal(null)}
          />
        )}
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
            mode={catalog.modes.find(m => m.id === modal.modeId) || mode}
            modes={catalog.modes}
            workspace={workspace}
            initialHost={modal.host}
            initialScope={modal.scope}
            initialProject={modal.project}
            task={task}
            onClose={() => setModal(null)}
            onApplied={(text, values) => { setMessage({ text }); api("native").then(setNative).catch(() => {}); if (values) setModal({ kind: "setup", values, resultMessage: text }); }}
          />
        )}
        {modal?.kind === "categories" && <CategoryEditor mode={mode} skills={modeSkills} onClose={() => setModal(null)} onSave={request => task(() => editContent(request))} />}
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
            {modal.skill.inspection?.status === "package-ready" && <button className="primary" disabled={!catalog || readOnly} onClick={() => adoptSkill(modal.skill)}>选择模式并添加</button>}
          </div>
        </Dialog>}
        {modal?.kind === "setup" && <SetupDialog values={modal.values} resultMessage={modal.resultMessage} title={catalog.modes.find(m => m.id === modal.values.mode)?.title || modal.values.mode} task={task} onClose={() => setModal(null)} />}
        {modal?.kind === "add-to-mode" && (
          <Dialog title="加入工作模式" onClose={() => setModal(null)}>
            <div className="library-list">
              {catalog.modes.map((m) => (
                <button
                  key={m.id}
                  disabled={m.skills.includes(selected.id)}
                  onClick={() =>
                    task(() =>
                      editContent({
                        operation: "mode.save",
                        id: m.id,
                        expected: m.fingerprint,
                        document: m.document,
                        skills: [...m.roots, selected.id],
                      }),
                    )
                  }
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
          </Dialog>
        )}
        {modal?.kind === "local-import" && (
          <Dialog title="导入完整技能" onClose={() => setModal(null)}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                task(() =>
                  editContent({
                    operation: "skill.import",
                    source: modal.source,
                    id: modal.id,
                    ...(modal.origin ? { sourceOrigin: modal.origin } : {}),
                    ...(modal.category ? { category: modal.category } : {}),
                    ...(modal.mode ? { mode: modal.mode } : {}),
                    ...(catalog.skills.some((s) => s.id === modal.id)
                      ? {
                          expected: catalog.skills.find(
                            (s) => s.id === modal.id,
                          ).fingerprint,
                        }
                      : {}),
                  }),
                );
              }}
            >
              <Field label="技能标识">
                <input
                  required
                  readOnly
                  value={modal.id}
                  onChange={(e) => setModal({ ...modal, id: e.target.value })}
                />
              </Field>
              <Field label="加入模式">
                <select
                  value={modal.mode}
                  onChange={(e) => setModal({ ...modal, mode: e.target.value, category: "" })}
                >
                  <option value="">暂不加入</option>
                  {catalog.modes.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </Field>
              {!!catalog.modes.find(m => m.id === modal.mode)?.capabilities?.length && <Field label="能力类别">
                <select value={modal.category} onChange={e => setModal({ ...modal, category: e.target.value })}>
                  <option value="">未分类</option>{catalog.modes.find(m => m.id === modal.mode).capabilities.map(g => <option key={g.title} value={g.title}>{g.title}</option>)}
                </select>
              </Field>}
              {catalog.skills.some(s => s.id === modal.id) && <p role="alert">库中已有同名技能。继续会预览替换，所有引用它的模式都会受影响。</p>}
              <p className="path-line">{modal.origin || modal.source}</p>
              <div className="dialog-actions">
                <button type="button" onClick={() => setModal(null)}>
                  取消
                </button>
                <button className="primary">检查内容</button>
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
          <Dialog title="确认导入" onClose={() => setModal(null)}>
            <div className="review-list">
              {Object.entries(modal.report.actions).map(([id, action]) => (
                <div key={id}>
                  <span>{id}</span>
                  <Tag tone={action === "conflict" ? "amber" : ""}>
                    {
                      {
                        add: "新增",
                        unchanged: "已存在",
                        conflict: "有本地差异",
                        replace: "替换",
                      }[action]
                    }
                  </Tag>
                </div>
              ))}
            </div>
            {modal.report.conflicts.length > 0 && (
              <p className="inline-note">继续将替换以上同名差异内容。</p>
            )}
            <div className="dialog-actions">
              <button onClick={() => setModal(null)}>取消</button>
              <button
                className="primary"
                onClick={() =>
                  task(async () => {
                    const result = await api("run", "import", {
                      source: modal.source,
                      target: modal.target,
                      replace: modal.report.conflicts.length > 0,
                      apply: true,
                    });
                    if (!result.canceled) {
                      const target = modal.target;
                      setModal(null);
                      await load(target);
                      setMessage({ text: "模式已导入。" });
                    }
                  })
                }
              >
                确认导入
              </button>
            </div>
          </Dialog>
        )}
      </div>
    </NoticeContext.Provider>
  );
}
