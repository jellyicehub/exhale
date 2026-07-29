// ============================================================
//  EXHALE — Breath Acidity Estimator (v2 — Wi-Fi + Firebase)
//  Hardware : ESP32-C3 SuperMini
//             SCD41  CO2/Temp/Humidity sensor (I2C)
//             SSD1306 0.91" OLED display     (I2C)
//             One momentary push-button
//
//  Author   : Exhale Project
//  Purpose  : Capture an exhale breath sample via a mouthpiece,
//             compare it against an ambient baseline, display a
//             calculated Acidity Index (0-100), then upload the
//             reading to Firebase Firestore via Wi-Fi.
//
//  Libraries needed (install via Arduino Library Manager):
//    . Adafruit SSD1306          (OLED driver)
//    . Adafruit GFX Library      (dependency of SSD1306)
//    . Sensirion I2C SCD4x       (SCD41 driver)
//    . sensirion-arduino-core    (dependency of SCD4x)
//    . ArduinoJson               (by Benoit Blanchon)
//
//  Built-in (ESP32 Arduino Core — no install needed):
//    . WiFi.h
//    . HTTPClient.h
// ============================================================

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <SensirionI2cScd4x.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <WiFiManager.h>

// ============================================================
//  PIN ASSIGNMENTS — ESP32-C3 SuperMini
// ============================================================
#define PIN_SDA        4    // I2C SDA (shared by OLED and SCD41)
#define PIN_SCL        5    // I2C SCL (shared by OLED and SCD41)
#define PIN_BUTTON     9    // Momentary push-button (active LOW, internal pull-up)

// ============================================================
//  OLED CONFIGURATION
// ============================================================
#define OLED_WIDTH     128
#define OLED_HEIGHT    32
#define OLED_ADDRESS   0x3C
#define OLED_RESET     -1

// ============================================================
// ============================================================
/*
EXHALE Acidity Index

This is an experimental engineering index derived from
SCD41 CO2, temperature, and relative humidity readings.

The index is NOT a direct measurement of physiological pH
and is NOT a clinically validated diagnostic measurement.

The coefficients used in this formula are initial prototype
coefficients and must be experimentally calibrated against
appropriate reference measurements before scientific or
medical interpretation.

Reference pH is a mathematical reference scale mapped from
the Acidity Index. It is NOT directly measured by the SCD41.
*/
// ============================================================
//  GLOBAL BASELINE VARIABLES (Personalized)
// ============================================================
float baselineCO2 = 40000.0;
float baselineTemperature = 34.0;
float baselineHumidity = 90.0;

// ============================================================
//  BASELINE / SAMPLING SETTINGS
// ============================================================
#define BASELINE_SAMPLES         10    // ambient readings at boot
#define BASELINE_INTERVAL_MS   1500    // wait between baseline samples
#define BREATH_SAMPLES            4    // 5 valid SCD41 readings for average (5 x 5.2s = 26s)
#define SENSOR_SINGLE_SHOT_MS  5200    // SCD41 single-shot measurement time

// ============================================================
//  BUTTON DEBOUNCE
// ============================================================
#define DEBOUNCE_MS    50   // ms to wait before confirming button press

// ============================================================
//  RESULT DISPLAY DURATION
// ============================================================
#define RESULT_DISPLAY_MS  8000UL  // ms to show result before returning to IDLE

// ============================================================
//  WI-FI + FIREBASE CONFIG
//  Credentials are now safely stored in secrets.h (ignored by Git)
// ============================================================
#include "secrets.h"
#define DEVICE_ID        "exhale-device-01"

// Supabase REST base URL
#define REST_BASE        SUPABASE_URL "/rest/v1"

// Wi-Fi connect timeout
#define WIFI_TIMEOUT_MS  10000

// ============================================================
//  GLOBAL OBJECTS
// ============================================================
Adafruit_SSD1306  oled(OLED_WIDTH, OLED_HEIGHT, &Wire, OLED_RESET);
SensirionI2cScd4x scd41;

// ============================================================
//  AMBIENT BASELINE
// ============================================================
struct Baseline {
  float co2  = 415.0f;
  float temp = 25.0f;
  float rh   = 50.0f;
  bool  valid = false;
};
Baseline ambient;

