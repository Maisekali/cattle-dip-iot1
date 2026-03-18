// ============================================================
// AcaraSense Pro — ESP8266 NodeMCU
// Receives sensor JSON from Arduino MEGA via Serial
// POSTs to Node.js dashboard server over WiFi
// ============================================================

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <ArduinoJson.h>

// ─── CONFIGURE THESE ────────────────────────────────────────
const char* WIFI_SSID    = "YourWiFiSSID";
const char* WIFI_PASS    = "YourWiFiPassword";
// Find your PC IP: Windows → ipconfig | Mac/Linux → ifconfig
// Look for your local WiFi adapter address e.g. 192.168.1.105
const char* SERVER_IP    = "192.168.1.105";   // <-- YOUR PC IP
const int   SERVER_PORT  = 3000;
// ─────────────────────────────────────────────────────────────

String serverURL;

void setup() {
  Serial.begin(9600);   // Must match MEGA SoftwareSerial baud
  delay(100);
  connectWiFi();
  serverURL = "http://" + String(SERVER_IP) + ":" + SERVER_PORT + "/data";
  Serial.println("ESP8266 ready. Posting to: " + serverURL);
}

void loop() {
  // Receive one line of JSON from Arduino MEGA via Serial
  if (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    line.trim();
    if (line.length() > 0 && line.startsWith("{")) {
      postToServer(line);
    }
  }

  // Reconnect WiFi if dropped
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi dropped — reconnecting...");
    connectWiFi();
  }
}

void postToServer(String jsonPayload) {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClient client;
  HTTPClient http;

  http.begin(client, serverURL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  int httpCode = http.POST(jsonPayload);

  if (httpCode == 200) {
    // Optional: Serial.println("POST OK");
  } else {
    Serial.println("POST failed: " + String(httpCode));
  }
  http.end();
}

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 30) {
    delay(500); tries++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi OK. IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("WiFi FAILED — will retry in loop");
  }
}
