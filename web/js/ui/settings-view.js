import { RACE_TYPE, DEFAULT_COLORS } from "../model.js";

export class SettingsView {
  constructor(model, state, serial, onRebuild, showConfirm) {
    this.model = model;
    this.state = state;
    this.serial = serial;
    this.onRebuild = onRebuild;
    this.showConfirm = showConfirm;

    this.connectBtn = document.getElementById("connect-serial-btn");
    this.statusEl = document.getElementById("connection-status");
    this.rollerInput = document.getElementById("roller-diameter");
    this.numRacersEl = document.getElementById("num-racers");
    this.raceDistInput = document.getElementById("race-distance");
    this.raceTimeInput = document.getElementById("race-time");

    this.falseStartBtn = document.getElementById("false-start-btn");

    this.syncFromModel();
    this.setupEvents();
    this.updateConnectionUI();
  }

  syncFromModel() {
    this.rollerInput.value = this.model.rollerDiameterMm;
    this.numRacersEl.textContent = this.model.numRacers;
    this.raceDistInput.value = this.model.raceLengthMeters;
    this.raceTimeInput.value = this.model.raceTimeSeconds;
    // Race type toggles
    document.querySelectorAll("[data-race-type]").forEach((btn) => {
      btn.classList.toggle(
        "active",
        (btn.dataset.raceType === "distance" &&
          this.model.raceType === RACE_TYPE.DISTANCE) ||
          (btn.dataset.raceType === "time" &&
            this.model.raceType === RACE_TYPE.TIME),
      );
    });

    document
      .getElementById("distance-setting")
      .classList.toggle("hidden", this.model.raceType !== RACE_TYPE.DISTANCE);
    document
      .getElementById("time-setting")
      .classList.toggle("hidden", this.model.raceType !== RACE_TYPE.TIME);

    // Unit toggles
    document.querySelectorAll("[data-unit]").forEach((btn) => {
      btn.classList.toggle(
        "active",
        (btn.dataset.unit === "kph" && this.model.useKph) ||
          (btn.dataset.unit === "mph" && !this.model.useKph),
      );
    });

    // False start detection
    this.syncFalseStartBtn();

    // Color pickers
    for (let i = 0; i < 4; i++) {
      const swatch = document.getElementById(`swatch-racer-${i}`);
      const picker = document.getElementById(`color-racer-${i}`);
      const color = this.model.players[i].color;
      const pick = swatch && swatch.closest(".color-pick");
      if (pick) pick.style.display = i < this.model.numRacers ? "" : "none";
      if (swatch) swatch.style.background = color;
      if (picker) picker.color = color;
      const hexInput = document.getElementById(`hex-racer-${i}`);
      if (hexInput) hexInput.value = color;
    }
  }

  setupEvents() {
    // Color pickers — swatch click toggles popup
    for (let i = 0; i < 4; i++) {
      const swatch = document.getElementById(`swatch-racer-${i}`);
      const popup = document.getElementById(`popup-racer-${i}`);
      const picker = document.getElementById(`color-racer-${i}`);
      if (!swatch || !popup || !picker) continue;

      swatch.addEventListener("click", (e) => {
        e.stopPropagation();
        // Close all other popups
        document.querySelectorAll(".color-popup").forEach((p) => {
          if (p !== popup) p.classList.add("hidden");
        });
        popup.classList.toggle("hidden");
        if (!popup.classList.contains("hidden")) {
          const rect = swatch.getBoundingClientRect();
          popup.style.left = `${rect.left + rect.width / 2 - 102}px`;
          popup.style.top = `${rect.bottom + 8}px`;
        }
      });

      popup.addEventListener("click", (e) => e.stopPropagation());

      const hexInput = document.getElementById(`hex-racer-${i}`);
      const eyedrop = document.getElementById(`eyedrop-racer-${i}`);

      const setColor = (color) => {
        this.model.players[i].color = color;
        swatch.style.background = color;
        picker.color = color;
        if (hexInput) hexInput.value = color;
        this.model.saveSettings();
        this.onRebuild();
      };

      picker.addEventListener("color-changed", (e) => {
        this.model.players[i].color = e.detail.value;
        swatch.style.background = e.detail.value;
        if (hexInput) hexInput.value = e.detail.value;
        this.model.saveSettings();
        this.onRebuild();
      });

      if (hexInput) {
        hexInput.addEventListener("input", () => {
          const val = hexInput.value.trim();
          if (/^#[0-9a-fA-F]{6}$/.test(val)) {
            setColor(val);
          }
        });
        hexInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") hexInput.blur();
        });
      }

