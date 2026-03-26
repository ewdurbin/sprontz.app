import { RACE_STATE } from "../state.js";
import { RACE_TYPE } from "../model.js";
import { DialRenderer } from "./dial.js";

export class RaceView {
  constructor(model, state, serial) {
    this.model = model;
    this.state = state;
    this.serial = serial;

    this.rowsEl = document.getElementById("racer-rows");
    this.timerEl = document.getElementById("race-timer");
    this.countdownEl = document.getElementById("countdown");
    this.startStopBtn = document.getElementById("start-stop-btn");
    this.winnerModal = document.getElementById("winner-modal");
    this.winnerName = document.getElementById("winner-name");
    this.winnerStats = document.getElementById("winner-stats");
    this.resultsTable = document.getElementById("results-table");

    this.dial = new DialRenderer(document.getElementById("dial-canvas"), model);
    this.animFrame = null;
    this.countdownTimeout = null;

    this.setupEvents();
    this.buildRacerRows();

    // Draw empty dial on load (after layout settles)
    requestAnimationFrame(() => this.dial.draw());
  }

  setupEvents() {
    this.holdDuration = 1000; // ms to hold for stop
    this.holdTimer = null;
    this.holdStart = 0;
    this.holdAnim = null;

    const beginHold = () => {
      const rs = this.state.raceState;
      if (!this.model.hardwareConnected && !this.model.mockMode) return;

      // Start is instant
      if (
        rs === RACE_STATE.STOPPED ||
        rs === RACE_STATE.COMPLETE ||
        rs === RACE_STATE.FALSE_START
      ) {
        this.onStartStop();
        return;
      }

      // Stop requires hold
      this.holdStart = performance.now();
      this.startStopBtn.style.setProperty("--hold", "0");
      this.holdAnim = requestAnimationFrame(() => this.animateHold());
      this.holdTimer = setTimeout(() => {
        this.cancelHold();
        this.onStartStop();
      }, this.holdDuration);
    };

    const cancelHold = () => this.cancelHold();

    this.startStopBtn.addEventListener("mousedown", beginHold);
    this.startStopBtn.addEventListener("mouseup", cancelHold);
    this.startStopBtn.addEventListener("mouseleave", cancelHold);
    this.startStopBtn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      beginHold();
    });
    this.startStopBtn.addEventListener("touchend", cancelHold);
    this.startStopBtn.addEventListener("touchcancel", cancelHold);

    // Space key hold
    let spaceHeld = false;
    document.addEventListener("keydown", (e) => {
      const inTextField =
        document.activeElement &&
        (document.activeElement.tagName === "INPUT" ||
          document.activeElement.tagName === "TEXTAREA");
      if (
        e.code === "Space" &&
        this.state.appState === "race" &&
        !e.repeat &&
        !inTextField
      ) {
        e.preventDefault();
        spaceHeld = true;
        beginHold();
      }
    });
    document.addEventListener("keyup", (e) => {
      if (e.code === "Space" && spaceHeld) {
        spaceHeld = false;
        cancelHold();
      }
    });

    document.getElementById("modal-close").addEventListener("click", () => {
      this.winnerModal.classList.add("hidden");
      this.state.setRaceState(RACE_STATE.STOPPED);
    });

    this.state.on("raceState", (rs) => this.onRaceStateChange(rs));
    this.state.on("serialConnected", () => this.updateStartBtn());
    this.state.on("serialDisconnected", () => this.updateStartBtn());
    this.state.on("raceFinished", () => this.showWinner());
  }

  buildRacerRows() {
    this.rowsEl.innerHTML = "";
    this.racerEls = [];

    for (let i = 0; i < this.model.numRacers; i++) {
      const player = this.model.players[i];
      const row = document.createElement("div");
      row.className = "racer-row";
      row.style.borderLeftColor = player.color;

      row.innerHTML = `
        <input class="racer-name" value="${player.name}" data-index="${i}">
        <span class="racer-speed">0.0 ${this.model.useKph ? "KPH" : "MPH"}</span>
        <span class="racer-progress">--</span>
      `;

      const nameInput = row.querySelector(".racer-name");
      nameInput.addEventListener("focus", () => nameInput.select());
      nameInput.addEventListener("keydown", (e) => {
        if (e.key === "Tab") {
          e.preventDefault();
          const nextIdx =
            (i + (e.shiftKey ? this.model.numRacers - 1 : 1)) %
            this.model.numRacers;
          const next = this.rowsEl.querySelector(
            `input[data-index="${nextIdx}"]`,
          );
          if (next) next.focus();
        } else if (e.key === "Enter" || e.key === "Escape") {
          nameInput.blur();
        }
      });
      nameInput.addEventListener("input", () => {
        player.name = nameInput.value || `Racer ${i + 1}`;
        this.model.saveSettings();
      });

      this.rowsEl.appendChild(row);
      this.racerEls.push({
        row,
        name: nameInput,
        speed: row.querySelector(".racer-speed"),
        progress: row.querySelector(".racer-progress"),
      });
    }
  }

  resetRace() {
    this.model.resetPlayers();
    this.buildRacerRows();
    this.dial.draw();
  }

  rebuild() {
    this.buildRacerRows();
    this.dial = new DialRenderer(
      document.getElementById("dial-canvas"),
      this.model,
    );
    this.dial.draw();
    this.updateStartBtn();
  }

  animateHold() {
    const elapsed = performance.now() - this.holdStart;
    const pct = Math.min(elapsed / this.holdDuration, 1);
    this.startStopBtn.style.setProperty("--hold", pct);
    if (pct < 1) {
      this.holdAnim = requestAnimationFrame(() => this.animateHold());
    }
  }

  cancelHold() {
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    if (this.holdAnim) {
      cancelAnimationFrame(this.holdAnim);
      this.holdAnim = null;
    }
    this.startStopBtn.style.setProperty("--hold", "0");
  }

  onStartStop() {
    if (!this.model.hardwareConnected && !this.model.mockMode) return;

    const rs = this.state.raceState;
    if (
      rs === RACE_STATE.STOPPED ||
      rs === RACE_STATE.COMPLETE ||
      rs === RACE_STATE.FALSE_START
    ) {
      this.serial.startRace();
    } else if (
      rs === RACE_STATE.RUNNING ||
      rs === RACE_STATE.STARTING ||
      rs === RACE_STATE.COUNTDOWN_3 ||
      rs === RACE_STATE.COUNTDOWN_2 ||
      rs === RACE_STATE.COUNTDOWN_1 ||
      rs === RACE_STATE.COUNTDOWN_GO
    ) {
      this.serial.stopRace();
    }
  }

  updateStartBtn() {
    const btn = this.startStopBtn;
    const canStart = this.model.hardwareConnected || this.model.mockMode;
    const rs = this.state.raceState;

    btn.classList.toggle("disabled", !canStart);

    if (
      rs === RACE_STATE.RUNNING ||
      rs === RACE_STATE.STARTING ||
      rs === RACE_STATE.COUNTDOWN_3 ||
      rs === RACE_STATE.COUNTDOWN_2 ||
      rs === RACE_STATE.COUNTDOWN_1 ||
      rs === RACE_STATE.COUNTDOWN_GO
    ) {
      btn.textContent = "STOP";
      btn.classList.add("running");
    } else {
      btn.textContent = "START";
      btn.classList.remove("running");
    }
  }

  setNamesEditable(editable) {
    for (const el of this.racerEls) {
      el.name.readOnly = !editable;
      el.name.classList.toggle("locked", !editable);
    }
  }

  onRaceStateChange(rs) {
    this.updateStartBtn();
    const idle = rs === RACE_STATE.STOPPED;
    this.setNamesEditable(idle);

    switch (rs) {
      case RACE_STATE.COUNTDOWN_3:
        this.showCountdown("3");
        break;
      case RACE_STATE.COUNTDOWN_2:
        this.showCountdown("2");
        break;
      case RACE_STATE.COUNTDOWN_1:
        this.showCountdown("1");
        break;
      case RACE_STATE.COUNTDOWN_GO:
        this.showCountdown("GO");
        this.startRenderLoop();
        break;
      case RACE_STATE.RUNNING:
        this.hideCountdown();
        break;
      case RACE_STATE.STOPPED:
        this.hideCountdown();
        this.stopRenderLoop();
        this.resetRace();
        break;
      case RACE_STATE.COMPLETE:
        this.stopRenderLoop();
        this.updateDisplay(); // final frame
        break;
      case RACE_STATE.FALSE_START:
        this.showCountdown("FALSE START");
        setTimeout(() => {
          this.hideCountdown();
          this.state.setRaceState(RACE_STATE.STOPPED);
        }, 2000);
        break;
    }
  }

  showCountdown(text) {
    // Cancel any pending animation
    if (this.countdownAnim) cancelAnimationFrame(this.countdownAnim);

    this.countdownEl.classList.remove("hidden");
    this.countdownEl.textContent = text;

    // Size to fill the dial
    const dialRect = document
      .getElementById("race-dial")
      .getBoundingClientRect();
    const fontSize = Math.round(
      Math.min(dialRect.width, dialRect.height) * 0.75,
    );
    this.countdownEl.style.fontSize = `${fontSize}px`;
    this.countdownEl.style.transition = "none";
    this.countdownEl.style.transform = "scale(0.3)";
    this.countdownEl.style.opacity = "0";

    const isGo = text === "GO";
    const start = performance.now();
    const duration = isGo ? 1500 : 700;

    const animate = (now) => {
      const t = Math.min((now - start) / duration, 1);

      if (t < 0.4) {
        // Phase 1: scale in fast with overshoot
        const p = t / 0.4;
        const ease = 1 - Math.pow(1 - p, 3);
        const scale = 0.3 + ease * 0.85; // overshoot to 1.15
        this.countdownEl.style.transform = `scale(${scale})`;
        this.countdownEl.style.opacity = `${Math.min(p * 2, 1)}`;
      } else if (t < 0.6) {
        // Phase 2: settle to 1.0
        const p = (t - 0.4) / 0.2;
        const scale = 1.15 - p * 0.15;
        this.countdownEl.style.transform = `scale(${scale})`;
        this.countdownEl.style.opacity = "1";
      } else {
        // Phase 3: hold then fade/grow out
        const p = (t - 0.6) / 0.4;
        const ease = p * p;
        const scale = 1 + ease * 0.5;
        this.countdownEl.style.transform = `scale(${scale})`;
        this.countdownEl.style.opacity = `${1 - ease}`;
      }

      if (isGo) {
        this.countdownEl.style.color = "#2ecc71";
        this.countdownEl.style.textShadow =
          "0 0 40px rgba(46,204,113,0.9), 0 0 80px rgba(46,204,113,0.6), 0 0 160px rgba(46,204,113,0.4), 0 0 300px rgba(46,204,113,0.2)";
      } else {
        this.countdownEl.style.color = "var(--text)";
        this.countdownEl.style.textShadow = "";
      }

      if (t < 1) {
        this.countdownAnim = requestAnimationFrame(animate);
      }
    };

    this.countdownAnim = requestAnimationFrame(animate);
  }

  hideCountdown() {
    if (this.countdownAnim) cancelAnimationFrame(this.countdownAnim);
    this.countdownEl.classList.add("hidden");
    this.countdownEl.style.color = "white";
  }

  startRenderLoop() {
    const loop = () => {
      this.updateDisplay();
      this.animFrame = requestAnimationFrame(loop);
    };
    this.animFrame = requestAnimationFrame(loop);
  }

  stopRenderLoop() {
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
  }

  updateDisplay() {
    // Timer
    this.timerEl.textContent = this.model.formatTime(this.model.elapsedRaceMs);

    const now = performance.now();
    const updateSpeed =
      !this.lastSpeedUpdate || now - this.lastSpeedUpdate >= 1000;
    if (updateSpeed) this.lastSpeedUpdate = now;

    // Per-racer updates
    for (let i = 0; i < this.model.numRacers; i++) {
      const player = this.model.players[i];
      const el = this.racerEls[i];
      if (!el) continue;

      if (updateSpeed)
        el.speed.textContent = this.model.formatSpeed(player.mph);

      if (this.model.raceType === RACE_TYPE.DISTANCE) {
        // Show time for distance race
        const distM = player.getDistanceMeters(this.model.rollerCircumMm);
        el.progress.textContent = `${this.model.formatDistance(distM)}`;
        if (player.finishedRace) el.row.classList.add("finished");
      } else {
        // Show distance for time race
        const distM = player.getDistanceMeters(this.model.rollerCircumMm);
        el.progress.textContent = `${this.model.formatDistance(distM)}`;
        if (player.finishedRace) el.row.classList.add("finished");
      }
    }

    // Dial
    this.dial.draw();
  }

  showWinner() {
    const players = this.model.getActivePlayers().slice();
    const isDistance = this.model.raceType === RACE_TYPE.DISTANCE;

    if (isDistance) {
      players.sort((a, b) => a.finishTimeMillis - b.finishTimeMillis);
    } else {
      players.sort((a, b) => b.curRaceTicks - a.curRaceTicks);
    }

    const winner = players[0];
    this.winnerName.textContent = winner.name;
    this.winnerName.style.color = winner.color;
    this.winnerName.style.textShadow = `0 0 40px ${winner.color}44, 0 0 80px ${winner.color}22`;

    if (isDistance) {
      this.winnerStats.textContent = `${this.model.formatTime(winner.finishTimeMillis)}  ·  ${this.model.formatSpeed(winner.maxMph)}`;
    } else {
      const dist = winner.getDistanceMeters(this.model.rollerCircumMm);
      this.winnerStats.textContent = `${this.model.formatDistance(dist)}  ·  ${this.model.formatSpeed(winner.maxMph)}`;
    }

    // Build results table for all racers
    this.resultsTable.innerHTML = "";
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const tr = document.createElement("tr");

      const primaryStat = isDistance
        ? this.model.formatTime(p.finishTimeMillis)
        : this.model.formatDistance(
            p.getDistanceMeters(this.model.rollerCircumMm),
          );

      tr.innerHTML = `
        <td class="result-pos">${i + 1}</td>
        <td class="result-color"><span style="background:${p.color}"></span></td>
        <td class="result-name">${p.name}</td>
        <td class="result-stat">${primaryStat}</td>
        <td class="result-speed">${this.model.formatSpeed(p.maxMph)}</td>
      `;
      this.resultsTable.appendChild(tr);
    }

    this.winnerModal.classList.remove("hidden");
  }
}
