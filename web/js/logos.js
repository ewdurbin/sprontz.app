const DB_NAME = "sprontz-logos";
const STORE_NAME = "logos";
const SLOT_NAMES = ["logo-slot-0", "logo-slot-1", "logo-slot-2", "logo-slot-3"];
const MAX_SIZE = 512; // max width/height for stored images

export class LogoManager {
  constructor(showConfirm) {
    this.showConfirm = showConfirm;
    this.logos = [null, null, null, null];
    this.dbReady = this.openDB().then(() => this.loadAll());
    this.dbReady.then(() => {
      this.render();
      this.setupEvents();
    });
  }

  openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE_NAME);
      };
      req.onsuccess = () => {
        this.db = req.result;
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  loadAll() {
    return new Promise((resolve) => {
      const tx = this.db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      let loaded = 0;
      for (let i = 0; i < 4; i++) {
        const req = store.get(i);
        req.onsuccess = () => {
          this.logos[i] = req.result || null;
          loaded++;
          if (loaded === 4) resolve();
        };
        req.onerror = () => {
          loaded++;
          if (loaded === 4) resolve();
        };
      }
    });
  }

  save(index, data) {
    const tx = this.db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    if (data) {
      store.put(data, index);
    } else {
      store.delete(index);
    }
  }

  resizeImage(file) {
    // SVGs: store as data URL directly (they scale fine)
    if (file.type === "image/svg+xml") {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
    }

    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        if (width <= MAX_SIZE && height <= MAX_SIZE) {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(file);
          return;
        }
        const scale = Math.min(MAX_SIZE / width, MAX_SIZE / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = url;
    });
  }

  render() {
    for (let i = 0; i < 4; i++) {
      const slot = document.getElementById(SLOT_NAMES[i]);
      const preview = document.getElementById(`logo-preview-${i}`);
      const clearBtn = document.getElementById(`logo-clear-${i}`);

      if (this.logos[i]) {
        if (slot) {
          slot.innerHTML = "";
          const img = document.createElement("img");
          img.src = this.logos[i];
          img.alt = `Logo ${i + 1}`;
          slot.appendChild(img);
        }
        if (preview) {
          preview.innerHTML = "";
          const img = document.createElement("img");
          img.src = this.logos[i];
          preview.appendChild(img);
          preview.classList.add("has-image");
        }
        if (clearBtn) clearBtn.classList.remove("hidden");
      } else {
        if (slot) slot.innerHTML = "";
        if (preview) {
          preview.innerHTML = "";
          preview.classList.remove("has-image");
        }
        if (clearBtn) clearBtn.classList.add("hidden");
      }
    }
  }

  setupEvents() {
    for (let i = 0; i < 4; i++) {
      const upload = document.getElementById(`logo-upload-${i}`);
      const clearBtn = document.getElementById(`logo-clear-${i}`);
      const preview = document.getElementById(`logo-preview-${i}`);

      if (preview && upload) {
        preview.style.cursor = "pointer";
        preview.addEventListener("click", () => upload.click());
      }

      if (upload) {
        upload.addEventListener("change", async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          try {
            const data = await this.resizeImage(file);
            this.logos[i] = data;
            this.save(i, data);
            this.render();
          } catch (err) {
            console.error("Logo upload failed:", err);
          }
          upload.value = "";
        });
      }

      if (clearBtn) {
        clearBtn.addEventListener("click", () => {
          this.logos[i] = null;
          this.save(i, null);
          this.render();
        });
      }
    }

    // Reset logos
    const resetBtn = document.getElementById("reset-logos-btn");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        this.showConfirm("Remove all logos?", () => {
          for (let i = 0; i < 4; i++) {
            this.logos[i] = null;
            this.save(i, null);
          }
          this.render();
        });
      });
    }
  }
}