// ============================================================
//  LAST READING
// ============================================================
struct Reading {
  float co2;
  float temp;
  float rh;
  float acidityIndex;
  float estimatedPh;
  bool  valid = false;
};
Reading lastReading;

// ============================================================
//  STATE MACHINE
// ============================================================
enum DeviceState {
  STATE_BOOT,
  STATE_CALIBRATING,
  STATE_IDLE,
  STATE_SAMPLING,
  STATE_UPLOADING,
  STATE_DISPLAY_RESULT,
  STATE_ERROR
};
DeviceState deviceState = STATE_BOOT;

// ============================================================
//  BUTTON STATE
// ============================================================
bool buttonPressed = false;  // set true by isButtonPressed(), consumed by loop()

// ============================================================
//  RESULT DISPLAY TIMESTAMP
// ============================================================
uint32_t resultShownAt = 0;  // millis() when last result was first shown

// ============================================================
//  FORWARD DECLARATIONS
// ============================================================
bool  initSCD41();
bool  takeSingleShot(float &co2, float &temp, float &rh);
void  calibrateBaseline();
void  captureBreath();
float calcAcidityIndex(float co2, float temp, float rh, float &outPh);
bool  isButtonPressed();
bool  connectWiFi();
String fetchActiveUser();
bool  uploadReading(const Reading &r, const String &userId);
void  displaySplash();
void  displayCalibrating(int step, int total);
void  displayIdle();
void  displaySampling(int step, int total);
void  displayResult(const Reading &r);
void  displayUploading();
void  displayUploadSuccess(bool success);
void  displayError(const char *msg);
void  displayWiFiSetup();
void  pingSupabase();

// ============================================================
//  SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  Serial.println("\n=== EXHALE STARTING ===");

  // Button with internal pull-up (active LOW)
  pinMode(PIN_BUTTON, INPUT_PULLUP);

  // I2C bus — shared by OLED and SCD41
  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(100000); // 100 kHz for compatibility

  // --- OLED init ---
  if (!oled.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    Serial.println("OLED init FAILED — continuing without display");
  } else {
    oled.setTextColor(SSD1306_WHITE);
    displaySplash();
    delay(1800);
  }

  // --- SCD41 init ---
  if (!initSCD41()) {
    deviceState = STATE_ERROR;
    displayError("SCD41 not found");
    Serial.println("SCD41 init FAILED");
    return;
  }

  // --- Wi-Fi connect ---
  connectWiFi();   // non-fatal: device works offline if Wi-Fi unavailable

  // --- Ambient baseline calibration ---
  deviceState = STATE_CALIBRATING;
  calibrateBaseline();

  deviceState = STATE_IDLE;
  displayIdle();

  // Flush any button presses that may have occurred during calibration.
  while (digitalRead(PIN_BUTTON) == LOW) { delay(10); }
  delay(DEBOUNCE_MS);

  Serial.println("Ready. Press button to read acidity.");
}

// ============================================================
//  MAIN LOOP
//  Flow: IDLE -> press button -> SAMPLING -> UPLOADING
//        -> DISPLAY_RESULT -> (timeout) -> IDLE
// ============================================================

// Heartbeat: print raw button pin state every N milliseconds while IDLE
#define BTN_DEBUG_INTERVAL_MS 2000UL
uint32_t lastBtnDebugMs = 0;

// Cloud Ping: send heartbeat to Supabase every 60 seconds
#define PING_INTERVAL_MS 60000UL
uint32_t lastPingMs = 0;

