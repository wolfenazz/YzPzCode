use std::collections::HashMap;
use std::path::PathBuf;

use super::get_ide_config;
use crate::types::{IdeInfo, IdeType};

pub struct IdeDetector {
    cache: HashMap<IdeType, IdeInfo>,
}

impl IdeDetector {
    pub fn new() -> Self {
        Self {
            cache: HashMap::new(),
        }
    }

    pub fn detect(&mut self, ide: IdeType) -> IdeInfo {
        if let Some(cached) = self.cache.get(&ide) {
            return cached.clone();
        }

        let info = self.detect_ide_internal(ide);
        self.cache.insert(ide, info.clone());
        info
    }

    pub fn detect_all(&mut self) -> HashMap<IdeType, IdeInfo> {
        let all_ides = [
            IdeType::VsCode,
            IdeType::VisualStudio,
            IdeType::Cursor,
            IdeType::Zed,
            IdeType::WebStorm,
            IdeType::IntelliJ,
            IdeType::SublimeText,
            IdeType::Windsurf,
            IdeType::Perplexity,
            IdeType::Antigravity,
        ];

        let mut results = HashMap::new();
        for ide in all_ides {
            let info = self.detect(ide);
            results.insert(ide, info);
        }
        results
    }

    #[allow(dead_code)]
    pub fn clear_cache(&mut self) {
        self.cache.clear();
    }

    fn detect_ide_internal(&self, ide: IdeType) -> IdeInfo {
        let config = get_ide_config(ide);

        let (installed, path) = self.check_ide_installed(&config);

        IdeInfo {
            ide,
            name: config.name,
            binary_name: config.binary_names.first().cloned().unwrap_or_default(),
            installed,
            path,
        }
    }

    fn check_ide_installed(&self, config: &super::IdeConfig) -> (bool, Option<String>) {
        #[cfg(target_os = "windows")]
        {
            self.check_windows(config)
        }

        #[cfg(target_os = "macos")]
        {
            self.check_macos(config)
        }

        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        {
            self.check_linux(config)
        }
    }

