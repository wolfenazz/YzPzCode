# Running applications

Use **Run** in a terminal header to launch the selected application. The arrow beside it opens the target selector. Choose another entry point, refresh after changing project files, or use **Customize / save** to change the command and arguments. The app remembers the selected target for that project.

**Build** runs the selected build command separately. Automatic C/C++ commands compile before launching. For a custom command, combine build and run with `&&` if compilation should happen each time.

Output appears in the terminal. Use **Stop** or **Ctrl+C** in the terminal to stop a managed run. For console programs that read a line (Python `input()`, C# `Console.ReadLine()`, C/C++ standard input), enter text in **Send input to running application** and press Enter. Full terminal applications can still be launched directly in the shell terminal.

Development-server localhost URLs printed in output appear in the workspace's browser controls, using the existing browser preview behavior.

## Saved commands

Open **Settings → Application runs** to add, edit, or delete configurations. Each configuration includes a name, optional project directory, optional working directory, run command with arguments, and optional build command. An empty project directory makes the configuration available everywhere. An empty working directory uses the terminal's current directory. Configuration changes persist when you save the form.

Commands use Command Prompt on Windows and the login shell on macOS/Linux. Install the runtime/compiler and project dependencies first. Custom commands can activate a different environment, pass application arguments, set environment variables using the shell's syntax, or invoke another build system.

## Automatic targets

| Language/project | Detection and behavior |
| --- | --- |
| Python | `.py` scripts; common `main.py`, `app.py`, Django `manage.py`; Flask and FastAPI server options. Uses a local `.venv`, `venv`, or `env`, then Python on PATH. |
| C/C++ | Source files with `main()`; compiles same-directory helper sources using GCC or Clang. Output goes to `.yzpz-run/`. Use a saved command for custom include paths, libraries, flags, or other build systems. |
| CMake | Build once in `.yzpz-build/`, then refresh to select an executable. Reads CMake's file API to locate Debug executables, including custom output paths. |
| C# | Runnable `.csproj` files, including projects within solution folders. Library and test projects are excluded. Requires the .NET SDK. |
| JavaScript/TypeScript | `package.json` dev/serve/start and build scripts; npm, pnpm, Yarn, or Bun selected from lockfiles. Supports a nested `app/` package. |
| Rust, Go, Flutter | Cargo, Go module, and Flutter project manifests. |
| Java | Source-file launch with JDK 11 or newer. Use custom commands for Maven/Gradle applications. |
| Ruby, PHP, Dart, Swift, Lua, Perl, R | Source files using their installed runtime; Rails and Laravel manifest actions where applicable. |

Native source discovery checks the current directory and two folder levels below it, up to 500 source/project files. Dependency, build, and hidden directories are skipped. For deeper layouts or other languages, create a saved configuration. Kotlin and additional server-command presets are available in the configuration editor.

Run detection does not install packages or execute project code. Missing native runtimes show setup guidance in the selector; refresh after installing them. Build or application errors remain visible in terminal output and the selector's last-command status.
