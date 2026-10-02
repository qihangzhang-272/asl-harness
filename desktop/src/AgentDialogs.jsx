import React,{useEffect,useState} from 'react';
import {SlidersHorizontal,FolderOpen,LoaderCircle,AlertCircle,Check,RotateCw,Copy,ArrowUpRight,Circle} from 'lucide-react';
import EditorPage from './EditorPage.jsx';
const baseName = (value) => (value || "").split(/[\\/]/).filter(Boolean).pop();
const AGENT_CHOICES = [
  {id:'codex-app',name:'Codex',scopes:['project','user']},
  {id:'claude-code',name:'Claude Code',scopes:['project','user']},
  {id:'deepseek-harness',name:'DeepSeek Harness',scopes:['preset']},
  {id:'workbuddy',name:'WorkBuddy',scopes:['project']},
];

export function SetupDialog({ api, Dialog, Tag, values, title, onClose, task, resultMessage }) {
  const [report, setReport] = useState(null);
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
      await Promise.all([check(), ["codex-app","claude-code"].includes(values.host) ? api("native").then(native=>{
        setAssistant(native.assistants.find(a => a.available && a.id === values.host)?.id || "");
      }).catch(()=>{}) : Promise.resolve()]);
    });
  }, []);
  const labels = { found: "已找到", configured: "有配置 · 待实测", missing: "待安装 / 连接", unknown: "需检查", ok: "渠道体检通过", warn: "需处理", off: "未连接", error: "检查异常" };
  return <Dialog title="运行检查" onClose={onClose}>
    {resultMessage && <p role="status" className="inline-note">{resultMessage}</p>}
    <div className="apply-summary"><SlidersHorizontal size={19} /><span>{title}<small>{{"codex-app": "Codex", "claude-code": "Claude Code", "deepseek-harness": "DeepSeek Harness", workbuddy: "WorkBuddy"}[values.host]} · {values.scope === "user" ? "当前用户" : values.scope === "preset" ? "工作模式" : "所选项目"}</small></span></div>
    {report ? <>
      {report.nativeDiscoveryUnverified && <div className="inline-note"><FolderOpen size={18} /><span>所选目录还需与 Agent 关联<small>{report.chosenSkillsDirectory}</small></span></div>}
      <div className="setup-checks">
        {report.checks.map(item => <div className="sync-item" key={`${item.kind}:${item.name}`}><span><strong>{item.name}</strong><small>{item.kind === "mcp" ? "MCP" : item.kind === "binary" ? "本机工具" : "登录 / 环境变量"}</small></span><Tag tone={["missing", "unknown"].includes(item.status) ? "warning" : ""}>{labels[item.status]}</Tag></div>)}
        {!report.checks.length && <p>未声明额外安装项。</p>}
      </div>
      {!!report.setupNotes.length && <details className="setup-notes"><summary>技能中的运行说明</summary>{report.setupNotes.map((item, index) => <small key={index}>{item.skill}</small>)}</details>}
      {report.doctor && <div className="setup-channels"><h3>Agent Reach</h3>{report.doctor.map(item => <div className="sync-item" key={item.id}><span>{item.name}</span><Tag tone={item.status === "ok" ? "green" : "warning"}>{labels[item.status] || "需检查"}</Tag></div>)}</div>}
      {report.doctorError && <p className="error-text">{report.doctorError}</p>}
    </> : <div className="inline-note"><LoaderCircle size={18} className="spin" />正在检查本机环境…</div>}
    {session && <div className="inline-note">{session.status === "failed" ? <AlertCircle size={18} /> : <Check size={18} />}<span>{session.status === "failed" ? "未完成，请在目标 Agent 中检查连接后重试。" : session.status === "ended" ? "会话已结束，可以重新检查。" : "已打开，请在对应 Agent 中继续。"}</span></div>}
    <div className="dialog-actions"><button onClick={() => task(() => check(true))} disabled={checking}><RotateCw size={16} className={checking ? "spin" : ""} />重新检查</button><button className={!assistant?'primary':''} disabled={!report || checking} onClick={()=>task(()=>api('copyText',report.brief))}><Copy size={16}/>复制给{values.host==='deepseek-harness'?' DeepSeek':values.host==='workbuddy'?' WorkBuddy':'当前 Agent'}</button>{assistant&&<button className="primary" disabled={!report || checking} onClick={() => task(async () => { const result = await api("setup", assistant, values); if (!result.canceled) setSession(result); })}>在{assistant==='codex-app'?' Codex':' Claude Code'} 中继续<ArrowUpRight size={16} /></button>}</div>
  </Dialog>;
}

export function ConnectDialog({
  api, Field, Tag,
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