    #[cfg(target_os = "windows")]
    fn check_windows(&self, config: &super::IdeConfig) -> (bool, Option<String>) {
        for binary in &config.binary_names {
            if let Ok(path) = which::which(binary) {
                return (true, Some(path.to_string_lossy().to_string()));
            }
        }

        for binary in &config.windows_binary_names {
            if let Ok(path) = which::which(binary) {
                return (true, Some(path.to_string_lossy().to_string()));
            }
        }

        let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let program_files = std::env::var("ProgramFiles").unwrap_or_default();
        let program_files_x86 = std::env::var("ProgramFiles(x86)").unwrap_or_default();

        let mut base_search_paths = vec![
            local_app_data.clone(),
            format!("{}\\Programs", local_app_data),
            program_files.clone(),
            program_files_x86.clone(),
        ];

        for search_subpath in &config.windows_search_paths {
            base_search_paths.push(format!("{}\\{}", local_app_data, search_subpath));
            base_search_paths.push(format!("{}\\Programs\\{}", local_app_data, search_subpath));
            base_search_paths.push(format!("{}\\{}", program_files, search_subpath));
            base_search_paths.push(format!("{}\\{}", program_files_x86, search_subpath));
        }

        for base_path in &base_search_paths {
            let path = PathBuf::from(base_path);
            if !path.exists() {
                continue;
            }

            for binary in &config.windows_binary_names {
                let direct_path = path.join(binary);
                if direct_path.exists() {
                    return (true, Some(direct_path.to_string_lossy().to_string()));
                }

                let bin_path = path.join("bin").join(binary);
                if bin_path.exists() {
                    return (true, Some(bin_path.to_string_lossy().to_string()));
                }

                if let Ok(entries) = std::fs::read_dir(&path) {
                    for entry in entries.flatten() {
                        let entry_path = entry.path();
                        if entry_path.is_dir() {
                            let exe_in_subdir = entry_path.join(binary);
                            if exe_in_subdir.exists() {
                                return (true, Some(exe_in_subdir.to_string_lossy().to_string()));
                            }

                            let bin_in_subdir = entry_path.join("bin").join(binary);
                            if bin_in_subdir.exists() {
                                return (true, Some(bin_in_subdir.to_string_lossy().to_string()));
                            }

                            if let Ok(sub_entries) = std::fs::read_dir(&entry_path) {
                                for sub_entry in sub_entries.flatten() {
                                    let sub_path = sub_entry.path();
                                    if sub_path.is_dir() {
                                        let exe_deep = sub_path.join(binary);
                                        if exe_deep.exists() {
                                            return (
                                                true,
                                                Some(exe_deep.to_string_lossy().to_string()),
                                            );
                                        }
                                        let bin_deep = sub_path.join("bin").join(binary);
                                        if bin_deep.exists() {
                                            return (
                                                true,
                                                Some(bin_deep.to_string_lossy().to_string()),
                                            );
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if let Ok(entries) = std::fs::read_dir(&path) {
                for entry in entries.flatten() {
                    let entry_path = entry.path();
                    if entry_path.is_file() {
                        let file_name = entry_path
                            .file_name()
                            .map(|n| n.to_string_lossy().to_string())
                            .unwrap_or_default();

                        for binary in &config.windows_binary_names {
                            if file_name.eq_ignore_ascii_case(binary) {
                                return (true, Some(entry_path.to_string_lossy().to_string()));
                            }
                        }
                    }
                }
            }
        }

        if self.check_jetbrains_toolbox(&local_app_data, &config.windows_binary_names) {
            return (true, Some("JetBrains Toolbox".to_string()));
        }

        (false, None)
    }

    #[cfg(target_os = "windows")]
    fn check_jetbrains_toolbox(&self, local_app_data: &str, binaries: &[String]) -> bool {
        let toolbox_path = format!("{}\\JetBrains\\Toolbox\\apps", local_app_data);
        let toolbox = PathBuf::from(&toolbox_path);

        if !toolbox.exists() {
            return false;
        }

        fn search_dir(dir: &PathBuf, binaries: &[String], depth: usize) -> bool {
            if depth > 5 {
                return false;
            }

            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();

                    if path.is_file() {
                        if let Some(file_name) = path.file_name() {
                            let name = file_name.to_string_lossy();
                            for binary in binaries {
                                if name.eq_ignore_ascii_case(binary) {
                                    return true;
                                }
                            }
                        }
                    } else if path.is_dir() && search_dir(&path, binaries, depth + 1) {
                        return true;
                    }
                }
            }
            false
        }

        search_dir(&toolbox, binaries, 0)
    }

    #[cfg(target_os = "macos")]
    fn check_macos(&self, config: &super::IdeConfig) -> (bool, Option<String>) {
        for binary in &config.binary_names {
            if let Ok(path) = which::which(binary) {
                return (true, Some(path.to_string_lossy().to_string()));
            }
        }

        for binary in &config.linux_binary_names {
            if let Ok(path) = which::which(binary) {
                return (true, Some(path.to_string_lossy().to_string()));
            }
        }

        if let Ok(home) = std::env::var("HOME") {
            for app_name in &config.macos_app_names {
                let user_app_path = format!("{}/Applications/{}", home, app_name);
                let path = PathBuf::from(&user_app_path);
                if path.exists() {
                    return (true, Some(user_app_path));
                }
            }
        }

        for app_name in &config.macos_app_names {
            let app_path = format!("/Applications/{}", app_name);
            let path = PathBuf::from(&app_path);
            if path.exists() {
                return (true, Some(app_path));
            }
        }

        (false, None)
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    fn check_linux(&self, config: &super::IdeConfig) -> (bool, Option<String>) {
        for binary in &config.binary_names {
            if let Ok(path) = which::which(binary) {
                return (true, Some(path.to_string_lossy().to_string()));
            }
        }

        for binary in &config.linux_binary_names {
            if let Ok(path) = which::which(binary) {
                return (true, Some(path.to_string_lossy().to_string()));
            }
        }

        if let Some(flatpak_path) = self.check_flatpak(&config.name) {
            return (true, Some(flatpak_path));
        }

        if let Some(snap_path) = self.check_snap(&config.name) {
            return (true, Some(snap_path));
        }

        let home = std::env::var("HOME").unwrap_or_default();
        let desktop_files_paths = [
            "/usr/share/applications",
            "/usr/local/share/applications",
            &format!("{}/.local/share/applications", home),
            "/var/lib/snapd/desktop/applications",
        ];

        for apps_path in &desktop_files_paths {
            let path = PathBuf::from(apps_path);
            if !path.exists() {
                continue;
            }

            if let Ok(entries) = std::fs::read_dir(&path) {
                for entry in entries.flatten() {
                    let file_name = entry.file_name().to_string_lossy().to_lowercase();

                    let name_variations = self.get_name_variations(&config.name);
                    for variation in &name_variations {
                        if file_name.contains(variation) {
                            return (
                                true,
                                Some(format!(
                                    "{}/{}",
                                    apps_path,
                                    entry.file_name().to_string_lossy()
                                )),
                            );
                        }
                    }
                }
            }
        }

        (false, None)
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    fn check_flatpak(&self, name: &str) -> Option<String> {
        let output = std::process::Command::new("flatpak")
            .args(["list", "--app", "--columns=application,name"])
            .output()
            .ok()?;

        if !output.status.success() {
            return None;
        }

        let list = String::from_utf8_lossy(&output.stdout);
        let name_lower = name.to_lowercase();

        for line in list.lines() {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 2 {
                let app_name = parts[1].to_lowercase();
                if app_name.contains(&name_lower) || name_lower.contains(&app_name) {
                    return Some(format!("flatpak:{}", parts[0]));
                }
            }
        }

        None
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    fn check_snap(&self, name: &str) -> Option<String> {
        let snap_names = self.get_snap_names(name);

        for snap_name in &snap_names {
            let snap_path = format!("/snap/bin/{}", snap_name);
            if std::path::Path::new(&snap_path).exists() {
                return Some(snap_path);
            }
        }

        None
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    fn get_snap_names(&self, name: &str) -> Vec<String> {
        let snap_map = [
            ("Visual Studio Code", vec!["code", "vscode"]),
            ("Cursor", vec!["cursor"]),
            ("Zed", vec!["zed"]),
            ("WebStorm", vec!["webstorm"]),
            (
                "IntelliJ IDEA",
                vec!["intellij-idea-community", "intellij-idea-ultimate"],
            ),
            ("Sublime Text", vec!["sublime-text"]),
            ("Windsurf", vec!["windsurf"]),
        ];

        let name_lower = name.to_lowercase();
        for (ide_name, snaps) in snap_map {
            if name_lower.contains(&ide_name.to_lowercase())
                || ide_name.to_lowercase().contains(&name_lower)
            {
                return snaps.iter().map(|s| s.to_string()).collect();
            }
        }

        vec![name.to_lowercase().replace(' ', "-")]
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    fn get_name_variations(&self, name: &str) -> Vec<String> {
        let mut variations = Vec::new();
        let lower = name.to_lowercase();
        variations.push(lower.replace(' ', "-"));
        variations.push(lower.replace(' ', "_"));
        variations.push(lower.replace(' ', ""));
        variations
    }
}

impl Clone for IdeDetector {
    fn clone(&self) -> Self {
        Self {
            cache: self.cache.clone(),
        }
    }
}

impl Default for IdeDetector {
    fn default() -> Self {
        Self::new()
    }
}
