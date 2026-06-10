<!-- managed by Claude Web -- re-run "Prepare for preview" to update -->

# Previewing this app in Claude Web

The Claude Web "App" tab embeds whatever is listening on **port 5200**. When the
user asks you to run, start, or preview the app:

1. Start it listening on **0.0.0.0:5200** (not localhost) so it is reachable
   from the phone over the LAN.
2. Launch it **detached** so it keeps running after your turn ends. Claude Web
   runs you via `claude -p` (one-shot), so a normal child process dies when the
   turn finishes. Windows: `Start-Process`. macOS/Linux: `nohup ... & disown`.
3. Free the port first if something already holds it:
   - Windows: `Get-NetTCPConnection -LocalPort 5200 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`
   - macOS/Linux: `lsof -ti tcp:5200 | xargs -r kill`
4. Use this repository's own stack and scripts to start it.
