import React,{useEffect,useRef,useState} from 'react';
import {SlidersHorizontal,FolderOpen,LoaderCircle,AlertCircle,Check,RotateCw,Copy,ArrowUpRight,Circle} from 'lucide-react';
import EditorPage from './EditorPage.jsx';
const baseName = (value) => (value || "").split(/[\\/]/).filter(Boolean).pop();
const AGENT_CHOICES = [
  {id:'codex-app',name:'Codex',scopes:['project','user']},
  {id:'claude-code',name:'Claude Code',scopes:['project','user']},
  {id:'deepseek-harness',name:'DeepSeek Harness',scopes:['preset']},
  {id:'workbuddy',name:'WorkBuddy',scopes:['project']},
];

export function SetupDialog({ api, Dialog, Tag, values, title, onClose, task, resultMessage, activation, onReadNote }) {
  const [report, setReport] = useState(null);
  const [assistant, setAssistant] = useState("");
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');
  const [copied, setCopied] = useState(false);
  const live=useRef(false);
  async function check(probe = false) {
    setChecking(true);
    setCheckError('');
    setCopied(false);
    try {
      const next=await api("run", "readiness", { ...values, probe });
      if(!live.current)return;
      setReport(next);
      if (session) {
        const status=await api("setupStatus", session.id);
        if(live.current)setSession(status);
      }
    } catch(error) { if(live.current){setReport(null);setCheckError(JSON.stringify({message:error.diagnostic||error.message,code:error.code,details:error.details},null,2));} }
    finally { if(live.current)setChecking(false); }
  }
  useEffect(() => {
    live.current=true;
    check();
    if(["codex-app","claude-code"].includes(values.host))api("native").then(native=>{
      if(live.current)setAssistant(native.assistants.find(a => a.available && a.id === values.host)?.id || "");
    }).catch(()=>{});
    return ()=>{live.current=false;};
  }, []);
  const labels = { found: "已找到", configured: "已配置，待试用", missing: "待安装或连接", unknown: "需检查", ok: "检查通过", warn: "需处理", off: "未连接", error: "检查异常" };
  const hostName=AGENT_CHOICES.find(item=>item.id===values.host)?.name || '当前 Agent';
  const attention=report?.checks.filter(item=>['missing','unknown','warn','off','error'].includes(item.status)).length || 0;
  return <Dialog title="运行检查" onClose={onClose}>
    {resultMessage && <p role="status" className="inline-note">{resultMessage}</p>}
    <div className="apply-summary"><SlidersHorizontal size={19} /><span>{title}<small>{hostName} · {values.scope === "user" ? "当前用户" : values.scope === "preset" ? "工作模式" : "所选项目"}</small></span></div>
    {resultMessage && <p>下一步：{values.scope === 'preset' ? '在 DeepSeek 新会话中选择此模式。' : values.scope === 'user' ? `在 ${hostName} 中开始新会话。` : `在 ${hostName} 中打开此项目并开始新会话。`}</p>}
    {(values.project || activation?.openProject || report?.userPaths) && <details className="setup-notes"><summary>配置位置</summary>
      {(values.project || activation?.openProject) && <p className="path-line">{values.project || activation.openProject}{activation?.instructionFile && <small> · {activation.instructionFile}</small>}</p>}
      {values.scope === 'user' && <p className="path-line">{values.skillsDir || report?.userPaths?.skills}<br/>{report?.userPaths?.instructions}</p>}
    </details>}
    {checkError && <><p className="error-text" role="alert">检查未完成，请重试。</p><details className="setup-notes"><summary>查看详情</summary><pre>{checkError}</pre></details></>}
    {report ? <>
      <p role="status">{attention ? `${attention} 项需要处理` : report.setupNotes.length ? '请核对技能中的运行说明。' : '已核对安装项，仍需实际试用。'}</p>
      {report.nativeDiscoveryUnverified && <div className="inline-note"><FolderOpen size={18} /><span>所选目录还需与 {hostName} 关联。</span></div>}
      {report.hooks && <details className="setup-notes">
        <summary>自动检查 · {report.hooks.coverage === 'none' ? '未覆盖' : report.hooks.commandFound ? '尚未实测' : '待配置'}</summary>
        {report.hooks.coverage === 'none' ? <p>{values.host === 'workbuddy' ? '此 Agent 尚未接入自动检查，可按需使用 CLI 手动核对。' : '当前用户默认模式不在项目 Hook 覆盖范围内；可为具体项目配置模式后再检查。'}</p> : <>
          <p>适用范围：{report.hooks.coverage === 'preset' ? '此 DeepSeek 工作模式' : '所选项目'}。{report.hooks.commandFound ? '已找到检查命令；原生 Hook 是否启用及真实触发尚未核实。' : '未找到检查命令，请在目标 Agent 中补齐 Harness CLI 后再检查。'}</p>
          <p>{values.scope === 'preset' ? '工作模式已包含自动检查设置，仍需在 DeepSeek 中加载并验证。' : '请在目标 Agent 中启用 ASL Environment Host 插件，再用新会话验证。'}缺少 Hook 不影响已配置模式的使用。</p>
          <p className="path-line">检查命令：{report.hooks.commandPath || report.hooks.command}</p>
        </>}
      </details>}
      {!!report.checks.length && <details className="setup-notes"><summary>检查项 · {report.checks.length}</summary><div className="setup-checks">
        {report.checks.map(item => <div className="sync-item" key={`${item.kind}:${item.name}`}><span><strong>{item.name}</strong><small>{item.kind === "mcp" ? "MCP" : item.kind === "binary" ? "本机工具" : "登录 / 环境变量"}{item.skills?.length ? ` · ${item.skills.join('、')}` : ''}</small></span><Tag tone={["missing", "unknown"].includes(item.status) ? "warning" : ""}>{labels[item.status]}</Tag></div>)}
      </div></details>}
      {!!report.setupNotes.length && <details className="setup-notes"><summary>技能中的运行说明</summary>{report.setupNotes.map((item, index) => <p className="path-line" key={index}><button className="plain-title" disabled={!onReadNote} onClick={()=>onReadNote({skill:item.skill,path:item.path})}>{item.skill} · {baseName(item.path)}<ArrowUpRight size={14}/></button><br/>{item.path}</p>)}</details>}
      {report.doctor && <details className="setup-notes"><summary>联网工具 · {report.doctor.filter(item=>item.status!=='ok').length ? '需检查' : '已检查'}</summary><div className="setup-channels"><h3>Agent Reach</h3>{report.doctor.map(item => <div className="sync-item" key={item.id}><span>{item.name}</span><Tag tone={item.status === "ok" ? "green" : "warning"}>{labels[item.status] || "需检查"}</Tag></div>)}</div></details>}
      {report.doctorError && <><p className="error-text" role="alert">联网工具检查未完成，请重试。</p><details className="setup-notes"><summary>查看详情</summary><pre>{report.doctorError}</pre></details></>}
    </> : !checkError && <div className="inline-note"><LoaderCircle size={18} className="spin" />正在检查本机环境…</div>}
    {session && <div className="inline-note">{session.status === "failed" ? <AlertCircle size={18} /> : <Check size={18} />}<span>{session.status === "failed" ? "未完成，请在目标 Agent 中检查连接后重试。" : session.status === "ended" ? "会话已结束，可以重新检查。" : "已打开，请在对应 Agent 中继续。"}</span></div>}
    {copied && <p role="status">已复制。在 {hostName} 新会话中粘贴并发送。</p>}
    <div className="dialog-actions"><button onClick={() => task(() => check(true))} disabled={checking}><RotateCw size={16} className={checking ? "spin" : ""} />重新检查</button><button className={!assistant?'primary':''} disabled={!report || checking} onClick={()=>task(async()=>{await api('copyText',report.brief);setCopied(true);})}><Copy size={16}/>复制给 {hostName}</button>{assistant&&<button className="primary" disabled={!report || checking} onClick={() => task(async () => { const result = await api("setup", assistant, values); if (!result.canceled) {setCopied(false);setSession(result);} })}>在 {hostName} 中继续<ArrowUpRight size={16} /></button>}</div>
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
      {locationError && <><p className="error-text" role="alert">未能读取配置位置。<button onClick={()=>api('nativeLocations').then(value=>{setNative(value);setLocationError('');}).catch(error=>setLocationError(error.message))}>重试</button></p><details><summary>查看详情</summary><pre>{locationError}</pre></details></>}
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
          : <details className="user-location"><summary>保存位置</summary><p className="path-line">{skillsDir || selected?.skillRoot || '正在读取位置…'}</p><button onClick={() => task(async () => { const folder = await api("choose", "userSkills"); if (folder) setSkillsDir(folder); })}><FolderOpen size={15} />更换技能目录</button>{skillsDir && <button onClick={() => setSkillsDir("")}>恢复标准目录</button>}</details>}
          {preview && <div className="sync-preview">
            <h3>将要更改</h3>
            {preview.previousMode && <small>原默认模式：{preview.previousMode}</small>}
            {preview.items.filter(item => item.action !== "unchanged").map(item => <div className="sync-item" key={item.skill}>
              <span>{item.skill}</span><Tag tone={item.action === "conflict" ? "warning" : ""}>{({add:"加入",update:"更新",remove:"移出",conflict:"需处理同名内容"})[item.action]}</Tag>
            </div>)}
            {!preview.needsSync && <p>内容已是最新。</p>}
            {preview.conflicts.map(text => <p className="error-text" key={text}>{text}</p>)}
            <small>只更新此 Agent 的副本，原技能库保留。</small>
          </div>}
          <div className="dialog-actions">
            {scope === "user" && native?.hosts.find(h => h.id === host)?.userMode?.mode === mode.id ? <button onClick={() => task(async () => {
              const plan = await api("run", "userSync", { workspace, mode: mode.id, host, remove: true, ...(skillsDir && { skillsDir }) });
              const result = await api("run", "userSync", { workspace, mode: mode.id, host, remove: true, expected: plan.fingerprint, apply: true, ...(skillsDir && { skillsDir }) });
              if (!result.canceled) { onClose(); onApplied("已停用默认模式，原技能库保留。",{host}); }
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
                    onApplied(status, { workspace, mode: mode.id, host, scope: host === "deepseek-harness" ? "preset" : scope, ...(target && { project: target }), ...(scope === "user" && skillsDir && { skillsDir }) }, result);
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
