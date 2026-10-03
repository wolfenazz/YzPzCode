use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRunTarget {
    pub id: String,
    pub label: String,
    pub language: String,
    pub cwd: String,
    pub command: String,
    pub build_command: Option<String>,
    pub unavailable_reason: Option<String>,
}

// Managed commands use cmd.exe on Windows and a POSIX-compatible shell elsewhere.
// Reject cmd expansion characters rather than letting filenames become shell code.
fn quote(value: &str) -> Result<String> {
    if value.contains(['\r', '\n', '\0']) {
        anyhow::bail!("Run paths cannot contain control characters");
    }
    if cfg!(target_os = "windows") {
        if value.contains(['"', '%', '!']) {
            anyhow::bail!("Run paths on Windows cannot contain quotes, % or !");
        }
        Ok(format!("\"{value}\""))
    } else {
        Ok(format!("'{}'", value.replace('\'', "'\\''")))
    }
}

fn read_text(path: &Path) -> String {
    // Detection never needs large source/generated files.
    if std::fs::metadata(path).is_ok_and(|meta| meta.len() <= 512 * 1024) {
        std::fs::read_to_string(path).unwrap_or_default()
    } else {
        String::new()
    }
}

fn cmake_executables(reply: &Path) -> Vec<(String, String)> {
    let mut indexes = std::fs::read_dir(reply)
        .into_iter()
        .flatten()
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .is_some_and(|name| name.to_string_lossy().starts_with("index-"))
        })
        .collect::<Vec<_>>();
    indexes.sort();
    let Some(index) = indexes.last() else {
        return Vec::new();
    };
    let Ok(index) = serde_json::from_str::<serde_json::Value>(&read_text(index)) else {
        return Vec::new();
    };
    let json_file = |name: &str| -> Option<serde_json::Value> {
        if Path::new(name).components().count() != 1 {
            return None;
        }
        serde_json::from_str(&read_text(&reply.join(name))).ok()
    };
    let Some(objects) = index["objects"].as_array() else {
        return Vec::new();
    };
    let Some(model) = objects
        .iter()
        .find(|object| object["kind"] == "codemodel")
        .and_then(|object| object["jsonFile"].as_str())
        .and_then(json_file)
    else {
        return Vec::new();
    };
    let Some(configurations) = model["configurations"].as_array() else {
        return Vec::new();
    };
    let Some(configuration) = configurations
        .iter()
        .find(|config| config["name"] == "Debug")
        .or_else(|| configurations.iter().find(|config| config["name"] == ""))
    else {
        return Vec::new();
    };
    let Some(targets) = configuration["targets"].as_array() else {
        return Vec::new();
    };
    targets
        .iter()
        .filter_map(|target| {
            let value = json_file(target["jsonFile"].as_str()?)?;
            if value["type"] != "EXECUTABLE" {
                return None;
            }
            Some((
                value["name"].as_str()?.into(),
                value["artifacts"][0]["path"].as_str()?.into(),
            ))
        })
        .collect()
}

fn tool(names: &[&str]) -> Option<String> {
    names.iter().find_map(|name| {
        which::which(name).ok().and_then(|path| {
            // Windows Store aliases can exist without an installed interpreter.
            if path.to_string_lossy().contains("WindowsApps") && name.starts_with("python") {
                return None;
            }
            quote(&path.to_string_lossy()).ok()
        })
    })
}

fn python(root: &Path) -> (String, Option<String>) {
    for env in [".venv", "venv", "env"] {
        let binary = root.join(env).join(if cfg!(target_os = "windows") {
            "Scripts/python.exe"
        } else {
            "bin/python"
        });
        if binary.is_file() {
            if let Ok(command) = quote(&binary.to_string_lossy()) {
                return (command, None);
            }
        }
    }
    let candidates: &[&str] = if cfg!(target_os = "windows") {
        &["python", "py", "python3"]
    } else {
        &["python3", "python"]
    };
    match tool(candidates) {
        Some(command) => (command, None),
        None => (
            "python".into(),
            Some("Install Python 3 and add it to PATH, or create a .venv in this project. Then refresh targets.".into()),
        ),
    }
}

