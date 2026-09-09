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
      onCancel={(e) => {
        e.preventDefault();
        onClose();
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

function CapabilityMap({ mode, skills, onSkill }) {
  const [expanded, setExpanded] = useState(new Set());
  const [relations, setRelations] = useState(false);
  useEffect(() => {
    setExpanded(new Set());
    setRelations(false);
  }, [mode.id]);
  const groups = capabilityGroups(skills);
  return (
    <>
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
        <span>按用途分组 · 不代表执行顺序</span>
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
          onSave({
            operation: "mode.save",
            id,
            document: `# ${name.trim()}\n\n${body}`,
            skills: [...roots],
            ...(item?.fingerprint ? { expected: item.fingerprint } : {}),
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
          <button onClick={onAdd}>
            <Plus size={15} />
            加入模式
          </button>
          <IconButton
            icon={Pencil}
            label="编辑技能"
            disabled={!texts}
            onClick={onEdit}
          />
          <IconButton icon={Archive} label="归档技能" onClick={onArchive} />
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
                    {onRemove && (
                      <IconButton
                        icon={X}
                        label={`从 ${id} 移出`}
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

function ConnectDialog({
  mode: initialMode,
  modes,
  workspace,
  onClose,
  task,
  onApplied,
  initialHost = "codex-app",
}) {
  const [modeId, setModeId] = useState(initialMode.id);
  const mode = modes.find((item) => item.id === modeId) || initialMode;
  const [native, setNative] = useState(null);
  const [host, setHost] = useState(initialHost);
  const [project, setProject] = useState("");
  const [preset, setPreset] = useState("");
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
            onClick={() => {
              setHost(h.id);
              setProject("");
            }}
            className={host === h.id ? "selected" : ""}
          >
            <span className={`host-symbol ${h.id}`}>{h.name[0]}</span>
            <strong>{h.name}</strong>
            {host === h.id && <Check size={16} />}
          </button>
        ))}
      </div>
      {host === "workbuddy" ? (
        <div className="inline-note">
          <AlertCircle size={17} />
          <span>WorkBuddy 尚未接入自动配置。可导出 Mode 包查看完整技能。</span>
        </div>
      ) : (
        <>
          <div className="field-heading">
            <b>在哪里使用</b>
          </div>
          <div className="scope-option selected">
            <Check size={17} />
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
          </div>
          {host !== "deepseek-harness" && (
            <div className="scope-option disabled">
              <Circle size={17} />
              <div>
                <strong>我的所有项目</strong>
                <small>用户级应用尚未接通</small>
              </div>
            </div>
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
          ) : (
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
          )}
          <div className="apply-summary">
            <Layers3 size={18} />
            <span>
              {mode.title}
              <small>
                {mode.skills.length} 个技能 · {selected?.name}
              </small>
            </span>
          </div>
          <div className="dialog-actions">
            <button onClick={onClose}>取消</button>
            <button
              className="primary"
              disabled={host === "deepseek-harness" ? !preset : !project}
              onClick={() =>
                task(async () => {
                  let result;
                  if (host === "deepseek-harness") {
                    const output = await api("choose", "newPreset");
                    if (!output) return;
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
                    onApplied(`${selected.name} 已配置。在新会话中使用。`);
                    onClose();
                  }
                })
              }
            >
              应用模式
              <ArrowUpRight size={16} />
            </button>
          </div>
        </>
      )}
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
  const [provider, setProvider] = useState("dsh");
  const [marketQuery, setMarketQuery] = useState("");
  const [market, setMarket] = useState(null);
  const [marketError, setMarketError] = useState("");
  const gate = useRef(false);
  const detailRequest = useRef(0);
  async function task(action) {
    if (gate.current) return;
    gate.current = true;
    setBusy(true);
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
  }, [page]);
  const mode = catalog?.modes.find((m) => m.id === modeId);
  const modeSkills = useMemo(
    () =>
      mode
        ? mode.skills.map((id) => catalog.skills.find((s) => s.id === id))
        : [],
    [mode, catalog],
  );
  const groups = useMemo(() => capabilityGroups(modeSkills), [modeSkills]);
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
    setModal({
      kind: "local-import",
      source,
      id: baseName(source),
      mode: mode?.id || "",
    });
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
    <NoticeContext.Provider value={message}>
      <div className="app">
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
              disabled={!catalog}
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
                <Tag tone="amber">内置示例</Tag>
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
                            onClick={() =>
                              setModal({ kind: "mode-editor", item: mode })
                            }
                          />
                          <IconButton
                            icon={Archive}
                            label="归档模式"
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
                          />
                        </>
                      ) : (
                        <div className="mode-skill-list">
                          {groups.map((group) => (
                            <section key={group.id}>
                              <div className="field-heading">
                                <h3>{group.title}</h3>
                                <Tag>{group.skills.length}</Tag>
                              </div>
                              <div className="list-surface">
                                {group.skills.map((skill) => (
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
                            </section>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {page === "skills" && catalog && (
                    <>
                      <div className="page-heading">
                        <div>
                          <h1>全部技能</h1>
                          <p>{catalog.skills.length} 个本地技能</p>
                        </div>
                        <div className="heading-actions">
                          <button onClick={() => task(importSkill)}>
                            <Download size={16} />
                            导入
                          </button>
                          <button
                            className="primary"
                            onClick={() => setModal({ kind: "skill-editor" })}
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
                          <button onClick={() => task(importSkill)}>
                            <FolderOpen size={16} />
                            从文件夹导入
                          </button>
                        )}
                      </div>
                      <div className="market-search">
                        <div className="tabs">
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
                        <form
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
                        </form>
                      </div>
                      {marketError ? (
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
                      )}
                    </>
                  )}
                  {page === "agents" && (
                    <>
                      <div className="page-heading">
                        <div>
                          <h1>Agent 配置</h1>
                          <p>选择模式，明确应用的位置。</p>
                        </div>
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
                                {host.configured ? "已找到配置" : "未找到配置"}
                              </Tag>
                            </div>
                            <div className="agent-meta">
                              <span>可用范围</span>
                              <b>
                                {host.scopes.length
                                  ? host.scopes
                                      .map((s) =>
                                        s === "project"
                                          ? "所选项目"
                                          : "独立预设",
                                      )
                                      .join("、")
                                  : "尚未接入"}
                              </b>
                            </div>
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
                              disabled={!catalog || !host.scopes.length}
                              onClick={() =>
                                setModal({ kind: "connect", host: host.id })
                              }
                            >
                              配置工作模式
                              <ChevronRight size={15} />
                            </button>
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
                                  {target.host === "codex-app"
                                    ? "Codex"
                                    : "Claude Code"}{" "}
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
            mode={mode}
            modes={catalog.modes}
            workspace={workspace}
            initialHost={modal.host}
            task={task}
            onClose={() => setModal(null)}
            onApplied={(text) => setMessage({ text })}
          />
        )}
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
                  value={modal.id}
                  onChange={(e) => setModal({ ...modal, id: e.target.value })}
                />
              </Field>
              <Field label="加入模式">
                <select
                  value={modal.mode}
                  onChange={(e) => setModal({ ...modal, mode: e.target.value })}
                >
                  <option value="">暂不加入</option>
                  {catalog.modes.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="path-line">{modal.source}</p>
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
              {workspace && (
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
