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

## Windows install (installed Paratext 10 0.5.0-alpha.0)

1. Put `pangloss-win-x64.exe` (v0.16.2, SHA256 `daec63da...a4c3`, from Motif's `pangloss-release.json`) at `motif/win-x64/pangloss.exe` (gitignored), then `npm run package`.
2. Copy `release/motif-plugin_0.0.1.zip` into `%USERPROFILE%\.paratext-10-studio\installed-extensions`, leave it zipped. The running app picks it up; it renames the zip to `motifSpike_0.0.1.zip`.
3. In the Motif spike tab type the `.fwdata` path into the "Grammar (.fwdata path)" box (blank falls back to `MOTIF_SPIKE_GRAMMAR`) and press Check chapter.