fn files(root: &Path, depth: usize, output: &mut Vec<PathBuf>) -> Result<()> {
    if output.len() >= 500 {
        return Ok(());
    }
    let mut entries = std::fs::read_dir(root)
        .with_context(|| format!("Cannot read project directory {}", root.display()))?
        .filter_map(|entry| entry.ok())
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| {
        (
            entry.file_type().is_ok_and(|kind| kind.is_dir()),
            entry.file_name(),
        )
    });
    for entry in entries {
        if output.len() >= 500 {
            break;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let kind = entry.file_type()?;
        if kind.is_file() {
            let path = entry.path();
            let extension = path
                .extension()
                .and_then(|ext| ext.to_str())
                .unwrap_or_default();
            if matches!(
                extension,
                "py" | "csproj"
                    | "cpp"
                    | "cc"
                    | "cxx"
                    | "c"
                    | "java"
                    | "rb"
                    | "php"
                    | "dart"
                    | "swift"
                    | "lua"
                    | "pl"
                    | "r"
                    | "R"
            ) {
                output.push(path);
            }
        } else if kind.is_dir()
            && depth > 0
            && !name.starts_with('.')
            && !matches!(
                name.as_str(),
                "node_modules"
                    | "venv"
                    | "env"
                    | "build"
                    | "dist"
                    | "target"
                    | "bin"
                    | "obj"
                    | "vendor"
                    | "__pycache__"
            )
        {
            files(&entry.path(), depth - 1, output)?;
        }
    }
    Ok(())
}