void loop() {
  if (deviceState == STATE_ERROR) {
    delay(1000);
    return;
  }

  // --- IDLE: wait for a confirmed button press ---
  if (deviceState == STATE_IDLE) {

    // --- Button debug heartbeat (every 2 s) ---
    if (millis() - lastBtnDebugMs >= BTN_DEBUG_INTERVAL_MS) {
      lastBtnDebugMs = millis();
      int rawPin = digitalRead(PIN_BUTTON);
      Serial.printf("[IDLE] GPIO%d = %s (%d)  — press button to sample\n",
                    PIN_BUTTON,
                    rawPin == LOW ? "LOW (PRESSED)" : "HIGH (idle)",
                    rawPin);
    }

    // --- Cloud ping heartbeat (every 60 s) ---
    if (millis() - lastPingMs >= PING_INTERVAL_MS) {
      lastPingMs = millis();
      if (WiFi.status() == WL_CONNECTED) {
        pingSupabase();
      }
    }

    if (isButtonPressed()) {
      Serial.println("[IDLE] Button accepted -> entering SAMPLING state.");
      deviceState = STATE_SAMPLING;
      captureBreath();

      if (lastReading.valid) {
        deviceState = STATE_DISPLAY_RESULT;
        resultShownAt = millis();
        
        Serial.println("\n================================");
        Serial.println("EXHALE MEASUREMENT");
        Serial.println("==================");
        Serial.println();
        Serial.printf("CO2: %.0f ppm\n", lastReading.co2);
        Serial.printf("Temperature: %.1f C\n", lastReading.temp);
        Serial.printf("Humidity: %.1f %%\n", lastReading.rh);
        Serial.println("----------------");
        Serial.println();
        Serial.printf("Baseline CO2: %.0f ppm\n", baselineCO2);
        Serial.printf("Baseline Temp: %.1f C\n", baselineTemperature);
        Serial.printf("Baseline RH: %.1f %%\n", baselineHumidity);
        Serial.println("-------------------");
        Serial.println();
        Serial.printf("Acidity Index: %.1f\n", lastReading.acidityIndex);
        Serial.printf("Reference pH: %.2f\n", lastReading.estimatedPh);
        // We will define getAcidityClassification below
        Serial.printf("Classification: %s\n", getAcidityClassification(lastReading.acidityIndex).c_str());
        Serial.println("===============================\n");

        displayResult(lastReading);
      } else {
        Serial.println("[IDLE] captureBreath returned no valid data. Back to IDLE.");
        deviceState = STATE_IDLE;
        displayIdle();
      }
    }
  }

  // --- DISPLAY_RESULT: auto-return to IDLE after timeout ---
  if (deviceState == STATE_DISPLAY_RESULT) {
    if ((millis() - resultShownAt) >= RESULT_DISPLAY_MS) {
      deviceState = STATE_IDLE;
      displayIdle();
      Serial.println("[RESULT] Timeout -> returned to IDLE.");
      return;
    }
    // Allow an early button press to skip back to IDLE immediately
    if (isButtonPressed()) {
      Serial.println("[RESULT] Button pressed early -> returned to IDLE.");
      deviceState = STATE_IDLE;
      displayIdle();
    }
  }
}

// ============================================================
//  SCD41 INITIALISATION
// ============================================================
bool initSCD41() {
  scd41.begin(Wire, SCD41_I2C_ADDR_62);

  scd41.stopPeriodicMeasurement();
  delay(500);

  scd41.wakeUp();
  delay(30);

  uint16_t err = scd41.reinit();
  if (err != 0) {
    Serial.printf("SCD41 reinit warning: 0x%04X\n", err);
  }

  uint64_t serialNumber = 0;
  err = scd41.getSerialNumber(serialNumber);
  if (err != 0) {
    Serial.printf("SCD41 getSerialNumber failed: 0x%04X\n", err);
    return false;
  }
  Serial.printf("SCD41 S/N: 0x%012llX\n", serialNumber);
  return true;
}

// ============================================================
//  SINGLE-SHOT MEASUREMENT
// ============================================================
bool takeSingleShot(float &co2, float &temp, float &rh) {
  uint16_t err = scd41.measureSingleShot();
  if (err != 0) {
    Serial.printf("measureSingleShot error: 0x%04X\n", err);
    return false;
  }

  delay(SENSOR_SINGLE_SHOT_MS);

  bool dataReady = false;
  err = scd41.getDataReadyStatus(dataReady);
  if (err != 0 || !dataReady) {
    Serial.printf("Data not ready err=0x%04X ready=%d\n", err, (int)dataReady);
    return false;
  }

  uint16_t rawCo2 = 0;
  err = scd41.readMeasurement(rawCo2, temp, rh);
  if (err != 0) {
    Serial.printf("readMeasurement error: 0x%04X\n", err);
    return false;
  }

  co2 = (float)rawCo2;

  if (co2 < 300.0f || co2 > 40000.0f) {
    Serial.printf("CO2 out of range: %.0f ppm\n", co2);
    return false;
  }

  return true;
}

