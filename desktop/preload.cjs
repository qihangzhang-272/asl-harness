const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("asl", {
  initial: () => ipcRenderer.invoke("asl:initial"),
  remember: (workspace) => ipcRenderer.invoke("asl:remember", workspace),
  native: () => ipcRenderer.invoke("asl:native"),
  discover: (provider, query) =>
    ipcRenderer.invoke("asl:discover", provider, query),
  external: (url) => ipcRenderer.invoke("asl:external", url),
  choose: (kind) => ipcRenderer.invoke("asl:choose", kind),
  run: (action, values) => ipcRenderer.invoke("asl:run", action, values),
  readSkill: (workspace, skill) =>
    ipcRenderer.invoke("asl:read-skill", workspace, skill),
});
