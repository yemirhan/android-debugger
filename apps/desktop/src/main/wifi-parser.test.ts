import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSsid, parseCmdWifiStatus, parseDumpsysWifi, parseWifiInfoLine } from './wifi-parser.ts';

// Captured from an Android 16 (API 36) emulator with `adb shell cmd wifi status`.
const CMD_STATUS_CONNECTED = `Wifi is enabled
Wifi scanning is only available when wifi is enabled
==== Primary ClientModeManager instance ====
Wifi is connected to "AndroidWifi"
WifiInfo: SSID: "AndroidWifi", BSSID: 00:13:10:85:fe:01, MAC: 02:15:b2:00:00:00, IP: /10.0.2.16, Security type: 0, Supplicant state: COMPLETED, Wi-Fi standard: legacy, RSSI: -50, Link speed: 1Mbps, Tx Link speed: 1Mbps, Max Supported Tx Link speed: 11Mbps, Rx Link speed: 2Mbps, Max Supported Rx Link speed: 11Mbps, Frequency: 2447MHz, Net ID: 0, Metered hint: false, score: 60, isUsable: true, CarrierMerged: false, SubscriptionId: -1, IsPrimary: 1, Trusted: true, Restricted: false, Ephemeral: false, OEM paid: false, OEM private: false, OSU AP: false, FQDN: <none>, Provider friendly name: <none>, Requesting package name: <none>"AndroidWifi"openMLO Information: , Is TID-To-Link negotiation supported by the AP: false, AP MLD Address: <none>, AP MLO Link Id: <none>, AP MLO Affiliated links: <none>, Vendor Data: <none>
successfulTxPackets: 65861
successfulTxPacketsPerSecond: 1.5107627523666947E-14
`;

// Same emulator after `adb shell svc wifi disable`.
const CMD_STATUS_DISABLED = `Wifi is disabled
Wifi scanning is only available when wifi is enabled
`;

const CMD_STATUS_NOT_CONNECTED = `Wifi is enabled
Wifi scanning is always available
==== Primary ClientModeManager instance ====
Wifi is not connected
WifiInfo: SSID: <unknown ssid>, BSSID: <none>, MAC: 02:15:b2:00:00:00, IP: null, Security type: -1, Supplicant state: SCANNING, RSSI: -127
`;

// Trimmed `adb shell dumpsys wifi` with Wi-Fi disabled: the live mWifiInfo is
// empty, but saved networks and the "current SSID(s)" cache still name the
// old network. The old parser matched those and kept showing a stale SSID.
const DUMPSYS_DISABLED = `Wi-Fi is disabled
Verbose logging is off
mWifiInfo SSID: <unknown ssid>, BSSID: <none>, MAC: 02:15:b2:00:00:00, IP: null, Security type: -1, Supplicant state: DISCONNECTED, Wi-Fi standard: legacy, RSSI: -127, Link speed: -1Mbps, Frequency: -1MHz, Net ID: -1
WifiConfigManager - Configured networks Begin ----
ID: 0 SSID: "AndroidWifi" PROVIDER-NAME: null BSSID: null FQDN: null HOME-PROVIDER-NETWORK: false PRIO: 0 HIDDEN: false PMF: false CarrierId: -1 SubscriptionId: -1 SubscriptionGroup: null Currently Connected: false User Selected: false
current SSID(s):{iface=wlan0,ssid="AndroidWifi"}
`;

const DUMPSYS_CONNECTED = `Wi-Fi is enabled
rec[4]: time=09-29 10:34:54.460 processed=ConnectableState org=DisconnectedState dest=<null> what=CMD_START_CONNECT screen=on 0 10177 targetConfigKey="OldNetwork"NONE
mWifiInfo SSID: "AndroidWifi", BSSID: 00:13:10:85:fe:01, MAC: 02:15:b2:00:00:00, IP: /10.0.2.16, Security type: 0, Supplicant state: COMPLETED, Wi-Fi standard: legacy, RSSI: -50
mWifiInfo SSID: <unknown ssid>, BSSID: <none>, MAC: 02:15:b2:00:00:00, IP: null, Security type: -1, Supplicant state: DISCONNECTED
ID: 1 SSID: "OldNetwork" PROVIDER-NAME: null BSSID: null Currently Connected: false
`;

test('cmd wifi status: connected', () => {
  assert.deepEqual(parseCmdWifiStatus(CMD_STATUS_CONNECTED), { state: 'connected', ssid: 'AndroidWifi' });
});

test('cmd wifi status: disabled is authoritative, not unknown', () => {
  assert.deepEqual(parseCmdWifiStatus(CMD_STATUS_DISABLED), { state: 'disconnected' });
});

test('cmd wifi status: enabled but not associated', () => {
  assert.deepEqual(parseCmdWifiStatus(CMD_STATUS_NOT_CONNECTED), { state: 'disconnected' });
});

test('cmd wifi status: unsupported command output is unknown', () => {
  assert.deepEqual(parseCmdWifiStatus('Unknown command: status\n'), { state: 'unknown' });
  assert.deepEqual(parseCmdWifiStatus(''), { state: 'unknown' });
});

test('cmd wifi status: CRLF output and SSIDs with commas and spaces', () => {
  const output = 'Wifi is enabled\r\n==== Primary ClientModeManager instance ====\r\nWifi is connected to "Cafe, 2nd floor"\r\n';
  assert.deepEqual(parseCmdWifiStatus(output), { state: 'connected', ssid: 'Cafe, 2nd floor' });
});

test('dumpsys wifi: disabled ignores saved networks and SSID caches', () => {
  assert.deepEqual(parseDumpsysWifi(DUMPSYS_DISABLED), { state: 'disconnected' });
});

test('dumpsys wifi: reads the first live mWifiInfo, not history', () => {
  assert.deepEqual(parseDumpsysWifi(DUMPSYS_CONNECTED), { state: 'connected', ssid: 'AndroidWifi' });
});

test('dumpsys wifi: older unquoted WifiInfo format', () => {
  const output = 'Wi-Fi is enabled\nmWifiInfo SSID: HomeNet, BSSID: aa:bb:cc:dd:ee:ff, MAC: 02:00:00:00:00:00, Supplicant state: COMPLETED, RSSI: -40\n';
  assert.deepEqual(parseDumpsysWifi(output), { state: 'connected', ssid: 'HomeNet' });
});

test('WifiInfo line: association in progress is not connected', () => {
  assert.equal(parseWifiInfoLine('SSID: "Next", BSSID: aa:bb:cc:dd:ee:ff, Supplicant state: FOUR_WAY_HANDSHAKE'), null);
});

test('normalizeSsid rejects placeholders', () => {
  assert.equal(normalizeSsid('<unknown ssid>'), null);
  assert.equal(normalizeSsid('"<unknown ssid>"'), null);
  assert.equal(normalizeSsid('""'), null);
  assert.equal(normalizeSsid('"Home"'), 'Home');
});
