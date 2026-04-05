mod agent;
mod agent_cli;
mod commands;
mod filesystem;
mod ide;
mod terminal;
mod types;
mod utils;

use agent::AgentExecutor;
use agent_cli::{AgentCliDetector, AgentCliInstaller, CliLauncher};
use ide::IdeDetector;
use tauri::Listener;
#[cfg(target_os = "macos")]
use tauri::Manager;
use terminal::TerminalManager;

fn setup_panic_hooks() {
    std::panic::set_hook(Box::new(|panic_info| {
        let message = if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = panic_info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "Unknown panic occurred".to_string()
        };

        let location = panic_info
            .location()
            .map(|loc| format!("{}:{}:{}", loc.file(), loc.line(), loc.column()))
            .unwrap_or_else(|| "unknown location".to_string());

        eprintln!("[PANIC] {} at {}", message, location);
        eprintln!(
            "[PANIC] Backtrace: {:?}",
            std::backtrace::Backtrace::capture()
        );
    }));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    setup_panic_hooks();
    utils::env::init_user_environment();

    let terminal_manager = TerminalManager::new();
    let default_provider = agent_cli::get_provider(crate::types::AgentType::Claude);
    let agent_executor = AgentExecutor::new(default_provider);
    let cli_detector = AgentCliDetector::new();
    let mut cli_installer = AgentCliInstaller::new();
    let cli_launcher = CliLauncher::new(terminal_manager.clone());
    let ide_detector = IdeDetector::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(terminal_manager.clone())
        .manage(agent_executor.clone())
        .manage(cli_detector.clone())
        .manage(cli_installer.clone())
        .manage(cli_launcher.clone())
        .manage(ide_detector.clone())
        .setup(move |app| {
            terminal_manager.set_app_handle(app.handle().clone());
            agent_executor.set_app_handle(app.handle().clone());
            cli_installer.set_app_handle(app.handle().clone());
            cli_launcher.set_app_handle(app.handle().clone());

            #[cfg(target_os = "macos")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    if let Err(e) = window.set_decorations(true) {
                        eprintln!("Warning: failed to set window decorations: {}", e);
                    }
                }
            }

            {
                let terminal_manager_clone = terminal_manager.clone();

                app.listen("tauri://close-requested", move |_event| {
                    if let Err(e) = terminal_manager_clone.kill_all_sessions() {
                        eprintln!("Warning: failed to kill sessions on close-requested: {}", e);
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_terminal_sessions,
            commands::create_single_terminal_session,
            commands::write_to_terminal,
            commands::resize_terminal,
            commands::kill_session,
            commands::kill_workspace_sessions,
            commands::get_all_sessions,
            commands::execute_agent_task,
            commands::get_agent_task_status,
            commands::cancel_agent_task,
            commands::check_prerequisites,
            commands::detect_agent_cli,
            commands::detect_all_agent_clis,
            commands::clear_cli_cache,
            commands::install_agent_cli,
            commands::get_install_command,
            commands::open_install_terminal,
            commands::launch_cli_in_terminal,
            commands::stop_cli_in_terminal,
            commands::restart_cli_in_terminal,
            commands::get_cli_launch_state,
            commands::get_all_cli_launch_states,
            commands::check_cli_auth,
            commands::check_all_cli_auth,
            commands::get_auth_instructions,
            commands::get_cli_binary_name,
            commands::open_url,
            commands::minimize_window,
            commands::maximize_window,
            commands::close_window,
            commands::detect_ide,
            commands::detect_all_ides_cmd,
            commands::launch_ide_cmd,
            commands::send_feedback,
            commands::get_os_version,
            commands::launch_external_terminals,
            commands::list_directory_entries,
            commands::list_all_files,
            commands::read_file_content,
            commands::write_file_content,
            commands::get_git_status,
            commands::get_git_diff_stats,
            commands::get_git_file_content,
            commands::start_fs_watcher,
            commands::stop_fs_watcher,
            commands::read_file_as_base64,
            commands::is_binary_file,
            commands::get_file_size,
            commands::rename_entry,
            commands::move_entry,
            commands::create_file,
            commands::create_directory,
            commands::delete_entry,
            commands::reveal_in_file_manager,
            commands::duplicate_entry,
            commands::git_stage_file,
            commands::git_unstage_file,
            commands::get_available_shells,
            commands::import_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
