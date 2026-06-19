' Launches the homepage static server (serve.mjs) fully detached and hidden.
' WScript.Shell.Run(cmd, 0=hidden window, False=do not wait) returns immediately
' and the spawned node process has no parent tie to this script, so it survives
' after the launcher (and the agent's shell) exits.
Set sh = CreateObject("WScript.Shell")
cmd = "node ""C:\Users\km\Desktop\playground\birocode\homepage\serve.mjs"""
sh.Run cmd, 0, False
