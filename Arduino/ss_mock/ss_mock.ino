/*
 * Mock SilverSprint controller.
 *
 * No sensors needed -- generates fake racer data so you can test the app
 * (including Web Serial) with just an Arduino plugged in over USB.
 *
 * Behaviour matches ss_basic with mockMode permanently on:
 *   - Responds to the same serial protocol (v, g, s, m, l, t, d, x)
 *   - Simulates 4 racers at randomised speeds
 *   - Countdown, race updates, and finish messages are identical
 */

#define VERSION "SS_MOCK_v0.1.0"
#define MAX_RACERS 4

// -- Status LED --
int statusLEDPin = 13;
long statusBlinkInterval = 250;
int lastStatusLEDValue = LOW;
unsigned long previousStatusBlinkMillis = 0;

// -- Race state --
boolean raceStarted = false;
boolean raceStarting = false;
unsigned long raceStartMillis;
unsigned long currentTimeMillis;

// -- Serial command parsing --
char val = 0;
char charBuff[8];
unsigned int charBuffPos = 0;
bool isReceivingRaceLength = false;
bool isReceivingTimeLength = false;

// -- Race config --
int raceLengthTicks = 20;
int raceLengthSecs = 60;
bool bRaceTypeDistance = true;

// -- Countdown --
unsigned long lastCountDownMillis;
int lastCountDown;

// -- Update throttle --
int updateInterval = 10;
unsigned long lastUpdateMillis = 0;

// -- Per-racer mock state --
unsigned long racerTicks[MAX_RACERS] = {0, 0, 0, 0};
unsigned long racerFinishTimeMillis[MAX_RACERS] = {0, 0, 0, 0};
float mockSpeedsKph[MAX_RACERS];
float racerTickRemainder[MAX_RACERS] = {0, 0, 0, 0};
unsigned long lastTickMillis = 0;

float mockRandomFloat(float minVal, float maxVal) {
    return minVal + (random(10001) / 10000.0) * (maxVal - minVal);
}

void setup()
{
    Serial.begin(115200);
    pinMode(statusLEDPin, OUTPUT);
    randomSeed(analogRead(A0));
    
}

void blinkLED()
{
    if (millis() - previousStatusBlinkMillis > statusBlinkInterval) {
        previousStatusBlinkMillis = millis();
        lastStatusLEDValue = !lastStatusLEDValue;
        digitalWrite(statusLEDPin, lastStatusLEDValue);
    }
}

void checkSerial()
{
    if (Serial.available() > 0) {
        val = Serial.read();
        if (val == '\r' || val == '\n') {
            if (isReceivingRaceLength) {
                isReceivingRaceLength = false;
                charBuff[charBuffPos] = '\0';
                raceLengthTicks = atoi(charBuff);
                Serial.print("L:");
                Serial.println(raceLengthTicks);
            } else if (isReceivingTimeLength) {
                isReceivingTimeLength = false;
                charBuff[charBuffPos] = '\0';
                raceLengthSecs = atoi(charBuff);
            }
            return;
        }

        if (isReceivingRaceLength || isReceivingTimeLength) {
            if (charBuffPos < sizeof(charBuff) - 1) {
                charBuff[charBuffPos] = val;
                charBuffPos++;
            }
        } else {
            if (val == 'l') {
                memset(charBuff, 0, sizeof(charBuff));
                charBuffPos = 0;
                isReceivingRaceLength = true;
            }
            else if (val == 't') {
                memset(charBuff, 0, sizeof(charBuff));
                charBuffPos = 0;
                isReceivingTimeLength = true;
            }
            else if (val == 'v') {
                Serial.print("V:");
                Serial.println(VERSION);
            }
            else if (val == 'g') {
                for (int i = 0; i < MAX_RACERS; i++) {
                    racerTicks[i] = 0;
                    racerFinishTimeMillis[i] = 0;
                    mockSpeedsKph[i] = mockRandomFloat(30.0, 55.0);
                }
                raceStarting = true;
                raceStarted = false;
                lastCountDown = 4;
                lastCountDownMillis = millis();
            }
            else if (val == 'm') {
                Serial.println("M:ON");
            }
            else if (val == 's') {
                raceStarted = false;
                raceStarting = false;
            }
            else if (val == 'x') {
                bRaceTypeDistance = false;
            }
            else if (val == 'd') {
                bRaceTypeDistance = true;
            }
            else {
                Serial.print("ERROR:Command invalid ");
                if (val > 32 && val < 127) {
                    Serial.println(char(val));
                } else {
                    Serial.print("ERROR:Unprintable ASCII code ");
                    Serial.println(val);
                }
            }
        }
    }
}

