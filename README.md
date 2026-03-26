# [sprontz.app](https://sprontz.app)

A browser-based Goldsprint app. Connects to a Opensprints/SilverSprint compatible Arduino controller over USB using the [Web Serial API](https://developer.chrome.com/docs/capabilities/serial) -- no native app or drivers needed.

Can be installed for off-line use as a [progressive web app](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps).

## Requirements

- **Browser**: Chrome or Edge (Web Serial API required)
- **Hardware**: Any SilverSprint-compatible Arduino controller, or the `ss_mock` Arduino sketch from `../Arduino/ss_mock` for testing without real sensors

## Quick Start

Serve the files over HTTP (Web Serial requires a secure context):

```
cd web
python3 -m http.server 8000
```

Open `http://localhost:8000` in Chrome.

## Serial Protocol

The app speaks the same protocol as SilverSprint firmware.

Serial runs at 115200 baud, 8N1.

### Host -> Arduino

| Command      | Description                         |
| ------------ | ----------------------------------- |
| `g`          | Start race (triggers countdown)     |
| `s`          | Stop race                           |
| `v`          | Request firmware version            |
| `d`          | Set distance race mode              |
| `x`          | Set time trial race mode            |
| `l<TICKS>`   | Set race length in ticks            |
| `t<SECONDS>` | Set race duration in seconds        |
| `m`          | Toggle mock mode (simulate sensors) |

Commands are newline-terminated (`\n`). The firmware also accepts `\r\n`.

### Arduino -> Host

| Message                          | Description                                 |
| -------------------------------- | ------------------------------------------- |
| `V:<VERSION>`                    | Firmware version (e.g. `SS_v0.1.7`)         |
| `CD:<N>`                         | Countdown tick (3, 2, 1, 0)                 |
| `R:<T0>,<T1>,<T2>,<T3>,<MILLIS>` | Race update -- ticks per racer + elapsed ms |
| `<N>F:<MILLIS>`                  | Racer N finished at MILLIS                  |
| `FS:<N>`                         | False start by racer N                      |
| `L:<TICKS>`                      | Race length confirmed                       |
| `M:<ON\|OFF>`                    | Mock mode toggled                           |
| `ERROR:<MSG>`                    | Invalid command received                    |

Responses are terminated with `\r\n` (Arduino `Serial.println`).

### State Machine

**Race states**: `STOPPED` -> `STARTING` -> `COUNTDOWN_3` -> `COUNTDOWN_2` -> `COUNTDOWN_1` -> `COUNTDOWN_GO` -> `RUNNING` -> `COMPLETE`

The timer starts at `COUNTDOWN_GO`, matching Arduino behavior. The race can be stopped from any active state.

### Settings Persistence

All settings (roller diameter, race type/length, units, number of racers, player names) are persisted to `localStorage` under the key `sprontz-settings`. Race logs are stored separately under `sprontz-race-logs`.

## Tick-to-Distance Math

Each sensor tick = one roller revolution.

```
roller_circumference_m = roller_diameter_mm * PI / 1000
distance_m = ticks * roller_circumference_m
total_race_ticks = race_distance_m / roller_circumference_m
speed_mph = (distance_m / elapsed_s) * 2.237
```

Default roller diameter: 114.3mm (4.5 inches).
