const $ = (id) => document.getElementById(id);
let environment = null;
let catalog = null;
let modeId = null;
let working = false;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(text, action, className = "outline") {
  const node = element("button", text, className);
  node.addEventListener("click", () => task(action));
  return node;
}
async function api(method, ...args) {
  const response = await window.asl[method](...args);
  if (!response.ok) throw new Error(response.error);
  return response.value;
}
function notice(text, error = false) {
  $("notice").textContent = text;
  $("notice").classList.toggle("error", error);
  $("notice").hidden = !text;
}
async function task(action) {
  if (working) return;
  working = true;
  document.body.classList.add("loading");
  notice("正在处理本地工作环境…");
  try {
    await action();
  } catch (error) {
    notice(error.message, true);
  } finally {
    working = false;
    document.body.classList.remove("loading");
  }
}
function modal(title, nodes, actions = []) {
  $("modal-title").textContent = title;
  $("modal-body").replaceChildren(...nodes);
  $("modal-actions").replaceChildren(...actions);
  if (!$("modal").open) $("modal").showModal();
  notice("");
}
function list(items) {
  const node = element("ul", undefined, "review-list");
  for (const [label, value] of items) {
    const row = element("li");
    row.append(element("span", label), element("small", String(value)));
    node.append(row);
  }
  return node;
}
function detail(title, text) {
  const node = element("details");
  node.append(element("summary", title), element("pre", text));
  return node;
}

