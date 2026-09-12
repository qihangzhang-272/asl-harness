const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("asl", {
  initial: () => ipcRenderer.invoke("asl:initial"),
  remember: (workspace) => ipcRenderer.invoke("asl:remember", workspace),
  native: () => ipcRenderer.invoke("asl:native"),
  localSkills: (extra) => ipcRenderer.invoke("asl:local-skills", extra),
  githubSkills: (url) => ipcRenderer.invoke("asl:github-skills", url),
  repositoryMode: (snapshot, mode) => ipcRenderer.invoke("asl:repository-mode", snapshot, mode),
  presetTarget: (mode) => ipcRenderer.invoke("asl:preset-target", mode),
  repositoryUpdates: (workspace) => ipcRenderer.invoke("asl:repository-updates", workspace),
  sourceDocument: (source) => ipcRenderer.invoke("asl:source-document", source),
  setup: (assistant, values) => ipcRenderer.invoke("asl:setup", assistant, values),
  setupStatus: (id) => ipcRenderer.invoke("asl:setup-status", id),
  discover: (provider, query) =>
    ipcRenderer.invoke("asl:discover", provider, query),
  external: (url) => ipcRenderer.invoke("asl:external", url),
  choose: (kind) => ipcRenderer.invoke("asl:choose", kind),
  run: (action, values) => ipcRenderer.invoke("asl:run", action, values),
  readSkill: (workspace, skill) =>
    ipcRenderer.invoke("asl:read-skill", workspace, skill),
});
