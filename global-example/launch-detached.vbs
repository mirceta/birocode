' Launches global-example/serve.mjs fully detached and hidden.
' WScript.Shell.Run(cmd, 0=hidden window, False=do not wait) returns immediately
' and the spawned node process has no parent tie to this script, so it survives
' after the launcher (and the agent's shell) exits — satisfying rule 1's
' "launch detached, outlive the turn".
'
' The script resolves its OWN directory rather than hardcoding a username path,
' so it works on any checkout (the homepage twin hardcodes C:\Users\km\… — don't
' copy that bug).
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
cmd = "node """ & fso.BuildPath(scriptDir, "serve.mjs") & """"
sh.Run cmd, 0, False