void raceStart()
{
    raceStartMillis = millis();
    lastUpdateMillis = 0;
    lastTickMillis = 0;
    raceStarting = false;
    raceStarted = true;

    for (int i = 0; i < MAX_RACERS; i++) {
        racerTicks[i] = 0;
        racerFinishTimeMillis[i] = 0;
        racerTickRemainder[i] = 0;
    }
}

void updateRacerTicks()
{
    // Accumulate ticks incrementally so jitter can't make racers go backwards.
    // 1 km/h = 0.2778 mm/ms, roller circumference = 114.3mm * PI
    unsigned long dtMs = currentTimeMillis - lastTickMillis;
    lastTickMillis = currentTimeMillis;
    if (dtMs == 0) return;

    for (int i = 0; i < MAX_RACERS; i++) {
        if (racerFinishTimeMillis[i] != 0) continue;

        float jitter = mockRandomFloat(0.92, 1.08);
        float deltaTicks = dtMs * mockSpeedsKph[i] * jitter * 0.2778 / (114.3 * PI);
        racerTickRemainder[i] += deltaTicks;
        unsigned long whole = (unsigned long)racerTickRemainder[i];
        racerTickRemainder[i] -= whole;
        racerTicks[i] += whole;
    }
}

void printRacerUpdate()
{
    if (currentTimeMillis - lastUpdateMillis > updateInterval) {
        lastUpdateMillis = currentTimeMillis;

        Serial.print("R:");
        for (int i = 0; i < MAX_RACERS; i++) {
            Serial.print(racerTicks[i], DEC);
            Serial.print(",");
        }
        Serial.println(currentTimeMillis, DEC);
    }
}

void checkDistanceBased()
{
    bool bFinished = true;
    for (int i = 0; i < MAX_RACERS; i++) {
        if (racerFinishTimeMillis[i] == 0 && racerTicks[i] >= raceLengthTicks) {
            racerFinishTimeMillis[i] = currentTimeMillis;
            Serial.print(i);
            Serial.print("F:");
            Serial.println(racerFinishTimeMillis[i], DEC);
        }
        if (racerFinishTimeMillis[i] == 0) {
            bFinished = false;
        }
    }
    if (bFinished) {
        raceStarting = false;
        raceStarted = false;
    }
}

void checkTimeBased()
{
    if (currentTimeMillis > (unsigned long)raceLengthSecs * 1000) {
        for (int i = 0; i < MAX_RACERS; i++) {
            Serial.print(i);
            Serial.print("F:");
            Serial.println((unsigned long)raceLengthSecs * 1000, DEC);
        }
        raceStarting = false;
        raceStarted = false;
    }
}

void loop()
{
    blinkLED();
    checkSerial();

    if (raceStarting) {
        if ((millis() - lastCountDownMillis) > 1000) {
            lastCountDown -= 1;
            lastCountDownMillis = millis();
            Serial.print("CD:");
            Serial.println(lastCountDown, DEC);
        }
        if (lastCountDown == 0) {
            raceStart();
        }
    }

    if (raceStarted) {
        currentTimeMillis = millis() - raceStartMillis;
        updateRacerTicks();

        if (bRaceTypeDistance) {
            checkDistanceBased();
        } else {
            checkTimeBased();
        }

        printRacerUpdate();
    }
}
