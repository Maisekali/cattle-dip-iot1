# AcaraSense Pro — Setup Guide

## Folder Structure
```
cattle-dip-iot/
├── server.js               ← Node.js server (run this on your PC)
├── dashboard.html          ← Live dashboard (served automatically)
├── package.json
├── arduino_mega/
│   └── arduino_mega.ino    ← Upload to Arduino MEGA
└── esp8266_firmware/
    └── esp8266_firmware.ino ← Upload to ESP8266
```

---

## STEP 1 — Install Node.js dependencies

```bash
cd cattle-dip-iot
npm install
```

---

## STEP 2 — Find your PC's local IP address

- **Windows**: Open CMD → type `ipconfig` → look for "IPv4 Address" under your WiFi adapter
  e.g. `192.168.1.105`
- **Mac/Linux**: Open Terminal → type `ifconfig` → look for `inet` under `en0` or `wlan0`

---

## STEP 3 — Configure the ESP8266 firmware

Open `esp8266_firmware/esp8266_firmware.ino` and edit these lines:

```cpp
const char* WIFI_SSID = "YourWiFiSSID";       // Your WiFi name
const char* WIFI_PASS = "YourWiFiPassword";    // Your WiFi password
const char* SERVER_IP = "192.168.1.105";       // Your PC IP from Step 2
```

Upload to ESP8266 using Arduino IDE.

---

## STEP 4 — Configure email alerts in server.js

Open `server.js` and edit the CONFIG block:

```js
EMAIL_FROM : 'your_sender@gmail.com',    // Gmail account to send FROM
EMAIL_TO   : 'brayomaisiba@gmail.com',   // Already set — your email
EMAIL_PASS : 'your_gmail_app_password',  // Gmail App Password (NOT your login password)
```

### How to get a Gmail App Password:
1. Go to myaccount.google.com
2. Security → 2-Step Verification (enable it if not already)
3. Security → App Passwords
4. Select app: "Mail", device: "Other" → type "AcaraSense"
5. Copy the 16-character password → paste into EMAIL_PASS

---

## STEP 5 — Upload Arduino MEGA firmware

Open `arduino_mega/arduino_mega.ino` in Arduino IDE and upload to your MEGA.

**Wiring:**
| Component     | MEGA Pin |
|---------------|----------|
| DS18B20 data  | D2       |
| HC-SR04 TRIG  | D7       |
| HC-SR04 ECHO  | D8       |
| Chemical Sens | A0       |
| ESP8266 TX    | D10 (RX) |
| ESP8266 RX    | D11 (TX) |
| Buzzer        | D13      |
| Animal Button | D22      |

**HC-SR04 placement:** Mount sensor at the TOP of the tank pointing DOWN.
The sensor measures the distance to the liquid surface. Empty tank = large distance.

---

## STEP 6 — Start the server

```bash
cd cattle-dip-iot
npm start
```

You will see:
```
  ╔══════════════════════════════════════════╗
  ║   AcaraSense Pro — Server Running        ║
  ║   Dashboard  →  http://localhost:3000    ║
  ║   ESP8266 POST → http://192.168.x.x:3000/data ║
  ╚══════════════════════════════════════════╝
```

---

## STEP 7 — Open the dashboard

Open your browser and go to: **http://localhost:3000**

The dashboard will show "Waiting for hardware..." until the first POST arrives from the ESP8266.
Once data flows, everything updates live in real time.

---

## JSON Format (ESP8266 → Server)

The ESP8266 must POST to `http://<PC_IP>:3000/data` with:

```json
{"temp": 24.5, "level": 72.3, "conc": 1.45, "animals": 12}
```

| Field   | Type  | Description                        |
|---------|-------|------------------------------------|
| temp    | float | Temperature in °C (DS18B20)        |
| level   | float | Tank level 0–100% (HC-SR04)        |
| conc    | float | Acaricide concentration % (0–3.0)  |
| animals | int   | Animals dipped this session        |

---

## Alert Thresholds

| Condition         | Threshold    | Action               |
|-------------------|--------------|----------------------|
| Tank LOW          | level < 25%  | Warning email        |
| Tank CRITICAL     | level < 15%  | Critical email       |
| Temperature HIGH  | temp > 30°C  | Dashboard warning    |
| Conc. out of range| < 1% or > 2% | Dashboard warning    |

Emails have a 30-minute cooldown to avoid flooding your inbox.

---

## Testing Without Hardware

You can simulate sensor readings using curl to test the server:

```bash
curl -X POST http://localhost:3000/data \
  -H "Content-Type: application/json" \
  -d '{"temp":24.5,"level":18.2,"conc":1.45,"animals":12}'
```

The dashboard will update immediately.
