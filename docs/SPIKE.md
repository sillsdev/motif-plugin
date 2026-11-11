# Spike notes (throwaway)

Run from source on WSL2/Linux against paranext-core tag `v0.5.0-alpha.0` (the Paratext 10 build attached to
the interlinearizer v0.8.0 release), cloned beside this repo.

1. `npm install` in `../paranext-core` and here (Node 24 works).
2. Copy the PanGloss binary Motif ships to `motif/linux-x64/pangloss` (the folder is git-ignored and copied into `dist/motif/`).
3. Electron needs libnss3, libnspr4, libasound2 (no sudo: `apt-get download`, `dpkg-deb -x`, then `LD_LIBRARY_PATH`).
4. Core needs two local dev workarounds for a slow shared machine: `docs/paranext-core-dev-workarounds.patch`
   (RPC retries 10 to 60; do not let a failed Usersnap widget stop the renderer's services). `DOTNET_ROLL_FORWARD=Major` lets
   the net8.0 data provider run on .NET 10; if `dotnet watch` crashes at startup, run `c-sharp/bin/Debug/net8.0/linux-x64/ParanextDataProvider.dll` by hand.
5. `MOTIF_SPIKE_GRAMMAR=<path to .fwdata or HermitCrab .xml>` then `npm start` (add `--remote-debugging-port=9333` to `MAIN_ARGS` to script it).
6. Command: `motifSpike.checkChapter(projectId, {book, chapterNum, verseNum}, options?)`. `npm test` runs the unit tests.
