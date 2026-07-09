import { Model } from "./model.js";
import { StateManager, RACE_STATE } from "./state.js";
import { SerialReader, MockSerial } from "./serial.js";
import { RaceView } from "./ui/race-view.js";
import { SettingsView } from "./ui/settings-view.js";
import { CsvLogger } from "./logger.js";
import { LogoManager } from "./logos.js";
import { exportConfig, importConfig } from "./config-io.js";

class App {
  constructor() {
    this.model = new Model();
    this.state = new StateManager();

    this.statusDot = document.getElementById("status-dot");
    this.statusText = document.getElementById("status-text");
    this.settingsModal = document.getElementById("settings-modal");

    this.state.on("serialConnected", () => this.updateStatus());
    this.state.on("serialDisconnected", () => this.updateStatus());

    // Theme
    this.themeBtn = document.getElementById("theme-toggle-btn");
    this.applyTheme();
    this.themeBtn.addEventListener("click", () => this.cycleTheme());

    this.initSerial(false);
    this.raceView = new RaceView(this.model, this.state, this.serial);
    // Generic confirm modal setup (before views that need it)
    this.confirmCallback = null;
    const confirmModal = document.getElementById("confirm-modal");
    const confirmOk = document.getElementById("confirm-ok");
    const dismissConfirm = () => {
      confirmModal.classList.add("hidden");
      this.confirmCallback = null;
    };
    document
      .getElementById("confirm-cancel")
      .addEventListener("click", dismissConfirm);
    confirmModal
      .querySelector(".confirm-overlay")
      .addEventListener("click", dismissConfirm);
    confirmOk.addEventListener("click", () => {
      if (this.confirmCallback) this.confirmCallback();
      dismissConfirm();
    });

    this.settingsView = new SettingsView(
      this.model,
      this.state,
      this.serial,
      () => this.rebuild(),
      (msg, cb) => this.showConfirm(msg, cb),
    );

    this.logger = new CsvLogger(this.model);
    this.logoManager = new LogoManager((msg, cb) => this.showConfirm(msg, cb));

    // Config export/import
    document
      .getElementById("export-config-btn")
      .addEventListener("click", () => exportConfig());
    document
      .getElementById("import-config-input")
      .addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) importConfig(file);
      });

    // Reset config
    const resetConfigModal = document.getElementById("reset-config-modal");
    const resetConfigInput = document.getElementById("reset-config-input");
    const resetConfigOk = document.getElementById("reset-config-ok");
    document
      .getElementById("reset-config-btn")
      .addEventListener("click", () => {
        resetConfigInput.value = "";
        resetConfigOk.disabled = true;
        resetConfigModal.classList.remove("hidden");
        resetConfigInput.focus();
      });
    resetConfigInput.addEventListener("input", () => {
      resetConfigOk.disabled =
        resetConfigInput.value.trim().toLowerCase() !== "i understand";
    });
    document
      .getElementById("reset-config-cancel")
      .addEventListener("click", () => {
        resetConfigModal.classList.add("hidden");
      });
    resetConfigModal
      .querySelector(".confirm-overlay")
      .addEventListener("click", () => {
        resetConfigModal.classList.add("hidden");
      });
    resetConfigOk.addEventListener("click", () => {
      localStorage.clear();
      indexedDB.deleteDatabase("sprontz-logos");
      window.location.reload();
    });
    this.logSummaryEl = document.getElementById("log-summary");
    this.state.on("raceFinished", () => this.logRaceOnce());
    this.state.on("raceState", (raceState) => {
      if (raceState === RACE_STATE.FALSE_START) this.logRaceOnce();
    });

    // Log races toggle
    this.logRacesBtn = document.getElementById("log-races-btn");
    this.downloadLogsBtn = document.getElementById("download-logs-btn");
    this.resetLogsBtn = document.getElementById("reset-logs-btn");
    this.syncLogRacesBtn();
    this.logRacesBtn.addEventListener("click", () => {
      this.model.logRaces = !this.model.logRaces;
      this.model.saveSettings();
      this.syncLogRacesBtn();
    });

    this.downloadLogsBtn.addEventListener("click", () =>
      this.logger.download(),
    );
    this.updateLogSummary();

    document.getElementById("reset-logs-btn").addEventListener("click", () => {
      this.showConfirm(
        `Are you sure? This will clear ${this.logger.getSummary()}.`,
        () => {
          this.logger.clear();
          this.updateLogSummary();
        },
      );
    });

    // Mock mode button
    this.mockBtn = document.getElementById("mock-mode-btn");
    this.syncMockBtn();
    this.mockBtn.addEventListener("click", () => this.toggleMock());

    // Settings notice
    const notice = document.getElementById("settings-notice");
    if (localStorage.getItem("sprontz-notice-dismissed")) {
      notice.style.display = "none";
    }
    document
      .getElementById("settings-notice-close")
      .addEventListener("click", () => {
        notice.style.display = "none";
        localStorage.setItem("sprontz-notice-dismissed", "1");
      });

    // Settings gear open/close with hash
    document
      .getElementById("settings-gear-btn")
      .addEventListener("click", () => this.openSettings());
    document
      .getElementById("settings-close")
      .addEventListener("click", () => this.closeSettings());
    this.settingsModal
      .querySelector(".settings-overlay")
      .addEventListener("click", () => this.closeSettings());

    window.addEventListener("hashchange", () => this.syncHash());
    this.syncHash();

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (!this.settingsModal.classList.contains("hidden")) {
          this.closeSettings();
        } else if (
          !document.getElementById("confirm-modal").classList.contains("hidden")
        ) {
          document.getElementById("confirm-modal").classList.add("hidden");
        } else if (
          !document.getElementById("winner-modal").classList.contains("hidden")
        ) {
          document.getElementById("winner-modal").classList.add("hidden");
          this.state.setRaceState(RACE_STATE.STOPPED);
        }
      }

      // Cmd/Ctrl+M: toggle mock mode
      if ((e.metaKey || e.ctrlKey) && e.key === "m") {
        e.preventDefault();
        this.toggleMock();
      }
    });

    // Connect after listeners are set up
    if (this.model.mockMode) {
      this.serial.connect();
      this.showBanner("Mock mode enabled. Cmd/Ctrl+M to disable.");
    } else if (!("serial" in navigator)) {
      this.statusText.textContent = "Web Serial not supported";
      this.statusDot.style.background = "#e1b909";
      this.showBanner(
        "Sprontz requires the Web Serial API to connect to hardware. Please use Chrome or Edge.",
      );
    } else {
      this.serial.tryReconnect();
    }
  }

  logRaceOnce() {
    if (!this.model.logRaces || this.model.raceLogged) return;
    this.logger.logRaceFinish();
    this.model.raceLogged = true;
    this.updateLogSummary();
  }

  initSerial(autoConnect = true) {
    if (this.model.mockMode) {
      this.serial = new MockSerial(this.model, this.state);
      if (autoConnect) this.serial.connect();
    } else {
      this.serial = new SerialReader(this.model, this.state);
    }
  }

  openSettings() {
    window.location.hash = "settings";
  }

  closeSettings() {
    history.replaceState(null, "", window.location.pathname);
    this.settingsModal.classList.add("hidden");
  }

  syncHash() {
    if (window.location.hash === "#settings") {
      this.settingsModal.classList.remove("hidden");
    } else {
      this.settingsModal.classList.add("hidden");
    }
  }

  cycleTheme() {
    this.model.theme = this.model.theme === "dark" ? "light" : "dark";
    this.model.saveSettings();
    this.applyTheme();
  }

  applyTheme() {
    if (this.model.theme === "dark") {
      this.themeBtn.innerHTML =
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    } else {
      this.themeBtn.innerHTML =
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
    }
    if (this.model.theme === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    // Redraw dial with new theme colors
    if (this.raceView) this.raceView.dial.draw();
  }

  toggleMock() {
    this.model.mockMode = !this.model.mockMode;
    this.model.saveSettings();
    this.rebuild();
    this.syncMockBtn();
    const existing = document.getElementById("compat-banner");
    if (existing) existing.remove();
    if (this.model.mockMode) {
      this.showBanner("Mock mode enabled. Cmd/Ctrl+M to disable.");
    } else if (!("serial" in navigator)) {
      this.showBanner(
        "Sprontz requires the Web Serial API to connect to hardware. Please use Chrome or Edge.",
      );
    }
  }

  syncMockBtn() {
    this.mockBtn.classList.toggle("active", this.model.mockMode);
    this.mockBtn.textContent = this.model.mockMode ? "Mock: ON" : "Mock Mode";
  }

  showConfirm(msg, callback) {
    document.getElementById("confirm-message").textContent = msg;
    this.confirmCallback = callback;
    document.getElementById("confirm-modal").classList.remove("hidden");
  }

  showBanner(msg) {
    const banner = document.createElement("div");
    banner.id = "compat-banner";
    banner.textContent = msg;
    document.getElementById("app").prepend(banner);
  }

  syncLogRacesBtn() {
    this.logRacesBtn.classList.toggle("active", this.model.logRaces);
    this.logRacesBtn.textContent = this.model.logRaces
      ? "Race Logging: ON"
      : "Race Logging: Off";
    this.updateLogVisibility();
  }

  updateLogVisibility() {
    const hasLogs = this.logger.logs.length > 0;
    const show = this.model.logRaces || hasLogs;
    this.downloadLogsBtn.classList.toggle("hidden", !show);
    this.logSummaryEl.classList.toggle("hidden", !show);
    this.resetLogsBtn.classList.toggle("hidden", !show);
  }

  updateLogSummary() {
    this.logSummaryEl.textContent = this.logger.getSummary();
    this.updateLogVisibility();
  }

  updateStatus() {
    const connected = this.serial.connected;
    this.statusDot.classList.toggle("connected", connected);
    if (connected) {
      this.statusText.textContent = this.serial.firmwareVersion || "Connected";
    } else {
      this.statusText.textContent = "Disconnected";
    }
  }

  rebuild() {
    const needsMock = this.model.mockMode;
    const isMock = this.serial instanceof MockSerial;

    if (needsMock !== isMock) {
      if (this.serial.connected) this.serial.disconnect();
      this.initSerial();
    }

    this.raceView.serial = this.serial;
    this.settingsView.serial = this.serial;

    this.raceView.rebuild();
    this.settingsView.updateConnectionUI();
    this.updateStatus();
  }
}

new App();
