mod agent;
mod agent_cli;
mod browser;
mod commands;
mod discord_presence;
mod extension_host;
mod filesystem;
mod ide;
mod open_files;
mod terminal;
mod types;
mod utils;

use agent::AgentExecutor;
use agent_cli::{AgentCliDetector, AgentCliInstaller, CliLauncher};
use browser::BrowserManager;
use discord_presence::DiscordPresenceManager;
use ide::IdeDetector;
#[cfg(any(not(debug_assertions), target_os = "macos"))]
use tauri::Emitter;
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

#[cfg(any(not(debug_assertions), target_os = "macos"))]
fn focus_main_window_and_notify(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
    let _ = app.emit("open-files-requested", ());
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
    let open_file_manager = open_files::OpenFileManager::default();
    let extension_host_manager = extension_host::ExtensionHostManager::default();
    let launch_directory =
        std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    open_file_manager.enqueue_candidates(std::env::args_os().skip(1), &launch_directory);
    #[cfg(not(debug_assertions))]
    let single_instance_open_file_manager = open_file_manager.clone();

    // This plugin must be registered first. A file opened while YzPzCode is
    // already running launches a short-lived second process; the plugin
    // forwards its arguments to this callback in the original process.
    //
    // It is release-only on purpose: the plugin guards a mutex named after the
    // bundle identifier, which debug and release builds share. Registering it in
    // `tauri dev` makes the dev build exit immediately whenever an installed
    // YzPzCode is running (the plugin calls `process::exit(0)` on the duplicate),
    // leaving an empty dev session. Disabling it in debug keeps file-association
    // forwarding available in shipped builds while letting dev run alongside the
    // installed app.
    #[cfg(not(debug_assertions))]
    let builder = tauri::Builder::default().plugin(tauri_plugin_single_instance::init(
        move |app, args, cwd| {
            let added = single_instance_open_file_manager
                .enqueue_candidates(args.into_iter().skip(1), std::path::Path::new(&cwd));

            if added == 0 {
                return;
            }

            focus_main_window_and_notify(app);
        },
    ));

    #[cfg(debug_assertions)]
    let builder = tauri::Builder::default();

    let app = builder
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
        .manage(open_file_manager)
        .manage(extension_host_manager)
        .setup(move |app| {
            terminal_manager.set_app_handle(app.handle().clone());
            agent_executor.set_app_handle(app.handle().clone());
            cli_installer.set_app_handle(app.handle().clone());
            cli_launcher.set_app_handle(app.handle().clone());
            managed_command_manager.set_app_handle(app.handle().clone());
            browser_manager.set_app_handle(app.handle().clone());

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
                });
            }

            Ok(())
        })
        .invoke_handler({
            let handler: fn(tauri::ipc::Invoke) -> bool = tauri::generate_handler![
                commands::list_supported_extensions,
                commands::install_workspace_extension,
                commands::check_extension_updates,
                commands::start_extension_panel,
                commands::sync_extension_panel,
                commands::close_extension_panel,
                commands::close_workspace_extension_panels,
                commands::create_terminal_sessions,
                commands::create_single_terminal_session,
                commands::write_to_terminal,
                commands::resize_terminal,
                commands::kill_session,
                commands::kill_workspace_sessions,
                commands::get_all_sessions,
                commands::run_managed_terminal_command,
                commands::get_project_run_targets,
                commands::send_managed_terminal_input,
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
                commands::preview_browser_element_styles,
                commands::clear_browser_element_preview,
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
                commands::get_os_version,
                commands::launch_external_terminals,
                commands::launch_external_command,
                commands::path_exists,
                commands::take_pending_open_files,
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
            ];
            move |invoke: tauri::ipc::Invoke| {
                // Extension content uses VS Code's own API. It must never gain
                // access to the application's filesystem and terminal commands.
                if invoke
                    .message
                    .webview_ref()
                    .label()
                    .starts_with("extension-panel-")
                {
                    invoke
                        .resolver
                        .reject("Extension panels cannot call application commands");
                    true
                } else {
                    handler(invoke)
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    #[cfg(target_os = "macos")]
    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            app.state::<extension_host::ExtensionHostManager>()
                .shutdown();
        }
        // macOS delivers Finder/Open-With requests as file URLs instead of
        // process arguments. Keeping them in the same durable queue gives
        // the frontend identical behavior on every desktop platform.
        if let tauri::RunEvent::Opened { urls } = event {
            let file_paths = urls
                .into_iter()
                .filter_map(|url| url.to_file_path().ok())
                .collect::<Vec<_>>();
            let manager = app.state::<open_files::OpenFileManager>();
            if manager.enqueue_candidates(file_paths, std::path::Path::new(".")) > 0 {
                focus_main_window_and_notify(app);
            }
        }
    });

    #[cfg(not(target_os = "macos"))]
    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            app.state::<extension_host::ExtensionHostManager>()
                .shutdown();
        }
    });
}