pub fn detect_targets(cwd: &str) -> Result<Vec<ProjectRunTarget>> {
    let root = std::fs::canonicalize(cwd).context("Project directory does not exist")?;
    let root = normalize_shell_path(&root);
    let mut paths = Vec::new();
    files(&root, 2, &mut paths)?;
    let mut targets = Vec::new();
    let dotnet = tool(&["dotnet"]);
    let compiler = tool(&["g++", "clang++"]);
    let main_pattern = regex::Regex::new(r"\bmain\s*\(")?;
    let fastapi_pattern = regex::Regex::new(r"(?m)^\s*app\s*(?::[^=\n]+)?=\s*FastAPI\s*\(")?;
    let dotnet_application_pattern =
        regex::Regex::new(r"(?i)<OutputType>\s*(?:Exe|WinExe)\s*</OutputType>")?;
    let dotnet_test_pattern = regex::Regex::new(r"(?i)<IsTestProject>\s*true\s*</IsTestProject>")?;
    for path in &paths {
        let parent = path.parent().context("Project file has no parent")?;
        let filename = path
            .file_name()
            .context("Project file has no name")?
            .to_string_lossy();
        let relative = path
            .strip_prefix(&root)?
            .to_string_lossy()
            .replace('\\', "/");
        let extension = path
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or_default();
        let mut target = ProjectRunTarget {
            id: relative.clone(),
            label: relative.clone(),
            language: String::new(),
            cwd: parent.to_string_lossy().to_string(),
            command: String::new(),
            build_command: None,
            unavailable_reason: None,
        };
        match extension {
            "py" if filename != "__init__.py" && !filename.starts_with("test_") => {
                let env_root = if parent.join(".venv").is_dir() || parent.join("venv").is_dir() {
                    parent
                } else {
                    &root
                };
                let (python, missing) = python(env_root);
                let file = quote(&filename)?;
                let stem = path.file_stem().unwrap_or_default().to_string_lossy();
                let mut modules = vec![stem.to_string()];
                let mut module_cwd = parent;
                while module_cwd.join("__init__.py").is_file() {
                    if let (Some(name), Some(ancestor)) =
                        (module_cwd.file_name(), module_cwd.parent())
                    {
                        modules.insert(0, name.to_string_lossy().to_string());
                        module_cwd = ancestor;
                    } else {
                        break;
                    }
                }
                let module = modules.join(".");
                let module_valid = modules.iter().all(|name| {
                    !name.is_empty() && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
                });
                let package = module_cwd != parent && module_valid;
                if package {
                    target.cwd = module_cwd.to_string_lossy().to_string();
                }
                target.language = "Python".into();
                target.unavailable_reason = missing;
                target.command = if filename == "manage.py" {
                    format!("{python} -u {file} runserver")
                } else if package {
                    format!("{python} -u -m {module}")
                } else {
                    format!("{python} -u {file}")
                };
                targets.push(target.clone());
                let source = read_text(path);
                // Only offer server targets when the source actually declares the framework.
                if fastapi_pattern.is_match(&source) {
                    if module_valid {
                        target.id.push_str(":server");
                        target.label = format!("{relative} · FastAPI server");
                        target.command = format!("{python} -u -m uvicorn {module}:app --reload");
                        targets.push(target);
                    }
                } else if source.contains("Flask(") {
                    target.id.push_str(":server");
                    target.label = format!("{relative} · Flask server");
                    let app = if package { quote(&module)? } else { file };
                    target.command = format!("{python} -u -m flask --app {app} run --debug");
                    targets.push(target);
                }
            }
            "csproj" => {
                let source = read_text(path);
                // A solution can contain libraries and test projects; only applications run.
                if !(source.contains("Microsoft.NET.Sdk.Web")
                    || dotnet_application_pattern.is_match(&source))
                    || dotnet_test_pattern.is_match(&source)
                {
                    continue;
                }
                let binary = dotnet.as_deref().unwrap_or("dotnet");
                let project = quote(&filename)?;
                target.language = "C#".into();
                target.command = format!("{binary} run --project {project}");
                target.build_command = Some(format!("{binary} build {project}"));
                target.unavailable_reason = dotnet.is_none().then(|| "Install the .NET SDK (not just the runtime), add dotnet to PATH, then refresh targets.".into());
                targets.push(target);
            }
            "cpp" | "cc" | "cxx" | "c" => {
                // CMake projects must use their build system to resolve libraries and flags.
                if parent.join("CMakeLists.txt").is_file() || root.join("CMakeLists.txt").is_file()
                {
                    continue;
                }
                let source = read_text(path);
                if !main_pattern.is_match(&source) {
                    continue;
                }
                let c_compiler = tool(&["gcc", "clang"]);
                let chosen_compiler = if extension == "c" {
                    &c_compiler
                } else {
                    &compiler
                };
                let binary = chosen_compiler.as_deref().unwrap_or(if extension == "c" {
                    "gcc"
                } else {
                    "g++"
                });
                let file = quote(&filename)?;
                let mut sources = vec![file];
                for helper in &paths {
                    let ext = helper
                        .extension()
                        .and_then(|ext| ext.to_str())
                        .unwrap_or_default();
                    if helper != path
                        && helper.parent() == Some(parent)
                        && (if extension == "c" {
                            ext == "c"
                        } else {
                            matches!(ext, "cpp" | "cc" | "cxx")
                        })
                        && !main_pattern.is_match(&read_text(helper))
                    {
                        sources.push(quote(
                            &helper.file_name().unwrap_or_default().to_string_lossy(),
                        )?);
                    }
                }
                // Reuse a dedicated output directory without overwriting project binaries.
                let executable = if cfg!(target_os = "windows") {
                    ".yzpz-run/program.exe"
                } else {
                    "./.yzpz-run/program"
                };
                let mkdir = if cfg!(target_os = "windows") {
                    "if not exist .yzpz-run mkdir .yzpz-run"
                } else {
                    "mkdir -p .yzpz-run"
                };
                let build = format!(
                    "({mkdir}) && {binary} {} -o {}",
                    sources.join(" "),
                    quote(executable)?
                );
                target.language = if extension == "c" { "C" } else { "C++" }.into();
                target.command = format!("{build} && {}", quote(executable)?);
                target.build_command = Some(build);
                target.unavailable_reason = chosen_compiler.is_none().then(|| "Install GCC or LLVM, add the compiler to PATH, then refresh targets. For multi-file projects, configure a custom build command.".into());
                targets.push(target);
            }
            "java" | "rb" | "php" | "dart" | "swift" | "lua" | "pl" | "r" | "R" => {
                let (language, executable, args) = match extension {
                    "java" => ("Java", "java", ""),
                    "rb" => ("Ruby", "ruby", ""),
                    "php" => ("PHP", "php", ""),
                    "dart" => ("Dart", "dart", "run "),
                    "swift" => ("Swift", "swift", ""),
                    "lua" => ("Lua", "lua", ""),
                    "pl" => ("Perl", "perl", ""),
                    _ => ("R", "Rscript", ""),
                };
                let runtime = tool(&[executable]);
                target.language = language.into();
                target.command = format!(
                    "{} {args}{}",
                    runtime.as_deref().unwrap_or(executable),
                    quote(&filename)?
                );
                target.unavailable_reason = runtime.is_none().then(|| {
                    format!(
                        "Install {language} and add {executable} to PATH, then refresh targets.{}",
                        if extension == "java" {
                            " Java source-file runs require JDK 11 or newer."
                        } else {
                            ""
                        }
                    )
                });
                targets.push(target);
            }
            _ => {}
        }
    }
    // CMake's file API supplies the actual executable path, including custom output
    // directories and multi-config generators. Never guess it from a target name.
    if root.join("CMakeLists.txt").is_file() {
        let cmake = tool(&["cmake"]);
        let binary = cmake.as_deref().unwrap_or("cmake");
        let build =
            format!("{binary} -S . -B .yzpz-build -DCMAKE_BUILD_TYPE=Debug && {binary} --build .yzpz-build --config Debug");
        let reply = root.join(".yzpz-build/.cmake/api/v1/reply");
        for (name, artifact) in cmake_executables(&reply) {
            let executable = root.join(".yzpz-build").join(artifact);
            targets.push(ProjectRunTarget {
                id: format!("cmake:{name}"),
                label: format!("CMake · {name}"),
                language: "C++".into(),
                cwd: root.to_string_lossy().into(),
                command: format!("{build} && {}", quote(&executable.to_string_lossy())?),
                build_command: Some(build.clone()),
                unavailable_reason: cmake
                    .is_none()
                    .then(|| "Install CMake and a C++ toolchain, then refresh targets.".into()),
            });
        }
        // Query creation is an explicit Build action, so opening a workspace is read-only.
        if !targets.iter().any(|target| target.id.starts_with("cmake:")) {
            let query = if cfg!(target_os = "windows") {
                "if not exist .yzpz-build\\.cmake\\api\\v1\\query mkdir .yzpz-build\\.cmake\\api\\v1\\query"
            } else {
                "mkdir -p .yzpz-build/.cmake/api/v1/query"
            };
            let touch = if cfg!(target_os = "windows") {
                "type nul > .yzpz-build\\.cmake\\api\\v1\\query\\codemodel-v2"
            } else {
                "touch .yzpz-build/.cmake/api/v1/query/codemodel-v2"
            };
            targets.push(ProjectRunTarget {
                id: "cmake:configure".into(), label: "CMake · configure and build".into(), language: "C++".into(),
                cwd: root.to_string_lossy().into(), command: String::new(),
                build_command: Some(format!("({query}) && {touch} && {build}")),
                unavailable_reason: Some("Build once, then refresh targets to select a CMake executable. CMake and a C++ toolchain are required.".into()),
            });
        }
    }
    targets.sort_by_key(|target| {
        let main = target.id.ends_with(":server")
            || matches!(target.id.as_str(), "main.py" | "app.py" | "manage.py");
        (!target.id.ends_with(":server"), !main, target.id.clone())
    });
    Ok(targets)
}

