import { RACE_STATE } from "./state.js";
import { RACE_TYPE } from "./model.js";

export class SerialReader {
  constructor(model, state) {
    this.model = model;
    this.state = state;
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.readBuffer = "";
    this.connected = false;
    this.verified = false;
    this.firmwareVersion = "";
    this.reading = false;
    this.verifyTimeout = null;
  }

  async tryReconnect() {
    if (!("serial" in navigator)) return false;
    try {
      const ports = await navigator.serial.getPorts();
      if (ports.length === 0) return false;
      this.port = ports[0];
      await this.port.open({
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
      });

      this.writer = this.port.writable.getWriter();
      this.connected = true;
      this.verified = false;
      this.startReading();
      await this.send("v\n");
      this.startVerifyTimeout();
      return true;
    } catch (e) {
      console.log("Auto-reconnect failed:", e);
      return false;
    }
  }

  async connect() {
    if (!("serial" in navigator)) {
      throw new Error("Web Serial API not supported. Use Chrome or Edge.");
    }

    try {
      this.port = await navigator.serial.requestPort();
      await this.port.open({
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
      });

      this.writer = this.port.writable.getWriter();
      this.connected = true;
      this.verified = false;
      this.startReading();
      await this.send("v\n");
      this.startVerifyTimeout();

      return true;
    } catch (e) {
      console.error("Serial connect failed:", e);
      this.connected = false;
      this.model.hardwareConnected = false;
      throw e;
    }
  }

  startVerifyTimeout() {
    // Arduino resets on serial open (DTR line) — the bootloader takes ~1-2s,
    // so the first "v\n" often arrives before the board is ready. Retry a few
    // times before giving up.
    let retries = 0;
    this.verifyInterval = setInterval(() => {
      if (this.verified) {
        clearInterval(this.verifyInterval);
        this.verifyInterval = null;
        return;
      }
      if (++retries >= 6) {
        clearInterval(this.verifyInterval);
        this.verifyInterval = null;
        console.log(
          "No valid firmware response — not a SilverSprint controller",
        );
        this.disconnect();
        return;
      }
      this.send("v\n");
    }, 500);
  }

