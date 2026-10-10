# Home bridge

One-way door on the Hub: the home computer (192.168.1.105) opens business addresses
(`http://192.168.0.42:5099` …) in Chrome; nothing on the business network can reach home.
Design and rules: `openspec/changes/home-bridge-proxy/`.

## On the Hub

```
powershell -ExecutionPolicy Bypass -File tools\home-bridge\install.ps1     # on (or update)
powershell -ExecutionPolicy Bypass -File tools\home-bridge\uninstall.ps1   # off
```

Run from an elevated PowerShell. Installs to `%LOCALAPPDATA%\ClaudeWebHomeBridge`; edit
`homebridge.json` there to change the port, the allowed home computers or the business range,
then re-run `install.ps1` (it keeps your config). Logs: `logs\homebridge-yyyyMMdd.log` there.

## On the home computer (once)

Windows Settings → Network & internet → Proxy → **Use setup script** → On, address:

```
http://192.168.1.101:3128/proxy.pac
```

Then type `http://192.168.0.42:5099` in Chrome. Only `192.168.0.x` goes through the Hub;
everything else stays direct. To stop, turn the setup script off.
