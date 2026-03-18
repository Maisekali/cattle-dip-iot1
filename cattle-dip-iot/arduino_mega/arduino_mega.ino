// ============================================================
// AcaraSense Pro — Arduino MEGA 2560
// Reads DS18B20, HC-SR04, Chemical Sensor
// Sends JSON via SoftwareSerial to ESP8266 every 5 seconds
// ============================================================

#include <OneWire.h>
#include <DallasTemperature.h>
#include <SoftwareSerial.h>

// ─── PIN DEFINITIONS ────────────────────────────────────────
#define ONE_WIRE_BUS    2      // DS18B20 data pin
#define TRIG_PIN        7      // HC-SR04 trigger
#define ECHO_PIN        8      // HC-SR04 echo
#define CHEM_PIN        A0     // Chemical concentration (analog)
#define ESP_RX_PIN      10     // SoftwareSerial RX (connects to ESP TX)
#define ESP_TX_PIN      11     // SoftwareSerial TX (connects to ESP RX)
#define BUZZER_PIN      13     // Alert buzzer
#define ANIMAL_BTN      22     // Button to count each animal (active LOW)

// ─── THRESHOLDS ─────────────────────────────────────────────
#define TANK_DEPTH_CM   100.0
#define LOW_LEVEL       25.0
#define CRITICAL_LEVEL  15.0
#define CONC_MIN        1.0
#define CONC_MAX        2.0
#define TEMP_MAX        30.0
#define SEND_INTERVAL   5000   // ms between sends

// ─── OBJECTS ────────────────────────────────────────────────
OneWire           oneWire(ONE_WIRE_BUS);
DallasTemperature tempSensor(&oneWire);
SoftwareSerial    espSerial(ESP_RX_PIN, ESP_TX_PIN);

// ─── STATE ──────────────────────────────────────────────────
float         temperature, tankLevel, chemConc;
int           animalCount  = 0;
bool          btnLastState = HIGH;
unsigned long lastSend     = 0;

void setup() {
  Serial.begin(115200);       // Debug serial to PC
  espSerial.begin(9600);      // MUST match ESP8266 Serial.begin

  tempSensor.begin();
  pinMode(TRIG_PIN,  OUTPUT);
  pinMode(ECHO_PIN,  INPUT);
  pinMode(BUZZER_PIN,OUTPUT);
  pinMode(ANIMAL_BTN,INPUT_PULLUP);

  Serial.println("AcaraSense Pro MEGA ready");
}

void loop() {
  // Count animals via button (debounced)
  bool btnNow = digitalRead(ANIMAL_BTN);
  if (btnNow == LOW && btnLastState == HIGH) {
    animalCount++;
    delay(50);  // debounce
  }
  btnLastState = btnNow;

  // Read & send on interval
  if (millis() - lastSend >= SEND_INTERVAL) {
    lastSend = millis();

    temperature = readTemperature();
    tankLevel   = readTankLevel();
    chemConc    = readChemConc();

    handleBuzzer();
    sendJSON();

    // Debug output
    Serial.print("Temp:"); Serial.print(temperature,1);
    Serial.print(" Level:"); Serial.print(tankLevel,1);
    Serial.print(" Conc:"); Serial.print(chemConc,2);
    Serial.print(" Animals:"); Serial.println(animalCount);
  }
}

// ─── DS18B20 ────────────────────────────────────────────────
float readTemperature() {
  tempSensor.requestTemperatures();
  float t = tempSensor.getTempCByIndex(0);
  if (t == DEVICE_DISCONNECTED_C) { Serial.println("DS18B20 ERR"); return -999; }
  return t;
}

// ─── HC-SR04 ────────────────────────────────────────────────
float readTankLevel() {
  digitalWrite(TRIG_PIN, LOW);  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long dur = pulseIn(ECHO_PIN, HIGH, 30000UL);
  if (dur == 0) return -1;   // timeout = sensor error
  float distCm  = dur * 0.034 / 2.0;
  float fluidCm = TANK_DEPTH_CM - distCm;
  return constrain((fluidCm / TANK_DEPTH_CM) * 100.0, 0, 100);
}

// ─── CHEMICAL SENSOR ────────────────────────────────────────
float readChemConc() {
  int raw = analogRead(CHEM_PIN);
  // Map 0–1023 → 0.0–3.0% — calibrate these values to your sensor!
  return (raw / 1023.0) * 3.0;
}

// ─── BUZZER ─────────────────────────────────────────────────
void handleBuzzer() {
  if (tankLevel >= 0 && tankLevel <= CRITICAL_LEVEL) {
    // Fast beep for critical
    digitalWrite(BUZZER_PIN, HIGH); delay(100);
    digitalWrite(BUZZER_PIN, LOW);  delay(100);
  } else if (tankLevel > CRITICAL_LEVEL && tankLevel <= LOW_LEVEL) {
    // Single beep for low
    digitalWrite(BUZZER_PIN, HIGH); delay(300);
    digitalWrite(BUZZER_PIN, LOW);
  } else {
    digitalWrite(BUZZER_PIN, LOW);
  }
}

// ─── SEND JSON TO ESP8266 ───────────────────────────────────
// Dashboard expects: {"temp":24.5,"level":72.3,"conc":1.45,"animals":12}
void sendJSON() {
  espSerial.print("{");
  espSerial.print("\"temp\":");    espSerial.print(temperature, 2);
  espSerial.print(",\"level\":"); espSerial.print(tankLevel,   1);
  espSerial.print(",\"conc\":");  espSerial.print(chemConc,    2);
  espSerial.print(",\"animals\":"); espSerial.print(animalCount);
  espSerial.println("}");
}
