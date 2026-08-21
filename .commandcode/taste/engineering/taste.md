# Engineering taste

- Wants the app fully self-contained and reliable on any fresh Mac/Windows/Linux machine, including auto-detecting and auto-installing missing prerequisites (e.g., Node.js 22+) instead of requiring manual setup. Confidence: 0.8
- Treats performance/stability as critical: any OS lag, high CPU, or crash (e.g., while running dev servers) must be root-caused and fixed; the app should be smooth and light. Confidence: 0.8
- Wants the in-app terminal to behave and look exactly like the system CMD/PowerShell: Cascadia Mono font, smooth scrolling, working mouse support, no text-overlap/glitch rendering. Confidence: 0.8
- Wants every child process the app spawns on Windows to be launched hidden (CREATE_NO_WINDOW / windowsHide) so no visible console/CMD window ever flashes during background work. Confidence: 0.8
