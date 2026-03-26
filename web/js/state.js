export const APP_STATE = {
  RACE: "race",
  ROSTER: "roster",
  SETTINGS: "settings",
};

export const RACE_STATE = {
  STOPPED: "stopped",
  STARTING: "starting",
  COUNTDOWN_3: "countdown_3",
  COUNTDOWN_2: "countdown_2",
  COUNTDOWN_1: "countdown_1",
  COUNTDOWN_GO: "countdown_go",
  RUNNING: "running",
  COMPLETE: "complete",
  FALSE_START: "false_start",
};

export class StateManager {
  constructor() {
    this.appState = APP_STATE.RACE;
    this.raceState = RACE_STATE.STOPPED;
    this.listeners = {
      appState: [],
      raceState: [],
      raceFinished: [],
      racerFinish: [],
      serialConnected: [],
      serialDisconnected: [],
    };
  }

  on(event, fn) {
    if (this.listeners[event]) this.listeners[event].push(fn);
  }

  emit(event, ...args) {
    if (this.listeners[event]) {
      for (const fn of this.listeners[event]) fn(...args);
    }
  }

  setAppState(newState) {
    const old = this.appState;
    this.appState = newState;
    this.emit("appState", newState, old);
  }

  setRaceState(newState) {
    if (newState === this.raceState) return;
    this.raceState = newState;
    this.emit("raceState", newState);
  }
}
