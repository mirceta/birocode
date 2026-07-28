# fix-startup-handle-race — tasks

## 1. Startup ordering + UI-thread safety

- [x] 1.1 Program.cs: construct MainForm and force its handle on the main thread before api.Start()
- [x] 1.2 MainForm.SafeInvoke: drop UI work while !IsHandleCreated (and keep IsDisposed guard)

## 2. Background-service immunity

- [x] 2.1 AutopilotService.ExecuteAsync: ConfigureAwait(false) on all awaits
- [x] 2.2 CollectorPoller.ExecuteAsync: ConfigureAwait(false) on all awaits

## 3. Non-blocking mining + CLI reader

- [x] 3.1 AutopilotService.Routines(): single-flight background mining refresh + start/done logging
- [x] 3.2 CliRunnerService: async read-until-null stdout loop (drop EndOfStream gate)

## 4. Verify + ship

- [x] 4.1 Build backend + frontend; run isolated harness — engine tick + poller logs within seconds, mining logged in background, health 200
- [x] 4.2 openspec validate --strict
- [x] 4.3 Merge origin/main into feat/loop-debug-ref, deploy via detached swap.ps1, verify live PID + health