// ============================================================
//  AMBIENT BASELINE CALIBRATION (boot)
// ============================================================
void calibrateBaseline() {
  Serial.println("Calibrating ambient baseline...");
  float sumCo2 = 0, sumTemp = 0, sumRh = 0;
  int   good   = 0;

  for (int i = 0; i < BASELINE_SAMPLES; i++) {
    displayCalibrating(i + 1, BASELINE_SAMPLES);
    float co2, temp, rh;
    if (takeSingleShot(co2, temp, rh)) {
      sumCo2  += co2;
      sumTemp += temp;
      sumRh   += rh;
      good++;
      Serial.printf("  [%d/%d] CO2=%.0f Temp=%.1f RH=%.1f\n",
                    i + 1, BASELINE_SAMPLES, co2, temp, rh);
    } else {
      Serial.printf("  [%d/%d] read failed, skipping\n", i + 1, BASELINE_SAMPLES);
    }
  }

  if (good == 0) {
    Serial.println("WARNING: No baseline readings — using defaults.");
    ambient.valid = false;
  } else {
    ambient.co2   = sumCo2  / good;
    ambient.temp  = sumTemp / good;
    ambient.rh    = sumRh   / good;
    ambient.valid = true;
    Serial.printf("Baseline  CO2:%.0f  Temp:%.1f  RH:%.1f\n",
                  ambient.co2, ambient.temp, ambient.rh);
  }
}

// ============================================================
//  BREATH SAMPLE CAPTURE + FIREBASE UPLOAD
// ============================================================
void captureBreath() {
  Serial.println("Capturing breath sample...");
  float sumCo2 = 0, sumTemp = 0, sumRh = 0;
  int   good   = 0;

  for (int i = 0; i < BREATH_SAMPLES; i++) {
    displaySampling(i + 1, BREATH_SAMPLES);

    float co2, temp, rh;
    if (takeSingleShot(co2, temp, rh)) {
      good++;
      Serial.printf("  [%d/%d] CO2=%.0f Temp=%.1f RH=%.1f\n",
                    i + 1, BREATH_SAMPLES, co2, temp, rh);
      sumCo2  += co2;
      sumTemp += temp;
      sumRh   += rh;
    } else {
      Serial.printf("  [%d/%d] read failed\n", i + 1, BREATH_SAMPLES);
    }
  }

  if (good == 0) {
    lastReading.valid = false;
    displayError("INVALID DATA");
    delay(2000);
    return;
  }

  float avgCo2  = sumCo2 / good;
  float avgTemp = sumTemp / good;
  float avgRh   = sumRh / good;

  // Basic validation
  if (avgCo2 <= 0.0f || avgTemp < -10.0f || avgTemp > 80.0f || avgRh < 0.0f || avgRh > 100.0f) {
    lastReading.valid = false;
    displayError("INVALID DATA");
    delay(2000);
    return;
  }

  float outPh = 0;
  lastReading.co2          = avgCo2;
  lastReading.temp         = avgTemp;
  lastReading.rh           = avgRh;
  lastReading.acidityIndex = calcAcidityIndex(avgCo2, avgTemp, avgRh, outPh);
  lastReading.estimatedPh  = outPh;
  lastReading.valid        = true;

  // --- Firebase upload (only if Wi-Fi connected) ---
  if (WiFi.status() == WL_CONNECTED) {
    displayUploading();
    String userId = fetchActiveUser();
    if (userId.length() > 0) {
      bool ok = uploadReading(lastReading, userId);
      displayUploadSuccess(ok);
      delay(1500);
    } else {
      Serial.println("[UPLOAD] No active user set — skipping upload.");
      displayUploadSuccess(false);
      delay(1500);
    }
  } else {
    Serial.println("[UPLOAD] Wi-Fi not connected — skipping upload.");
  }
}