async function load(workspace) {
  const result = await api("run", "describe", { workspace });
  environment = workspace;
  catalog = result;
  if (!result.modes.some((mode) => mode.id === modeId))
    modeId = result.modes[0]?.id;
  $("welcome").hidden = true;
  $("workspace").hidden = false;
  $("refresh").disabled = false;
  $("environment-name").textContent = result.environmentId;
  $("environment-path").textContent = workspace;
  $("environment-path").title = workspace;
  $("view-status").textContent = result.workspaceViewCurrent
    ? "能力视图已同步"
    : "能力视图可刷新 · 不影响查看";
  $("mode-count").textContent = result.modes.length;
  renderMode();
  notice("");
}
function renderMode() {
  $("modes").replaceChildren(
    ...catalog.modes.map((mode) => {
      const node = button(
        mode.id,
        async () => {
          modeId = mode.id;
          renderMode();
          notice("");
        },
        `mode${mode.id === modeId ? " active" : ""}`,
      );
      node.append(element("span", `${mode.skills.length} 项能力`));
      return node;
    }),
  );
  const mode = catalog.modes.find((item) => item.id === modeId);
  $("mode-title").textContent = mode.id;
  const document = mode.document || "";
  $("mode-description").textContent =
    document.split("\n").find((line) => line.trim() && !line.startsWith("#")) ||
    "一组围绕长期工作组织的能力。由你决定范围，由 Agent 按任务选用。";
  $("boundary").textContent =
    document || "当前核心没有返回 Mode 说明。请查看本地 MODE.md。";
  $("skill-count").textContent = mode.skills.length;
  $("skills").replaceChildren(
    ...mode.skills.map((id) => {
      const skill = catalog.skills.find((item) => item.id === id);
      const card = button("", () => readSkill(id), "skill");
      const title = element("div", undefined, "skill-top");
      title.append(element("span", "◇", "skill-icon"), element("span", id));
      const foot = element("div", undefined, "skill-foot");
      foot.append(
        element(
          "span",
          skill.requires.length
            ? `依赖 ${skill.requires.join(" · ")}`
            : "可独立调用",
        ),
        element("span", "用法与来源 ↗"),
      );
      card.append(title, element("p", skill.description), foot);
      return card;
    }),
  );
}
async function readSkill(id) {
  const texts = await api("readSkill", environment, id);
  modal(id, [
    element("p", "这里直接读取本地文件，不另存一份内容。", "explain"),
    element("pre", texts["SKILL.md"]),
    detail("查看来源记录", texts["SOURCE.md"]),
  ]);
}
async function openEnvironment() {
  const path = await api("choose", "environment");
  if (path) await load(path);
  else notice("");
}
async function exportMode() {
  const checkbox = element("input");
  checkbox.type = "checkbox";
  checkbox.id = "include-profile";
  const label = element("label", "一并分享我的 PROFILE（个人长期偏好）");
  label.htmlFor = checkbox.id;
  const field = element("div", undefined, "field");
  field.append(checkbox, label);
  modal(
    `分享 ${modeId}`,
    [
      element(
        "p",
        "分享当前 Mode 与它实际使用的完整技能。不会带走其他 Mode、任务、缓存或登录账号。",
        "explain",
      ),
      field,
    ],
    [
      button(
        "选择保存位置并预览",
        async () => {
          const output = await api("choose", "export");
          if (!output) {
            notice("");
            return;
          }
          const values = {
            workspace: environment,
            mode: modeId,
            output,
            includeProfile: checkbox.checked,
          };
          const review = await api("run", "export", values);
          const nodes = [
            list([
              ["将分享", `${review.files.length} 个文件`],
              ["个人偏好", review.includedProfile ? "包含 PROFILE" : "不包含"],
              ["保存到", output],
            ]),
            detail("查看完整文件清单", review.files.join("\n")),
          ];
          if (review.localReferences.length)
            nodes.push(
              element(
                "p",
                `以下文件有本机路径，换电脑后可能要调整：${review.localReferences.join("、")}`,
                "warning",
              ),
            );
          nodes.push(
            element(
              "p",
              "秘密检测不能替代内容检查。包只传递能力，不替接收方安装依赖或登录。",
              "explain",
            ),
          );
          modal("确认这次分享的范围", nodes, [
            button(
              "导出环境包",
              async () => {
                const result = await api("run", "export", {
                  ...values,
                  apply: true,
                });
                if (!result.canceled) {
                  $("modal").close();
                  notice(`已导出 ${modeId}。环境包保存在：${output}`);
                } else notice("已取消，未导出。");
              },
              "primary",
            ),
          ]);
        },
        "primary",
      ),
    ],
  );
}
async function importMode() {
  modal(
    "导入一种工作环境",
    [
      element(
        "p",
        "选择 ASL 导出的环境包，先查看内容，再决定装到哪里。当前版本支持 ASL 快照；任意第三方插件的自动采用仍在开发。",
        "explain",
      ),
    ],
    [
      button("选择目录包", () => pickImport("packageFolder")),
      button("选择 ZIP 包", () => pickImport("package"), "primary"),
    ],
  );
}
async function pickImport(kind) {
  const source = await api("choose", kind);
  if (!source) {
    notice("");
    return;
  }
  const report = await api("run", "inspect", { source });
  const showTarget = async (target) => {
    const preview = await api("run", "import", { source, target });
    const labels = {
      add: "新增",
      unchanged: "保留相同内容",
      conflict: "同名内容不同",
      replace: "替换",
    };
    const nodes = [
      element("p", `导入到 ${target}`, "path"),
      list(
        Object.entries(preview.actions).map(([name, action]) => [
          name,
          labels[action],
        ]),
      ),
    ];
    if (preview.conflicts.length)
      nodes.push(
        element(
          "p",
          `有 ${preview.conflicts.length} 处冲突。替换会影响：${preview.affectedModes.join("、") || report.mode}。自己的 PROFILE 不会被覆盖。`,
          "warning",
        ),
      );
    nodes.push(
      element(
        "p",
        "本次只写入本地内容。MCP、插件和模型账号不会自动启动或安装。",
        "explain",
      ),
    );
    modal("检查将发生的变化", nodes, [
      button(
        preview.conflicts.length ? "明确替换冲突并导入" : "确认导入",
        async () => {
          const result = await api("run", "import", {
            source,
            target,
            replace: preview.conflicts.length > 0,
            apply: true,
          });
          if (result.canceled) {
            notice("已取消，未导入。");
            return;
          }
          $("modal").close();
          modeId = report.mode;
          await load(target);
          notice(`已导入 ${report.mode}。内容已就位，运行依赖还未检测。`);
        },
        "primary",
      ),
    ]);
  };
  const actions = [
    button(
      "新建一个独立环境",
      async () => {
        const target = await api("choose", "newEnvironment");
        if (target) await showTarget(target);
        else notice("");
      },
      "primary",
    ),
  ];
  if (environment)
    actions.unshift(button("加入当前环境", () => showTarget(environment)));
  const nodes = [
    list([
      ["工作模式", report.mode],
      ["完整技能", report.skills.join(" · ")],
      [
        "个人偏好",
        report.includedProfile ? "包中包含；不覆盖你的现有偏好" : "不包含",
      ],
    ]),
  ];
  if (report.dependencyFiles.length)
    nodes.push(detail("包内已有的依赖说明", report.dependencyFiles.join("\n")));
  for (const item of report.dependencyDetails || []) {
    const section = element("section");
    section.append(element("h2", item.kind), element("p", item.file, "path"));
    if (item.requirements.length)
      section.append(
        list(
          item.requirements
            .slice(0, 40)
            .map((name) => [name, "包中声明，未检测安装状态"]),
        ),
      );
    if (item.requirements.length > 40)
      section.append(
        element(
          "p",
          `另外 ${item.requirements.length - 40} 项请在原始依赖文件中查看。`,
          "explain",
        ),
      );
    if (item.environmentVariables.length)
      section.append(
        element(
          "p",
          `需要配置的环境变量：${item.environmentVariables.join("、")}。只显示名称，不读取本机值。`,
          "explain",
        ),
      );
    if (item.setupScripts.length)
      section.append(
        element(
          "p",
          `包内有准备脚本：${item.setupScripts.join("、")}。本次导入不会执行。`,
          "warning",
        ),
      );
    if (item.parseWarning)
      section.append(element("p", item.parseWarning, "warning"));
    nodes.push(section);
  }
  if (report.localReferences.length)
    nodes.push(
      element(
        "p",
        `部分文件引用了本机路径，迁移后需调整：${report.localReferences.join("、")}`,
        "warning",
      ),
    );
  modal("把这个 Mode 放在哪里？", nodes, actions);
}
async function connectMode() {
  const select = element("select");
  for (const [id, name] of [
    ["codex-app", "Codex App"],
    ["claude-code", "Claude Code"],
    ["deepseek-harness", "DeepSeek Harness Preset"],
  ]) {
    const option = element("option", name);
    option.value = id;
    select.append(option);
  }
  const field = element("div", undefined, "field");
  field.append(element("label", "目标 Agent"), select);
  modal(
    `应用 ${modeId}`,
    [
      field,
      element(
        "p",
        "只应用当前 Mode 的能力。不会改模型账号，也不会强行切换正在运行的旧会话。应用后在目标工具中打开项目或选择新 Preset。",
        "explain",
      ),
    ],
    [
      button(
        "选择位置并应用",
        async () => {
          let result;
          if (select.value === "deepseek-harness") {
            const basePreset = await api("choose", "basePreset");
            if (!basePreset) {
              notice("");
              return;
            }
            const output = await api("choose", "newPreset");
            if (!output) {
              notice("");
              return;
            }
            result = await api("run", "preset", {
              workspace: environment,
              mode: modeId,
              basePreset,
              output,
            });
          } else {
            const project = await api("choose", "project");
            if (!project) {
              notice("");
              return;
            }
            result = await api("run", "project", {
              workspace: environment,
              mode: modeId,
              project,
              host: select.value,
            });
          }
          if (result.canceled) {
            notice("已取消，未应用。");
            return;
          }
          modal("环境文件已经应用", [
            element(
              "p",
              "下一步：在目标 Agent 中打开这个项目，或选择生成的 DeepSeek Preset，开始一个新会话。",
              "explain",
            ),
            element(
              "p",
              "这代表文件已就位，不代表模型、外部服务或 Hook 已经运行。",
              "warning",
            ),
            detail("查看实际操作回执", JSON.stringify(result, null, 2)),
          ]);
        },
        "primary",
      ),
    ],
  );
}

$("open").onclick = () => task(openEnvironment);
$("welcome-open").onclick = () => task(openEnvironment);
$("welcome-import").onclick = () => task(importMode);
$("refresh").onclick = () => task(() => load(environment));
$("import").onclick = () => task(importMode);
$("export").onclick = () => task(exportMode);
$("connect").onclick = () => task(connectMode);
$("close-modal").onclick = () => $("modal").close();
for (const tab of ["capabilities", "boundary"]) {
  $(`tab-${tab}`).onclick = () => {
    for (const name of ["capabilities", "boundary"]) {
      $(`${name}-panel`).hidden = name !== tab;
      $(`tab-${name}`).classList.toggle("active", name === tab);
    }
  };
}
task(async () => {
  const initial = await api("initial");
  $("welcome-example").onclick = () => task(() => load(initial.example));
  if (initial.workspace) await load(initial.workspace);
  else notice("");
});
