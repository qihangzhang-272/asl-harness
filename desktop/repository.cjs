const path = require("node:path");
const { githubSnapshot } = require("./market.cjs");

// This small record travels inside a Mode, not in an App-only source database.
function upstreamDocument(original, repo, url) {
  return original.replace(/\s*<!-- asl:upstream -->[\s\S]*?<!-- \/asl:upstream -->/g, "").trimEnd()
    + `\n\n<!-- asl:upstream -->\n- Repository: ${repo.url}\n- URL: ${url}\n- Commit: ${repo.commit}\n<!-- /asl:upstream -->\n`;
}
function presetDestination(root, mode) {
  if (typeof mode !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(mode)) throw new Error("无效的 Mode");
  return path.join(root, `asl-${mode.toLowerCase().replace(/[._]/g, "-")}`);
}
async function checkUpstreams(modes, fetch) {
  const checked = new Map();
  const rows = [];
  for (const mode of modes.filter(m => m.upstream)) {
    const { url, commit } = mode.upstream;
    if (!checked.has(url)) {
      try { checked.set(url, { commit: (await githubSnapshot(url, fetch)).commit }); }
      catch (error) { checked.set(url, { error: error.message }); }
    }
    const result = checked.get(url);
    rows.push({ mode: mode.id, ...result, status: result.error ? "error" : result.commit === commit ? "current" : "new-commit" });
  }
  return { checkedAt: new Date().toISOString(), modes: rows };
}
module.exports = { upstreamDocument, presetDestination, checkUpstreams };