/// Rust canonicalization adds a verbatim prefix on Windows. CMD treats
/// verbatim drive paths as UNC directories and silently switches to Windows.
pub(super) fn normalize_shell_path(path: &Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let text = path.to_string_lossy();
        if let Some(unc) = text.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{unc}"));
        }
        if let Some(drive) = text.strip_prefix(r"\\?\") {
            return PathBuf::from(drive);
        }
    }
    path.to_path_buf()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(files: &[(&str, &str)]) -> PathBuf {
        let root = std::env::temp_dir().join(format!("yzpz-run-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).expect("fixture root");
        for (name, content) in files {
            let path = root.join(name);
            std::fs::create_dir_all(path.parent().expect("fixture parent"))
                .expect("fixture directory");
            std::fs::write(path, content).expect("fixture file");
        }
        root
    }

    #[test]
    fn detects_scripts_without_manifest_and_prefers_server() {
        let root = fixture(&[
            ("hello world.py", "print('hello')"),
            ("main.py", "from fastapi import FastAPI\napp = FastAPI()"),
            ("test_app.py", ""),
            ("node_modules/ignored.py", ""),
        ]);
        let targets = detect_targets(root.to_str().expect("path")).expect("detection");
        assert_eq!(targets.len(), 3);
        assert_eq!(targets[0].id, "main.py:server");
        assert!(targets
            .iter()
            .any(|target| target.command.contains("hello world.py")));
        std::fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn selects_application_projects_in_solution_and_cpp_entrypoints() {
        let root = fixture(&[
            ("App/App.csproj", "<OutputType>Exe</OutputType>"),
            ("Lib/Lib.csproj", "<Project Sdk=\"Microsoft.NET.Sdk\"/>"),
            ("web/web.csproj", "Microsoft.NET.Sdk.Web"),
            ("main.cpp", "int main() {return 0;}"),
            ("helper.cpp", "void helper() {}"),
        ]);
        let targets = detect_targets(root.to_str().expect("path")).expect("detection");
        assert_eq!(targets.len(), 3);
        assert!(targets.iter().any(|target| target
            .command
            .contains("run --project \"App.csproj\"")
            || target.command.contains("run --project 'App.csproj'")));
        assert!(targets
            .iter()
            .any(|target| target.language == "C++" && target.command.contains("&&")));
        std::fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn cmake_uses_artifacts_instead_of_guessing_executable_paths() {
        let root = fixture(&[
            ("CMakeLists.txt", "add_executable(app main.cpp)"),
            ("main.cpp", "int main() {}"),
            (
                ".yzpz-build/.cmake/api/v1/reply/index-2026.json",
                r#"{"objects":[{"kind":"codemodel","jsonFile":"codemodel.json"}]}"#,
            ),
            (
                ".yzpz-build/.cmake/api/v1/reply/codemodel.json",
                r#"{"configurations":[{"name":"Release","targets":[{"jsonFile":"target-old.json"}]},{"name":"Debug","targets":[{"jsonFile":"target-app.json"}]}]}"#,
            ),
            (
                ".yzpz-build/.cmake/api/v1/reply/target-old.json",
                r#"{"name":"app","type":"EXECUTABLE","artifacts":[{"path":"wrong/Release/app.exe"}]}"#,
            ),
            (
                ".yzpz-build/.cmake/api/v1/reply/target-app.json",
                r#"{"name":"app","type":"EXECUTABLE","artifacts":[{"path":"custom/Debug/app.exe"}]}"#,
            ),
        ]);
        let targets = detect_targets(root.to_str().expect("path")).expect("detection");
        assert_eq!(targets.len(), 1);
        assert!(targets[0].command.contains("custom"));
        assert_eq!(targets[0].id, "cmake:app");
        assert!(!targets[0].command.contains("Release"));
        std::fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn rejects_shell_expansion_in_windows_paths() {
        assert!(quote("bad\npath").is_err());
        if cfg!(target_os = "windows") {
            assert!(quote("%PATH%.py").is_err());
            assert_eq!(
                quote("hello & world.py").expect("quoted"),
                "\"hello & world.py\""
            );
        } else {
            assert_eq!(quote("it's.py").expect("quoted"), "'it'\\''s.py'");
        }
    }
}