// ============================================================
//  EXHALE ACIDITY INDEX MODEL
// ============================================================
float calcAcidityIndex(float co2, float temp, float rh, float &outPh) {
  // Prevent division by zero
  float safeBaseline = baselineCO2 > 0 ? baselineCO2 : 40000.0;
  
  // AI = 50 + 30 * log10(CO2 / CO2_baseline) + 0.5 * (Temp - Temp_baseline) + 0.05 * (RH - RH_baseline)
  float ai = 50.0 
             + 30.0 * log10(co2 / safeBaseline) 
             + 0.5 * (temp - baselineTemperature) 
             + 0.05 * (rh - baselineHumidity);

  // Constrain AI to 0-100
  ai = constrain(ai, 0.0f, 100.0f);

  // Reference pH = 7.40 - ((AcidityIndex - 50.0) / 25.0)
  outPh = 7.40f - ((ai - 50.0f) / 25.0f);

  return ai;
}

String getAcidityClassification(float acidityIndex) {
  if (acidityIndex <= 20.0f) return "Very Low Acidity";
  if (acidityIndex <= 40.0f) return "Low Acidity";
  if (acidityIndex <= 55.0f) return "Normal/Baseline";
  if (acidityIndex <= 70.0f) return "Slightly Elevated";
  if (acidityIndex <= 85.0f) return "Elevated";
  return "Highly Elevated";
}

String getShortClassification(float acidityIndex) {
  if (acidityIndex <= 20.0f) return "VERY LOW";
  if (acidityIndex <= 40.0f) return "LOW";
  if (acidityIndex <= 55.0f) return "NORMAL";
  if (acidityIndex <= 70.0f) return "SLIGHT HIGH";
  if (acidityIndex <= 85.0f) return "ELEVATED";
  return "HIGH";
}

// ============================================================
//  WI-FI CONNECTION (Captive Portal)
// ============================================================
void displayWiFiSetup() {
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setCursor(20, 0); oled.print("Wi-Fi Setup");
  oled.setCursor(0, 14); oled.print("Connect phone to:");
  oled.setCursor(0, 24); oled.print("EXHALE_Setup");
  oled.display();
}

bool connectWiFi() {
  Serial.println("[WiFi] Starting WiFiManager...");
  
  WiFiManager wm;
  
  // Try to connect to saved Wi-Fi for 60 seconds.
  // If it can't connect, it will open the Captive Portal AP.
  wm.setConnectTimeout(60);

  // If it enters AP mode (setup), show instructions on OLED
  wm.setAPCallback([](WiFiManager *myWiFiManager) {
    Serial.println("[WiFi] Entered AP mode. Waiting for captive portal setup.");
    displayWiFiSetup();
  });

  // Attempt to connect silently in the background, or open AP if needed
  bool res = wm.autoConnect("EXHALE_Setup");

  if (!res) {
    Serial.println("[WiFi] Failed to connect and hit timeout. Rebooting...");
    delay(3000);
    ESP.restart();
    return false;
  }

  Serial.printf("\n[WiFi] Connected. IP: %s\n", WiFi.localIP().toString().c_str());
  return true;
}

// ============================================================
//  FETCH ACTIVE USER FROM FIREBASE /device/config
//  Returns the activeUserId string, or "" on failure.
//  This document is publicly readable (no auth required).
// ============================================================
String fetchActiveUser() {
  String url = String(REST_BASE) + "/device_config?select=active_user_id,active_user_name&limit=1";

  HTTPClient http;
  http.begin(url);
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
  int code = http.GET();

  if (code != 200) {
    Serial.printf("[FETCH] /device_config GET failed: %d\n", code);
    http.end();
    return "";
  }

  String body = http.getString();
  http.end();

  // Supabase returns an array of rows: [{"active_user_id":"uuid", "active_user_name":"name"}]
  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    Serial.printf("[FETCH] JSON parse error: %s\n", err.c_str());
    return "";
  }

  if (doc.size() == 0) {
    Serial.println("[FETCH] No active user config found.");
    return "";
  }

  const char *userId = doc[0]["active_user_id"];
  if (!userId || strlen(userId) == 0) {
    Serial.println("[FETCH] active_user_id is empty or missing.");
    return "";
  }

  Serial.printf("[FETCH] Active user: %s\n", userId);
  return String(userId);
}

