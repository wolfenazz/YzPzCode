mod agent;
mod agent_cli;
mod agent_host;
mod browser;
mod commands;
mod discord_presence;
mod filesystem;
mod ide;
mod terminal;
mod types;
mod utils;

use agent::AgentExecutor;
use agent_cli::{AgentCliDetector, AgentCliInstaller, CliLauncher};
use agent_host::AgentHostManager;
use browser::BrowserManager;
use discord_presence::DiscordPresenceManager;
use ide::IdeDetector;
use tauri::{Listener, Manager, WebviewUrl, WebviewWindowBuilder};
use terminal::{ManagedCommandManager, TerminalManager};

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
    let managed_command_manager = ManagedCommandManager::new();
    let browser_manager = BrowserManager::new();
    let ide_detector = IdeDetector::new();
    let discord_manager = DiscordPresenceManager::new();
    let agent_host_manager = AgentHostManager::new();

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
        .manage(managed_command_manager.clone())
        .manage(browser_manager.clone())
        .manage(ide_detector.clone())
        .manage(discord_manager.clone())
        .manage(agent_host_manager.clone())
        .setup(move |app| {
            terminal_manager.set_app_handle(app.handle().clone());
            agent_executor.set_app_handle(app.handle().clone());
            cli_installer.set_app_handle(app.handle().clone());
            cli_launcher.set_app_handle(app.handle().clone());
            managed_command_manager.set_app_handle(app.handle().clone());
            browser_manager.set_app_handle(app.handle().clone());
            agent_host_manager.set_app_handle(app.handle().clone());

            // On some Windows/WebView2 installations the configured window can
            // fail to materialize, leaving yzpzcode.exe alive with no top-level
            // window. Restore that window explicitly so a failed automatic
            // creation never looks like the app flashed and exited.
            let main_window = match app.get_webview_window("main") {
                Some(window) => window,
                None => {
                    eprintln!("Main window was not created from config; creating it explicitly");
                    WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                        .title("YzPzCode")
                        .inner_size(1200.0, 800.0)
                        .min_inner_size(1020.0, 810.0)
                        .decorations(false)
                        .build()?
                }
            };
            if let Err(error) = main_window.show() {
                eprintln!("Warning: failed to show main window: {error}");
            }
            #[cfg(target_os = "windows")]
            if let Err(error) = main_window.center() {
                eprintln!("Warning: failed to center main window: {error}");
            }
            if let Err(error) = main_window.set_focus() {
                eprintln!("Warning: failed to focus main window: {error}");
            }

            #[cfg(target_os = "macos")]
            {
                if let Err(error) = main_window.set_decorations(true) {
                    eprintln!("Warning: failed to set window decorations: {error}");
                }
            }

            {
                let terminal_manager_clone = terminal_manager.clone();
                let managed_command_manager_clone = managed_command_manager.clone();
                let browser_manager_clone = browser_manager.clone();
                let agent_host_manager_clone = agent_host_manager.clone();

                app.listen("tauri://close-requested", move |_event| {
                    if let Err(e) = managed_command_manager_clone.stop_all() {
                        eprintln!(
                            "Warning: failed to stop managed commands on close-requested: {}",
                            e
                        );
                    }
                    if let Err(e) = terminal_manager_clone.kill_all_sessions() {
                        eprintln!("Warning: failed to kill sessions on close-requested: {}", e);
                    }
                    if let Err(e) = browser_manager_clone.close_all() {
                        eprintln!(
                            "Warning: failed to close browser views on close-requested: {}",
                            e
                        );
                    }
                    agent_host_manager_clone.shutdown();
                });
            }

            // Warm the YZPZ Agent sidecar in the background right after launch
            // so the first agent pane (new or resumed) opens immediately
            // instead of paying the Node + ClineCore cold start on click.
            // The keep-alive changes in AgentHostManager mean this warm sidecar
            // stays ready for the whole app session.
            {
                let agent_host_manager_warm = agent_host_manager.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
                    if let Err(error) = agent_host_manager_warm.ensure_running().await {
                        eprintln!("[yzpz-agent] background pre-warm failed: {error}");
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
            commands::run_managed_terminal_command,
            commands::stop_managed_terminal_command,
            commands::get_managed_terminal_command_state,
            commands::ensure_browser_view,
            commands::resize_browser_view,
            commands::navigate_browser_view,
            commands::reload_browser_view,
            commands::set_browser_view_visibility,
            commands::close_browser_view,
            commands::pop_out_browser_view,
            commands::dock_browser_view,
            commands::set_browser_inspect_mode,
            commands::set_browser_zoom,
            commands::set_browser_preview_chrome,
            commands::browser_go_back,
            commands::browser_go_forward,
            commands::request_browser_snapshot,
            commands::browser_element_selected,
            commands::browser_inspect_cancelled,
            commands::browser_page_state_changed,
            commands::browser_snapshot_exported,
            commands::set_browser_pick_style_mode,
            commands::set_browser_pick_ui_element_mode,
            commands::set_browser_apply_mode,
            commands::undo_browser_style,
            commands::browser_style_captured,
            commands::browser_ui_element_captured,
            commands::browser_style_applied,
            commands::execute_agent_task,
            commands::get_agent_task_status,
            commands::cancel_agent_task,
            commands::check_prerequisites,
            commands::check_nodejs,
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
            commands::detect_all_tool_clis,
            commands::check_all_tool_auths,
            commands::get_tool_install_command,
            commands::open_tool_install_terminal,
            commands::get_prerequisite_install_command,
            commands::open_prerequisite_install_terminal,
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
            commands::launch_external_command,
            commands::path_exists,
            commands::list_directory_entries,
            commands::list_all_files,
            commands::list_all_entries,
            commands::read_file_content,
            commands::write_file_content,
            commands::write_file_bytes,
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
            commands::git_file_diff,
            commands::git_commit,
            commands::git_discard_file,
            commands::git_log,
            commands::git_branches,
            commands::git_checkout,
            commands::git_remote_info,
            commands::git_fetch,
            commands::git_push,
            commands::git_pull,
            commands::create_file_backup,
            commands::list_file_backups,
            commands::restore_file_backup,
            commands::restore_from_trash,
            commands::search_files,
            commands::list_docker_containers,
            commands::docker_start,
            commands::docker_stop,
            commands::sqlite_list_tables,
            commands::sqlite_query,
            commands::get_available_shells,
            commands::import_files,
            commands::copy_entry,
            commands::enable_discord_presence,
            commands::disable_discord_presence,
            commands::is_discord_presence_enabled,
            commands::update_discord_activity,
            commands::clear_discord_activity,
            commands::ensure_agent_host,
            commands::get_agent_host_status,
            commands::create_agent_session,
            commands::send_agent_message,
            commands::resume_agent_session,
            commands::abort_agent_session,
            commands::stop_agent_session,
            commands::close_agent_session,
            commands::delete_agent_session,
            commands::list_agent_sessions,
            commands::get_agent_session,
            commands::read_agent_messages,
            commands::get_agent_session_preview,
            commands::update_agent_session_title,
            commands::update_agent_session_model,
            commands::set_agent_fast_mode,
            commands::list_pending_prompts,
            commands::remove_pending_prompt,
            commands::approve_agent_tool,
            commands::get_agent_providers,
            commands::get_agent_models,
            commands::refresh_agent_catalogs,
            commands::set_agent_provider_config,
            commands::list_agent_provider_configs,
            commands::remove_agent_provider_config,
            commands::get_agent_provider_config_fields,
            commands::login_agent_openai_codex,
            commands::resolve_agent_oauth_prompt,
            commands::get_agent_session_usage,
            commands::update_agent_session_connection,
            commands::get_agent_settings,
            commands::update_agent_settings,
            commands::set_agent_tool_policy,
            commands::clear_agent_tool_policy,
            commands::list_agent_user_instructions,
            commands::add_agent_user_instruction,
            commands::toggle_agent_user_instruction,
            commands::list_agent_runtime_commands,
            commands::answer_agent_question,
            commands::list_agent_mcp_servers,
            commands::add_agent_mcp_server,
            commands::remove_agent_mcp_server,
            commands::set_agent_mcp_server_disabled,
            commands::shutdown_agent_host,
            commands::translate_prompt_to_english,
            commands::translate_text,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
