const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("firmwareAPI", {
  verify: (args) => ipcRenderer.invoke("verify", args),
  hashZip: (zipBuffer) => ipcRenderer.invoke("hash-zip", zipBuffer)
});
