// Player colors matching the original
export const DEFAULT_COLORS = [
  "#e74c3c", // red
  "#3498db", // blue
  "#2ecc71", // green
  "#e1b909", // yellow
];

const PLAYER_COLORS = [...DEFAULT_COLORS];

const DEFAULT_NAMES = ["Racer 1", "Racer 2", "Racer 3", "Racer 4"];

export class PlayerData {
  constructor(index) {
    this.index = index;
    this.name = DEFAULT_NAMES[index];
    this.color = PLAYER_COLORS[index];
    this.reset();
  }

  reset() {
    this.curRaceTicks = 0;
    this.lastRaceTicks = 0;
    this.finishedRace = false;
    this.finishTimeMillis = 0;
    this.mph = 0;
    this.instantMph = 0;
    this.maxMph = 0;
    this.pctComplete = 0;
    this.lastUpdateMs = 0;
    this.tickWindow = 0;
    this.timeWindow = 0;
  }

  updateRaceTicks(ticks, elapsedMs, rollerCircumMm) {
    if (this.finishedRace) return;
    this.lastRaceTicks = this.curRaceTicks;
    this.curRaceTicks = ticks;

    const deltaTicks = this.curRaceTicks - this.lastRaceTicks;
    const deltaMs = elapsedMs - this.lastUpdateMs;
    this.lastUpdateMs = elapsedMs;

    // Average speed: total distance / total time (stable)
    if (this.curRaceTicks > 0 && elapsedMs > 0) {
      const totalDistM = (this.curRaceTicks * rollerCircumMm) / 1000;
      this.mph = (totalDistM / (elapsedMs / 1000)) * 2.237;
    }

    // Instantaneous speed: accumulate ticks and time over a window
    if (deltaMs > 0) {
      this.tickWindow = (this.tickWindow || 0) + deltaTicks;
      this.timeWindow = (this.timeWindow || 0) + deltaMs;

      // Emit a speed reading every ~500ms for stability
      if (this.timeWindow >= 500) {
        if (this.tickWindow > 0) {
          const distM = (this.tickWindow * rollerCircumMm) / 1000;
          this.instantMph = (distM / (this.timeWindow / 1000)) * 2.237;
        } else {
          this.instantMph = 0;
        }
        this.tickWindow = 0;
        this.timeWindow = 0;
      }
    }

    if (this.instantMph > this.maxMph) this.maxMph = this.instantMph;
  }

  getDistanceMeters(rollerCircumMm) {
    return (this.curRaceTicks * rollerCircumMm) / 1000;
  }

  getSpeedKph() {
    return this.mph * 1.60934;
  }

  setFinished(timeMs) {
    this.finishedRace = true;
    this.finishTimeMillis = timeMs;
  }
}

export const RACE_TYPE = { DISTANCE: 0, TIME: 1 };

export class Model {
  constructor() {
    this.numRacers = 2;
    this.raceType = RACE_TYPE.DISTANCE;
    this.raceLengthMeters = 100;
    this.raceTimeSeconds = 60;
    this.rollerDiameterMm = 114.3;
    this.useKph = true;
    this.logRaces = true;
    this.mockMode = false;
    this.falseStartDetection = false;
    this.theme = "dark";

    this.players = [];
    for (let i = 0; i < 4; i++) {
      this.players.push(new PlayerData(i));
    }

    this.hardwareConnected = false;
    this.elapsedRaceMs = 0;

    this.loadSettings();
  }

  get rollerCircumMm() {
    return this.rollerDiameterMm * Math.PI;
  }

  get totalRaceTicks() {
    return Math.round((this.raceLengthMeters * 1000) / this.rollerCircumMm);
  }

  getActivePlayers() {
    return this.players.slice(0, this.numRacers);
  }

  resetPlayers() {
    for (const p of this.players) p.reset();
    this.elapsedRaceMs = 0;
  }

  isRaceFinished() {
    return this.getActivePlayers().every((p) => p.finishedRace);
  }

  formatTime(ms) {
    const totalSec = ms / 1000;
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${String(min).padStart(2, "0")}:${sec.toFixed(1).padStart(4, "0")}`;
  }

  formatSpeed(mph) {
    const val = this.useKph ? mph * 1.60934 : mph;
    return `${val.toFixed(1)} ${this.useKph ? "KPH" : "MPH"}`;
  }

  formatDistance(meters) {
    if (this.useKph) {
      return `${meters.toFixed(1)}m`;
    } else {
      const feet = meters * 3.28084;
      return `${feet.toFixed(1)}ft`;
    }
  }

  saveSettings() {
    const settings = {
      numRacers: this.numRacers,
      raceType: this.raceType,
      raceLengthMeters: this.raceLengthMeters,
      raceTimeSeconds: this.raceTimeSeconds,
      rollerDiameterMm: this.rollerDiameterMm,
      useKph: this.useKph,
      logRaces: this.logRaces,
      mockMode: this.mockMode,
      falseStartDetection: this.falseStartDetection,
      theme: this.theme,
      playerNames: this.players.map((p) => p.name),
      playerColors: this.players.map((p) => p.color),
    };
    localStorage.setItem("sprontz-settings", JSON.stringify(settings));
  }

  loadSettings() {
    try {
      const raw = localStorage.getItem("sprontz-settings");
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.numRacers != null) this.numRacers = s.numRacers;
      if (s.raceType != null) this.raceType = s.raceType;
      if (s.raceLengthMeters != null)
        this.raceLengthMeters = s.raceLengthMeters;
      if (s.raceTimeSeconds != null) this.raceTimeSeconds = s.raceTimeSeconds;
      if (s.rollerDiameterMm != null)
        this.rollerDiameterMm = s.rollerDiameterMm;
      if (s.useKph != null) this.useKph = s.useKph;
      if (s.logRaces != null) this.logRaces = s.logRaces;
      if (s.mockMode != null) this.mockMode = s.mockMode;
      if (s.falseStartDetection != null)
        this.falseStartDetection = s.falseStartDetection;
      if (s.theme != null) this.theme = s.theme;
      if (s.playerNames) {
        s.playerNames.forEach((name, i) => {
          if (this.players[i]) this.players[i].name = name;
        });
      }
      if (s.playerColors) {
        s.playerColors.forEach((color, i) => {
          if (this.players[i]) this.players[i].color = color;
        });
      }
    } catch (e) {
      // ignore corrupt settings
    }
  }
}