      if (eyedrop && "EyeDropper" in window) {
        eyedrop.addEventListener("click", async (e) => {
          e.stopPropagation();
          try {
            const dropper = new EyeDropper();
            const result = await dropper.open();
            setColor(result.sRGBHex);
          } catch (_) {}
        });
      } else if (eyedrop) {
        eyedrop.style.display = "none";
      }
    }

    // Close popups on outside click
    document.addEventListener("click", () => {
      document
        .querySelectorAll(".color-popup")
        .forEach((p) => p.classList.add("hidden"));
    });

    // Reset colors
    document
      .getElementById("reset-colors-btn")
      .addEventListener("click", () => {
        this.showConfirm("Reset all racer colors to defaults?", () => {
          for (let i = 0; i < 4; i++) {
            this.model.players[i].color = DEFAULT_COLORS[i];
          }
          this.model.saveSettings();
          this.syncFromModel();
          this.onRebuild();
        });
      });

    // Connect serial
    this.connectBtn.addEventListener("click", async () => {
      if (this.serial.connected) {
        await this.serial.disconnect();
      } else {
        try {
          await this.serial.connect();
        } catch (e) {
          this.statusEl.textContent = e.message || "Connection failed";
        }
      }
      this.updateConnectionUI();
    });

    this.state.on("serialConnected", () => this.updateConnectionUI());
    this.state.on("serialDisconnected", () => this.updateConnectionUI());

    // Roller diameter
    this.rollerInput.addEventListener("change", () => {
      this.model.rollerDiameterMm = parseFloat(this.rollerInput.value) || 114.3;
      this.model.saveSettings();
    });

    // Num racers
    document.getElementById("racers-minus").addEventListener("click", () => {
      this.model.numRacers = Math.max(1, this.model.numRacers - 1);
      this.numRacersEl.textContent = this.model.numRacers;
      this.model.saveSettings();
      this.syncFromModel();
      this.onRebuild();
    });
    document.getElementById("racers-plus").addEventListener("click", () => {
      this.model.numRacers = Math.min(4, this.model.numRacers + 1);
      this.numRacersEl.textContent = this.model.numRacers;
      this.model.saveSettings();
      this.syncFromModel();
      this.onRebuild();
    });

    // Race type
    document.querySelectorAll("[data-race-type]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.model.raceType =
          btn.dataset.raceType === "distance"
            ? RACE_TYPE.DISTANCE
            : RACE_TYPE.TIME;
        this.model.saveSettings();
        this.syncFromModel();
      });
    });

    // Race distance/time
    this.raceDistInput.addEventListener("change", () => {
      this.model.raceLengthMeters = parseFloat(this.raceDistInput.value) || 100;
      this.model.saveSettings();
    });
    this.raceTimeInput.addEventListener("change", () => {
      this.model.raceTimeSeconds = parseFloat(this.raceTimeInput.value) || 60;
      this.model.saveSettings();
    });

    // Units
    document.querySelectorAll("[data-unit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.model.useKph = btn.dataset.unit === "kph";
        this.model.saveSettings();
        this.syncFromModel();
        this.onRebuild();
      });
    });

    // False start detection
    this.falseStartBtn.addEventListener("click", () => {
      this.model.falseStartDetection = !this.model.falseStartDetection;
      this.model.saveSettings();
      this.syncFalseStartBtn();
    });
  }

  syncFalseStartBtn() {
    this.falseStartBtn.classList.toggle(
      "active",
      this.model.falseStartDetection,
    );
    this.falseStartBtn.textContent = this.model.falseStartDetection
      ? "On"
      : "Off";
  }

  updateConnectionUI() {
    const noSerial = !("serial" in navigator);
    if (noSerial && !this.model.mockMode) {
      this.connectBtn.textContent = "Not Supported";
      this.connectBtn.disabled = true;
      this.connectBtn.style.opacity = "0.4";
      this.connectBtn.style.cursor = "not-allowed";
      this.connectBtn.classList.remove("connected");
      this.statusEl.textContent = "";
    } else if (this.serial.connected) {
      this.connectBtn.textContent = "Disconnect";
      this.connectBtn.disabled = false;
      this.connectBtn.style.opacity = "";
      this.connectBtn.style.cursor = "";
      this.connectBtn.classList.add("connected");
      this.statusEl.textContent = this.serial.firmwareVersion || "Connected";
    } else {
      this.connectBtn.textContent = "Connect";
      this.connectBtn.disabled = false;
      this.connectBtn.style.opacity = "";
      this.connectBtn.style.cursor = "";
      this.connectBtn.classList.remove("connected");
      this.statusEl.textContent = "Disconnected";
    }
  }
}
