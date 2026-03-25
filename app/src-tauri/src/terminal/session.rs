use anyhow::Result;
use portable_pty::{native_pty_system, CommandBuilder, PtyPair, PtySize};
use std::io::{Read, Write};

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver};
use std::sync::Arc;
use std::thread;
use uuid::Uuid;

use crate::types::{get_default_shell, AgentType, SessionStatus, TerminalSession};

pub struct PtySession {
    pub session: TerminalSession,
    pub pair: PtyPair,
    pub writer: Box<dyn Write + Send>,
    pub kill_flag: Arc<AtomicBool>,
    pub child_pid: Option<u32>,
}

impl PtySession {
    pub fn create(
        workspace_id: String,
        index: usize,
        cwd: String,
        agent: Option<AgentType>,
    ) -> Result<(Self, Receiver<Vec<u8>>)> {
        let pty_system = native_pty_system();
        let pair = pty_system.openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        let shell = get_default_shell();
        let session_id = Uuid::new_v4().to_string();

        println!("PtySession::create: shell={}, cwd={}", shell, cwd);

        // Canonicalize or at least check if path exists
        let path = std::path::Path::new(&cwd);
        if !path.exists() {
            return Err(anyhow::anyhow!("Workspace path does not exist: {}", cwd));
        }
        if !path.is_dir() {
            return Err(anyhow::anyhow!(
                "Workspace path is not a directory: {}",
                cwd
            ));
        }

        let session = TerminalSession {
            id: session_id.clone(),
            workspace_id,
            index,
            cwd: cwd.clone(),
            agent,
            status: SessionStatus::Idle,
            shell: shell.clone(),
        };

        let mut cmd = CommandBuilder::new(&shell);
        cmd.cwd(cwd.clone());

        #[cfg(target_os = "windows")]
        {
            if let Ok(path) = std::env::var("PATH") {
                cmd.env("PATH", path);
            }
            if let Ok(appdata) = std::env::var("APPDATA") {
                cmd.env("APPDATA", appdata);
            }
            if let Ok(local) = std::env::var("LOCALAPPDATA") {
                cmd.env("LOCALAPPDATA", local);
            }
            if let Ok(home) = std::env::var("USERPROFILE") {
                cmd.env("USERPROFILE", home.clone());
                cmd.env("HOME", home);
            }
            if let Ok(comspec) = std::env::var("COMSPEC") {
                cmd.env("COMSPEC", comspec);
            }
        }

        #[cfg(target_os = "macos")]
        {
            if let Ok(path) = std::env::var("PATH") {
                cmd.env("PATH", path);
            }
            if let Ok(home) = std::env::var("HOME") {
                cmd.env("HOME", home);
            }
            if let Ok(user) = std::env::var("USER") {
                cmd.env("USER", user);
            }
            if let Ok(shell) = std::env::var("SHELL") {
                cmd.env("SHELL", shell);
            }
            if let Ok(tmpdir) = std::env::var("TMPDIR") {
                cmd.env("TMPDIR", tmpdir);
            }
            if let Ok(term) = std::env::var("TERM") {
                cmd.env("TERM", term);
            } else {
                cmd.env("TERM", "xterm-256color");
            }
            cmd.env("LANG", "en_US.UTF-8");
            cmd.env("LC_ALL", "en_US.UTF-8");
        }

        #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
        {
            if let Ok(path) = std::env::var("PATH") {
                cmd.env("PATH", path);
            }
            if let Ok(home) = std::env::var("HOME") {
                cmd.env("HOME", home);
            }
            if let Ok(user) = std::env::var("USER") {
                cmd.env("USER", user);
            }
            if let Ok(logname) = std::env::var("LOGNAME") {
                cmd.env("LOGNAME", logname);
            }
            if let Ok(shell) = std::env::var("SHELL") {
                cmd.env("SHELL", shell);
            }
            if let Ok(term) = std::env::var("TERM") {
                cmd.env("TERM", term);
            } else {
                cmd.env("TERM", "xterm-256color");
            }
            if let Ok(display) = std::env::var("DISPLAY") {
                cmd.env("DISPLAY", display);
            }
            if let Ok(xdg_session_type) = std::env::var("XDG_SESSION_TYPE") {
                cmd.env("XDG_SESSION_TYPE", xdg_session_type);
            }
            if let Ok(xdg_current_desktop) = std::env::var("XDG_CURRENT_DESKTOP") {
                cmd.env("XDG_CURRENT_DESKTOP", xdg_current_desktop);
            }
            cmd.env("LANG", "en_US.UTF-8");
            cmd.env("LC_ALL", "en_US.UTF-8");
        }

        // Add flags to hide the window for PowerShell
        if shell.to_lowercase().contains("powershell") || shell.to_lowercase().contains("pwsh") {
            cmd.arg("-NoLogo");
        }

        println!("Spawning command: {:?}", cmd);
        let child = pair.slave.spawn_command(cmd)?;
        let child_pid = child.process_id();
        println!("Command spawned successfully with PID: {:?}", child_pid);

        let writer = pair.master.take_writer()?;

        let (output_tx, output_rx) = mpsc::channel();

        let kill_flag = Arc::new(AtomicBool::new(false));
        let kill_flag_clone = kill_flag.clone();
        let output_tx_clone = output_tx.clone();

        let mut reader = pair.master.try_clone_reader()?;
        thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                if kill_flag_clone.load(Ordering::Relaxed) {
                    break;
                }
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        if output_tx_clone.send(buf[..n].to_vec()).is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        if e.kind() != std::io::ErrorKind::WouldBlock {
                            break;
                        }
                    }
                }
            }
        });

        drop(output_tx);
        drop(child);

        Ok((
            PtySession {
                session,
                pair,
                writer,
                kill_flag,
                child_pid,
            },
            output_rx,
        ))
    }

    pub fn write(&mut self, data: &[u8]) -> Result<()> {
        self.writer.write_all(data)?;
        self.writer.flush()?;
        Ok(())
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<()> {
        self.pair.master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;
        Ok(())
    }

    pub fn kill(&mut self) {
        self.kill_flag.store(true, Ordering::Relaxed);

        let _ = self.writer.write_all(&[3]);
        let _ = self.writer.flush();

        if let Some(pid) = self.child_pid {
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                use std::process::Command;

                const CREATE_NO_WINDOW: u32 = 0x08000000;

                let _ = Command::new("taskkill")
                    .args(["/F", "/T", "/PID"])
                    .arg(pid.to_string())
                    .creation_flags(CREATE_NO_WINDOW)
                    .output();
            }

            #[cfg(not(target_os = "windows"))]
            {
                use std::process::Command;

                let _ = Command::new("kill")
                    .args(["-9"])
                    .arg(pid.to_string())
                    .stdin(std::process::Stdio::null())
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .output();
            }
        }
    }

    pub fn get_session(&self) -> &TerminalSession {
        &self.session
    }
}
