const STORAGE_KEY = "sprontz-race-logs";
const RACE_METADATA_HEADERS = [
  "timestamp",
  "event",
  "race_type",
  "race_length",
];

const racerHeaders = (racerCount) => [
  ...RACE_METADATA_HEADERS,
  ...Array.from({ length: racerCount }, (_, i) => {
    const racer = `racer_${i + 1}`;
    return [
      `${racer}_name`,
      `${racer}_ticks`,
      `${racer}_time_ms`,
      `${racer}_distance_m`,
      `${racer}_top_mph`,
      `${racer}_false_start`,
    ];
  }).flat(),
];

const maxLoggedRacers = (logs) => {
  let maxRacers = 0;
  for (const entry of logs) {
    for (let i = 1; i <= 4; i++) {
      if (`racer_${i}_name` in entry) maxRacers = i;
    }
  }
  return maxRacers;
};

export class CsvLogger {
  constructor(model) {
    this.model = model;
    this.logs = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  }

  log(event, fields) {
    const entry = {
      timestamp: new Date().toISOString(),
      event,
      ...fields,
    };
    this.logs.push(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs));
  }

  logRaceFinish() {
    const players = this.model.getActivePlayers();
    const fields = {};
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      fields[`racer_${i + 1}_name`] = p.name;
      fields[`racer_${i + 1}_ticks`] = p.curRaceTicks;
      fields[`racer_${i + 1}_time_ms`] = p.finishTimeMillis;
      fields[`racer_${i + 1}_distance_m`] = p
        .getDistanceMeters(this.model.rollerCircumMm)
        .toFixed(2);
      fields[`racer_${i + 1}_top_mph`] = p.maxMph.toFixed(2);
      fields[`racer_${i + 1}_false_start`] = p.falseStart;
    }
    fields.race_type = this.model.raceType === 0 ? "distance" : "time";
    fields.race_length =
      this.model.raceType === 0
        ? `${this.model.raceLengthMeters}m`
        : `${this.model.raceTimeSeconds}s`;
    this.log("RACE_FINISH", fields);
  }

  toCsv() {
    if (this.logs.length === 0) return "";

    const headers = racerHeaders(maxLoggedRacers(this.logs));
    const rows = [headers.join(",")];
    for (const entry of this.logs) {
      const row = headers.map((h) => {
        const val = entry[h] ?? "";
        // Quote if contains comma or quote
        const str = String(val);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
      rows.push(row.join(","));
    }
    return rows.join("\n");
  }

  download() {
    const csv = this.toCsv();
    if (!csv) return;

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const date = new Date().toISOString().slice(0, 10);
    a.download = `${date}_sprontz_race_log.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  getSummary() {
    if (this.logs.length === 0) return "No races logged";
    const earliest = new Date(this.logs[0].timestamp);
    const ago = this.timeAgo(earliest);
    return `${this.logs.length} race${this.logs.length === 1 ? "" : "s"} since ${ago}`;
  }

  timeAgo(date) {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  }

  clear() {
    this.logs = [];
    localStorage.removeItem(STORAGE_KEY);
  }
}
