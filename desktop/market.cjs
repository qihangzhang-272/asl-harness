function publicUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      ["github.com", "awesome-dsh-plugin.com", "www.npmjs.com"].includes(
        u.hostname,
      )
      ? u.href
      : null;
  } catch {
    return null;
  }
}
function parseDshCatalog(data) {
  if (!Array.isArray(data.plugins)) throw new Error("市场返回了无法识别的目录");
  return data.plugins
    .filter((p) => p && typeof p.name === "string" && publicUrl(p.url))
    .map((p) => ({
      id: p.name,
      name: p.name,
      description:
        typeof p.description === "string"
          ? p.description
          : [p.description?.zh, p.description?.en].find(
              (value) => typeof value === "string",
            ) || "",
      url: publicUrl(p.url),
      stars: typeof p.stars === "number" ? p.stars : null,
      kind: "plugin",
      compatibility: "deepseek-harness",
      package: typeof p.npm === "string" ? p.npm : null,
      deprecated: p.deprecated === true,
    }));
}
async function readJson(fetch, url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: { Accept: "application/json", "User-Agent": "ASL-Workspace" },
  });
  if (!response.ok)
    throw new Error(
      response.status === 403
        ? "来源限制了请求频率，请稍后重试"
        : `来源暂时不可用（${response.status}）`,
    );
  const body = await response.text();
  if (body.length > 8 * 1024 * 1024)
    throw new Error("目录过大，请缩小搜索范围");
  return JSON.parse(body);
}
async function discover(provider, query, fetch) {
  if (typeof query !== "string" || query.length > 160)
    throw new Error("请输入简短搜索词");
  if (provider === "dsh") {
    const entries = parseDshCatalog(
      await readJson(fetch, "https://awesome-dsh-plugin.com/plugins.json"),
    );
    const q = query.trim().toLowerCase();
    return entries
      .filter(
        (p) =>
          !p.deprecated &&
          `${p.name} ${p.description}`.toLowerCase().includes(q),
      )
      .slice(0, 100);
  }
  if (provider !== "github") throw new Error("不支持的来源");
  const q = query.trim() || "agent skills";
  const data = await readJson(
    fetch,
    `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&per_page=30`,
  );
  if (!Array.isArray(data.items)) throw new Error("GitHub 未返回项目列表");
  return data.items
    .filter((p) => publicUrl(p.html_url))
    .map((p) => ({
      id: p.full_name,
      name: p.full_name,
      description: p.description || "",
      url: p.html_url,
      stars: p.stargazers_count,
      kind: "repository",
      compatibility: "inspect-required",
    }));
}
module.exports = { publicUrl, parseDshCatalog, discover };