  async disconnect() {
    if (this.verifyTimeout) {
      clearTimeout(this.verifyTimeout);
      this.verifyTimeout = null;
    }
    if (this.verifyInterval) {
      clearInterval(this.verifyInterval);
      this.verifyInterval = null;
    }
    this.reading = false;
    this.verified = false;
    try {
      if (this.reader) {
        try {
          await this.reader.cancel();
        } catch (_) {}
        try {
          this.reader.releaseLock();
        } catch (_) {}
        this.reader = null;
      }
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
        // Wait for pipeTo to settle after abort
        await new Promise((r) => setTimeout(r, 50));
      }
      if (this.writer) {
        try {
          this.writer.releaseLock();
        } catch (_) {}
        this.writer = null;
      }
      if (this.port) {
        try {
          await this.port.close();
        } catch (_) {}
        this.port = null;
      }
    } catch (e) {
      // Force-clear references even on error
      this.reader = null;
      this.writer = null;
      this.abortController = null;
      this.port = null;
    }
    this.connected = false;
    this.model.hardwareConnected = false;
    this.state.emit("serialDisconnected");
  }

  async startReading() {
    this.reading = true;
    this.abortController = new AbortController();
    const decoder = new TextDecoderStream();
    this.port.readable
      .pipeTo(decoder.writable, { signal: this.abortController.signal })
      .catch(() => {});
    this.reader = decoder.readable.getReader();

    try {
      while (this.reading) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          console.log("[serial rx]", JSON.stringify(value));
          this.readBuffer += value;
          this.processBuffer();
        }
      }
    } catch (e) {
      if (this.reading) {
        console.error("Serial read error:", e);
        this.disconnect();
      }
    }
  }

  processBuffer() {
    const lines = this.readBuffer.split(/\r?\n/);
    // Keep the last incomplete line in the buffer
    this.readBuffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) this.parseLine(trimmed);
    }
  }

  parseLine(line) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) return;

    const cmd = line.substring(0, colonIdx);
    const data = line.substring(colonIdx + 1);

    switch (cmd) {
      case "V":
        this.firmwareVersion = data;
        this.verified = true;
        this.model.hardwareConnected = true;
        if (this.verifyTimeout) {
          clearTimeout(this.verifyTimeout);
          this.verifyTimeout = null;
        }
        console.log("Firmware:", data);
        this.state.emit("serialConnected");
        break;

      case "CD": {
        const n = parseInt(data);
        if (n === 3) this.state.setRaceState(RACE_STATE.COUNTDOWN_3);
        else if (n === 2) this.state.setRaceState(RACE_STATE.COUNTDOWN_2);
        else if (n === 1) this.state.setRaceState(RACE_STATE.COUNTDOWN_1);
        else if (n === 0) {
          this.state.setRaceState(RACE_STATE.COUNTDOWN_GO);
          // Transition to running after a short delay
          setTimeout(() => this.state.setRaceState(RACE_STATE.RUNNING), 1500);
        }
        break;
      }

      case "R": {
        // R:T0,T1,T2,T3,MILLIS
        const parts = data.split(",");
        if (parts.length >= 5) {
          const millis = parseInt(parts[4]);
          this.model.elapsedRaceMs = millis;

          for (let i = 0; i < this.model.numRacers; i++) {
            const ticks = parseInt(parts[i]);
            const player = this.model.players[i];
            player.updateRaceTicks(ticks, millis, this.model.rollerCircumMm);

            if (this.model.raceType === RACE_TYPE.DISTANCE) {
              player.pctComplete = Math.min(
                1,
                ticks / this.model.totalRaceTicks,
              );
            }
          }

          // Time race: progress based on elapsed time, scaled by relative speed
          if (this.model.raceType === RACE_TYPE.TIME) {
            const timePct = Math.min(
              1,
              millis / (this.model.raceTimeSeconds * 1000),
            );
            let maxTicks = 0;
            for (let i = 0; i < this.model.numRacers; i++) {
              maxTicks = Math.max(maxTicks, this.model.players[i].curRaceTicks);
            }
            for (let i = 0; i < this.model.numRacers; i++) {
              this.model.players[i].pctComplete =
                maxTicks > 0
                  ? timePct * (this.model.players[i].curRaceTicks / maxTicks)
                  : 0;
            }
          }
        }
        break;
      }

      case "0F":
      case "1F":
      case "2F":
      case "3F": {
        const racerIdx = parseInt(cmd[0]);
        const finishMs = parseInt(data);
        if (racerIdx < this.model.numRacers) {
          this.model.players[racerIdx].setFinished(finishMs);
          this.model.players[racerIdx].pctComplete = 1;
          this.state.emit(
            "racerFinish",
            racerIdx,
            finishMs,
            this.model.players[racerIdx].curRaceTicks,
          );

          if (this.model.isRaceFinished()) {
            this.state.setRaceState(RACE_STATE.COMPLETE);
            this.state.emit("raceFinished");
          }
        }
        break;
      }

      case "FS": {
        const racerIdx = parseInt(data);
        const validRacer = racerIdx >= 0 && racerIdx < this.model.numRacers;
        if (validRacer) {
          this.model.players[racerIdx].falseStart = true;
          console.warn("False start by racer", racerIdx);
        }
        if (validRacer && this.model.falseStartDetection) {
          this.send("s\n");
          this.state.setRaceState(RACE_STATE.FALSE_START);
        }
        break;
      }

      case "L":
        console.log("Race length confirmed:", data, "ticks");
        break;

      case "M":
        console.log("Mock mode:", data);
        break;

      default:
        console.log("Unknown serial:", line);
    }
  }

  async send(str) {
    if (!this.writer) return;
    const encoder = new TextEncoder();
    await this.writer.write(encoder.encode(str));
  }

  async startRace() {
    this.model.resetPlayers();
    this.model.raceLogged = false;

    if (this.model.raceType === RACE_TYPE.DISTANCE) {
      await this.send("d\n");
      await this.send(`l${this.model.totalRaceTicks}\n`);
    } else {
      await this.send("x\n");
      await this.send(`t${this.model.raceTimeSeconds}\n`);
    }

    this.state.setRaceState(RACE_STATE.STARTING);
    await this.send("g\n");
  }

  async stopRace() {
    await this.send("s\n");
    this.state.setRaceState(RACE_STATE.STOPPED);
  }

  async setMockMode(on) {
    await this.send("m\n");
  }
}

// Mock serial for testing without hardware
export class MockSerial {
  constructor(model, state) {
    this.model = model;
    this.state = state;
    this.connected = false;
    this.firmwareVersion = "MOCK_v1.0";
    this.raceInterval = null;
    this.raceStartTime = 0;
    this.mockSpeeds = [40, 56, 48, 32]; // KPH per racer
  }