// ============================================================
//  UPLOAD READING TO FIREBASE /readings (POST)
//  Uses Firestore REST API with FIREBASE_API_KEY for auth.
//  Note: Firestore rules require request.auth != null for writes,
//  so this uses the API key which identifies the app (not a user).
//  For full server-side auth, upgrade to a service account token.
// ============================================================
bool uploadReading(const Reading &r, const String &userId) {
  String url = String(REST_BASE) + "/readings";

  StaticJsonDocument<512> doc;
  doc["user_id"]       = userId;
  doc["device_id"]     = DEVICE_ID;
  doc["co2"]           = r.co2;
  doc["temperature"]   = r.temp;
  doc["humidity"]      = r.rh;
  doc["acidity_index"] = r.acidityIndex;
  doc["estimated_ph"]  = r.estimatedPh;

  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.begin(url);
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "return=minimal");

  int code = http.POST(body);

  bool success = (code == 201); // PostgREST typically returns 201 Created
  if (success) {
    Serial.println("[UPLOAD] Reading uploaded successfully.");
  } else {
    Serial.printf("[UPLOAD] Upload failed: HTTP %d\n", code);
    Serial.println(http.getString());
  }

  http.end();
  return success;
}

// ============================================================
//  PING DEVICE HEARTBEAT TO FIREBASE /rpc/ping_device
// ============================================================
void pingSupabase() {
  String url = String(REST_BASE) + "/rpc/ping_device";
  StaticJsonDocument<128> doc;
  doc["dev_id"] = DEVICE_ID;
  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.begin(url);
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
  http.addHeader("Content-Type", "application/json");

  int code = http.POST(body);
  if (code == 200 || code == 204) {
    Serial.println("[PING] Supabase device_config updated_at successfully refreshed.");
  } else {
    Serial.printf("[PING] Failed: HTTP %d\n", code);
  }
  http.end();
}

// ============================================================
//  BUTTON — SIMPLE BLOCKING DEBOUNCE
// ============================================================
bool isButtonPressed() {
  int raw = digitalRead(PIN_BUTTON);

  if (raw != LOW) return false;

  Serial.printf("[BTN] GPIO%d raw = LOW (first contact at %lums)\n",
                PIN_BUTTON, (unsigned long)millis());

  delay(DEBOUNCE_MS);

  raw = digitalRead(PIN_BUTTON);
  if (raw != LOW) {
    Serial.println("[BTN] Debounce FAILED: pin returned HIGH (was noise, ignoring)");
    return false;
  }

  Serial.printf("[BTN] Debounce PASSED: GPIO%d still LOW — real press confirmed\n",
                PIN_BUTTON);

  uint32_t pressStart = millis();
  while (digitalRead(PIN_BUTTON) == LOW) { delay(10); }
  uint32_t holdMs = millis() - pressStart;

  delay(DEBOUNCE_MS);

  Serial.printf("[BTN] Released after %lums. Button press complete.\n",
                (unsigned long)holdMs);

  return true;
}

// ============================================================
//  DISPLAY HELPERS
// ============================================================
void displaySplash() {
  oled.clearDisplay();
  oled.setTextSize(2);
  oled.setCursor(28, 0);
  oled.print("EXHALE");
  oled.setTextSize(1);
  oled.setCursor(13, 22);
  oled.print("Acidity Estimator");
  oled.display();
}

void displayCalibrating(int step, int total) {
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setCursor(4, 0);
  oled.print("Calibrating...");
  oled.setCursor(4, 12);
  char buf[24];
  snprintf(buf, sizeof(buf), "Sample %d / %d", step, total);
  oled.print(buf);
  int barFill = map(step, 0, total, 0, 116);
  oled.drawRect(6, 24, 116, 7, SSD1306_WHITE);
  oled.fillRect(6, 24, barFill, 7, SSD1306_WHITE);
  oled.display();
}

