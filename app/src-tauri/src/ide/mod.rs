mod detector;
mod launcher;

pub use detector::IdeDetector;
pub use launcher::launch_ide;

use crate::types::IdeType;

pub struct IdeConfig {
    pub name: String,
    pub binary_names: Vec<String>,
    #[allow(dead_code)]
    pub windows_binary_names: Vec<String>,
    #[allow(dead_code)]
    pub windows_search_paths: Vec<String>,
    #[allow(dead_code)]
    pub macos_app_names: Vec<String>,
    #[allow(dead_code)]
    pub linux_binary_names: Vec<String>,
}

pub fn get_ide_config(ide: IdeType) -> IdeConfig {
    match ide {
        IdeType::VsCode => IdeConfig {
            name: "Visual Studio Code".to_string(),
            binary_names: vec!["code".to_string(), "code.cmd".to_string()],
            windows_binary_names: vec!["Code.exe".to_string()],
            windows_search_paths: vec!["Microsoft VS Code".to_string(), "VSCode".to_string()],
            macos_app_names: vec!["Visual Studio Code.app".to_string()],
            linux_binary_names: vec!["code".to_string(), "code-oss".to_string()],
        },
        IdeType::VisualStudio => IdeConfig {
            name: "Visual Studio 2022".to_string(),
            binary_names: vec!["devenv".to_string()],
            windows_binary_names: vec!["devenv.exe".to_string(), "WDExpress.exe".to_string()],
            windows_search_paths: vec![
                "Microsoft Visual Studio".to_string(),
                "Microsoft Visual Studio\\2022\\Community\\Common7\\IDE".to_string(),
                "Microsoft Visual Studio\\2022\\Professional\\Common7\\IDE".to_string(),
                "Microsoft Visual Studio\\2022\\Enterprise\\Common7\\IDE".to_string(),
                "Microsoft Visual Studio\\2019\\Community\\Common7\\IDE".to_string(),
                "Microsoft Visual Studio\\2019\\Professional\\Common7\\IDE".to_string(),
                "Microsoft Visual Studio\\2019\\Enterprise\\Common7\\IDE".to_string(),
            ],
            macos_app_names: vec!["Visual Studio.app".to_string()],
            linux_binary_names: vec!["devenv".to_string()],
        },
        IdeType::Cursor => IdeConfig {
            name: "Cursor".to_string(),
            binary_names: vec!["cursor".to_string()],
            windows_binary_names: vec!["Cursor.exe".to_string()],
            windows_search_paths: vec!["Cursor".to_string()],
            macos_app_names: vec!["Cursor.app".to_string()],
            linux_binary_names: vec!["cursor".to_string()],
        },
        IdeType::Zed => IdeConfig {
            name: "Zed".to_string(),
            binary_names: vec!["zed".to_string(), "zed-editor".to_string()],
            windows_binary_names: vec!["zed.exe".to_string()],
            windows_search_paths: vec!["Zed".to_string(), "Zed Editor".to_string()],
            macos_app_names: vec!["Zed.app".to_string()],
            linux_binary_names: vec!["zed".to_string(), "zed-editor".to_string()],
        },
        IdeType::WebStorm => IdeConfig {
            name: "WebStorm".to_string(),
            binary_names: vec!["webstorm".to_string(), "webstorm64".to_string()],
            windows_binary_names: vec!["webstorm64.exe".to_string(), "webstorm.exe".to_string()],
            windows_search_paths: vec![
                "JetBrains\\WebStorm".to_string(),
                "JetBrains\\Toolbox\\apps\\WebStorm".to_string(),
                "JetBrains\\Toolbox\\apps\\WS".to_string(),
            ],
            macos_app_names: vec!["WebStorm.app".to_string()],
            linux_binary_names: vec!["webstorm".to_string()],
        },
        IdeType::IntelliJ => IdeConfig {
            name: "IntelliJ IDEA".to_string(),
            binary_names: vec!["idea".to_string(), "idea64".to_string()],
            windows_binary_names: vec!["idea64.exe".to_string(), "idea.exe".to_string()],
            windows_search_paths: vec![
                "JetBrains\\IntelliJ IDEA".to_string(),
                "JetBrains\\IntelliJ IDEA Community Edition".to_string(),
                "JetBrains\\IntelliJ IDEA Ultimate".to_string(),
                "JetBrains\\Toolbox\\apps\\IntelliJIdea".to_string(),
                "JetBrains\\Toolbox\\apps\\IDEA-U".to_string(),
                "JetBrains\\Toolbox\\apps\\IDEA-C".to_string(),
            ],
            macos_app_names: vec![
                "IntelliJ IDEA.app".to_string(),
                "IntelliJ IDEA CE.app".to_string(),
                "IntelliJ IDEA Ultimate.app".to_string(),
            ],
            linux_binary_names: vec!["idea".to_string(), "idea-ultimate".to_string()],
        },
        IdeType::SublimeText => IdeConfig {
            name: "Sublime Text".to_string(),
            binary_names: vec!["subl".to_string(), "sublime_text".to_string()],
            windows_binary_names: vec!["sublime_text.exe".to_string()],
            windows_search_paths: vec![
                "Sublime Text 3".to_string(),
                "Sublime Text 4".to_string(),
                "Sublime Text".to_string(),
            ],
            macos_app_names: vec!["Sublime Text.app".to_string()],
            linux_binary_names: vec!["subl".to_string(), "sublime_text".to_string()],
        },
        IdeType::Windsurf => IdeConfig {
            name: "Windsurf".to_string(),
            binary_names: vec!["windsurf".to_string()],
            windows_binary_names: vec!["Windsurf.exe".to_string()],
            windows_search_paths: vec!["Windsurf".to_string()],
            macos_app_names: vec!["Windsurf.app".to_string()],
            linux_binary_names: vec!["windsurf".to_string()],
        },
        IdeType::Perplexity => IdeConfig {
            name: "Perplexity".to_string(),
            binary_names: vec!["perplexity".to_string()],
            windows_binary_names: vec!["Perplexity.exe".to_string()],
            windows_search_paths: vec!["Perplexity".to_string()],
            macos_app_names: vec!["Perplexity.app".to_string()],
            linux_binary_names: vec!["perplexity".to_string()],
        },
        IdeType::Antigravity => IdeConfig {
            name: "Antigravity".to_string(),
            binary_names: vec!["antigravity".to_string()],
            windows_binary_names: vec!["Antigravity.exe".to_string()],
            windows_search_paths: vec!["Antigravity".to_string()],
            macos_app_names: vec!["Antigravity.app".to_string()],
            linux_binary_names: vec!["antigravity".to_string()],
        },
    }
}
