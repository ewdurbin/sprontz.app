const SETTINGS_KEY = "sprontz-settings";
const LOGS_KEY = "sprontz-race-logs";
const LOGOS_DB = "sprontz-logos";
const LOGOS_STORE = "logos";

async function getLogos() {
  return new Promise((resolve) => {
    const req = indexedDB.open(LOGOS_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(LOGOS_STORE);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(LOGOS_STORE, "readonly");
      const store = tx.objectStore(LOGOS_STORE);
      const logos = [null, null, null, null];
      let loaded = 0;
      for (let i = 0; i < 4; i++) {
        const r = store.get(i);
        r.onsuccess = () => {
          logos[i] = r.result || null;
          loaded++;
          if (loaded === 4) resolve(logos);
        };
        r.onerror = () => {
          loaded++;
          if (loaded === 4) resolve(logos);
        };
      }
    };
    req.onerror = () => resolve([null, null, null, null]);
  });
}

async function setLogos(logos) {
  return new Promise((resolve) => {
    const req = indexedDB.open(LOGOS_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(LOGOS_STORE);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(LOGOS_STORE, "readwrite");
      const store = tx.objectStore(LOGOS_STORE);
      for (let i = 0; i < 4; i++) {
        if (logos[i]) store.put(logos[i], i);
        else store.delete(i);
      }
      tx.oncomplete = () => resolve();
    };
  });
}

export async function exportConfig() {
  const settings = localStorage.getItem(SETTINGS_KEY) || "{}";
  const logs = localStorage.getItem(LOGS_KEY) || "[]";
  const logos = await getLogos();

  const zip = new JSZip();
  zip.file("settings.json", settings);
  zip.file("race-logs.json", logs);
  zip.file("logos.json", JSON.stringify(logos));

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/zip",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sprontz.zip";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function importConfig(file) {
  const zip = await JSZip.loadAsync(file);

  const settingsFile = zip.file("settings.json");
  if (settingsFile) {
    localStorage.setItem(SETTINGS_KEY, await settingsFile.async("string"));
  }

  const logsFile = zip.file("race-logs.json");
  if (logsFile) {
    localStorage.setItem(LOGS_KEY, await logsFile.async("string"));
  }

  const logosFile = zip.file("logos.json");
  if (logosFile) {
    const logos = JSON.parse(await logosFile.async("string"));
    await setLogos(logos);
  }

  window.location.reload();
}