void displayIdle() {
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setCursor(28, 0);
  oled.setTextSize(2);
  oled.print("EXHALE");
  oled.setTextSize(1);
  oled.setCursor(13, 16);
  oled.print("Press btn to read");
  oled.setCursor(42, 24);
  oled.print("acidity");
  oled.display();
}

void displaySampling(int step, int total) {
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setCursor(8, 0);
  oled.print("Exhale into device");
  oled.setCursor(10, 10);
  char buf[24];
  snprintf(buf, sizeof(buf), "Reading %d of %d...", step, total);
  oled.print(buf);
  int barFill = map(step, 0, total, 0, 116);
  oled.drawRect(6, 22, 116, 8, SSD1306_WHITE);
  oled.fillRect(6, 22, barFill, 8, SSD1306_WHITE);
  oled.display();
}

// ============================================================
//  DISPLAY: UPLOADING (shown while POSTing to Firebase)
// ============================================================
void displayUploading() {
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setCursor(16, 4);
  oled.print("Uploading...");
  oled.setCursor(8, 18);
  oled.print("Sending to cloud");
  oled.display();
}

// ============================================================
//  DISPLAY: UPLOAD RESULT (shown for ~1.5s after upload)
// ============================================================
void displayUploadSuccess(bool success) {
  oled.clearDisplay();
  oled.setTextSize(1);
  if (success) {
    oled.setCursor(20, 4);
    oled.print("Upload OK!");
    oled.setCursor(16, 18);
    oled.print("Data saved online");
  } else {
    oled.setCursor(12, 4);
    oled.print("Upload failed");
    oled.setCursor(4, 18);
    oled.print("Saved locally only");
  }
  oled.display();
}

// ============================================================
//  DISPLAY: RESULTS (3-Screen Sequence)
// ============================================================
void displayResult(const Reading &r) {
  if (!r.valid) {
    displayError("INVALID DATA");
    return;
  }

  char buf[32];
  String shortClass = getShortClassification(r.acidityIndex);

  // Screen 1: Raw Data
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setCursor(45, 0); oled.print("EXHALE");
  
  oled.setCursor(0, 8);
  snprintf(buf, sizeof(buf), "CO2: %.0f ppm", r.co2);
  oled.print(buf);
  
  oled.setCursor(0, 16);
  snprintf(buf, sizeof(buf), "Temp: %.1f C", r.temp);
  oled.print(buf);
  
  oled.setCursor(0, 24);
  snprintf(buf, sizeof(buf), "RH: %.1f %%", r.rh);
  oled.print(buf);
  oled.display();
  
  delay(3000);

  // Screen 2: AI and Classification
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setCursor(25, 0); oled.print("Acidity Index");
  
  oled.setTextSize(2);
  oled.setCursor(20, 8);
  snprintf(buf, sizeof(buf), "AI:%.1f", r.acidityIndex);
  oled.print(buf);
  
  oled.setTextSize(1);
  // Center classification
  int16_t x1, y1; uint16_t w, h;
  oled.getTextBounds(shortClass.c_str(), 0, 0, &x1, &y1, &w, &h);
  oled.setCursor((128 - w) / 2, 24);
  oled.print(shortClass);
  oled.display();

  delay(3000);

  // Screen 3: Complete Result
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setCursor(25, 0); oled.print("EXHALE RESULT");
  
  oled.setCursor(0, 8);
  snprintf(buf, sizeof(buf), "AI: %.1f", r.acidityIndex);
  oled.print(buf);
  
  oled.setCursor(0, 16);
  snprintf(buf, sizeof(buf), "Ref pH: %.2f", r.estimatedPh);
  oled.print(buf);
  
  oled.setCursor(0, 24);
  oled.print(shortClass);
  oled.display();
}

void displayError(const char *msg) {
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setCursor(0, 0);
  oled.print("!! ERROR !!");
  oled.setCursor(0, 14);
  oled.print(msg);
  oled.display();
  Serial.printf("ERROR: %s\n", msg);
}