  async connect() {
    this.connected = true;
    this.model.hardwareConnected = true;
    this.state.emit("serialConnected");
    return true;
  }

  async disconnect() {
    this.stopMockRace();
    this.connected = false;
    this.model.hardwareConnected = false;
    this.state.emit("serialDisconnected");
  }

  async startRace() {
    this.model.resetPlayers();
    this.model.raceLogged = false;
    this.state.setRaceState(RACE_STATE.STARTING);

    // Simulate countdown
    const countdowns = [
      [RACE_STATE.COUNTDOWN_3, 1000],
      [RACE_STATE.COUNTDOWN_2, 1000],
      [RACE_STATE.COUNTDOWN_1, 1000],
      [RACE_STATE.COUNTDOWN_GO, 1000],
    ];

    let delay = 0;
    for (const [raceState, wait] of countdowns) {
      delay += wait;
      setTimeout(() => {
        this.state.setRaceState(raceState);
        // Start timing from GO, matching Arduino behavior
        if (raceState === RACE_STATE.COUNTDOWN_GO) {
          this.raceStartTime = performance.now();
          this.startMockRace();
        }
      }, delay);
    }

    setTimeout(() => {
      this.state.setRaceState(RACE_STATE.RUNNING);
    }, delay + 1500);
  }

  startMockRace() {
    const rollerCircumM = this.model.rollerCircumMm / 1000;
    this.fractionalTicks = new Array(4).fill(0);
    this.lastMockTime = performance.now();

    this.raceInterval = setInterval(() => {
      const now = performance.now();
      const dt = (now - this.lastMockTime) / 1000; // actual seconds since last update
      this.lastMockTime = now;
      const elapsed = now - this.raceStartTime;
      this.model.elapsedRaceMs = elapsed;

      for (let i = 0; i < this.model.numRacers; i++) {
        const player = this.model.players[i];
        if (player.finishedRace) continue;

        // Speed in m/s with some noise
        const baseSpeedMs = this.mockSpeeds[i] / 3.6;
        const noise = 1 + (Math.random() - 0.5) * 0.04;
        const speedMs = baseSpeedMs * noise;

        // Accumulate fractional ticks
        this.fractionalTicks[i] += (speedMs * dt) / rollerCircumM;
        const totalTicks = Math.floor(this.fractionalTicks[i]);
        player.updateRaceTicks(totalTicks, elapsed, this.model.rollerCircumMm);

        if (this.model.raceType === RACE_TYPE.DISTANCE) {
          player.pctComplete = Math.min(
            1,
            totalTicks / this.model.totalRaceTicks,
          );
          if (totalTicks >= this.model.totalRaceTicks && !player.finishedRace) {
            player.setFinished(elapsed);
            player.pctComplete = 1;
            this.state.emit("racerFinish", i, elapsed, totalTicks);
          }
        } else {
          if (
            elapsed >= this.model.raceTimeSeconds * 1000 &&
            !player.finishedRace
          ) {
            player.setFinished(elapsed);
            player.pctComplete = 1;
            this.state.emit("racerFinish", i, elapsed, totalTicks);
          }
        }
      }

      // Time race: progress based on elapsed time, scaled by relative speed
      if (this.model.raceType === RACE_TYPE.TIME) {
        const timePct = Math.min(
          1,
          elapsed / (this.model.raceTimeSeconds * 1000),
        );
        let maxTicks = 0;
        for (let i = 0; i < this.model.numRacers; i++) {
          if (!this.model.players[i].finishedRace) {
            maxTicks = Math.max(maxTicks, this.model.players[i].curRaceTicks);
          }
        }
        for (let i = 0; i < this.model.numRacers; i++) {
          if (!this.model.players[i].finishedRace) {
            this.model.players[i].pctComplete =
              maxTicks > 0
                ? timePct * (this.model.players[i].curRaceTicks / maxTicks)
                : 0;
          }
        }
      }

      if (this.model.isRaceFinished()) {
        this.stopMockRace();
        this.state.setRaceState(RACE_STATE.COMPLETE);
        this.state.emit("raceFinished");
      }
    }, 20);
  }

  stopMockRace() {
    if (this.raceInterval) {
      clearInterval(this.raceInterval);
      this.raceInterval = null;
    }
  }

  async stopRace() {
    this.stopMockRace();
    this.state.setRaceState(RACE_STATE.STOPPED);
  }

  async send() {}
  async setMockMode() {}
}
