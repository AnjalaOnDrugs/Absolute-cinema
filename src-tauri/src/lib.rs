use serde::{Deserialize, Serialize};
use std::process::Command;
use tauri::Emitter;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Open file in VLC player
#[tauri::command]
fn open_vlc(file_path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // Use powershell to find and launch VLC
        let script = format!(
            "$vlc = Get-Command vlc.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source; \
             if (!$vlc) {{ \
                 $paths = @(\"${{env:ProgramFiles}}\\VideoLAN\\VLC\\vlc.exe\", \"${{env:ProgramFiles(x86)}}\\VideoLAN\\VLC\\vlc.exe\"); \
                 $vlc = $paths | Where-Object {{ Test-Path $_ }} | Select-Object -First 1; \
             }} \
             if ($vlc) {{ \
                 Start-Process $vlc -ArgumentList '\"{}\"'; \
             }} else {{ \
                 exit 1; \
             }}",
            file_path.replace("'", "''")
        );

        let output = Command::new("powershell")
            .args(["-Command", &script])
            .status()
            .map_err(|e| format!("Failed to run PowerShell: {}", e))?;

        if !output.success() {
            return Err(
                "VLC was not found on your system. Please install it from videolan.org".to_string(),
            );
        }

        Ok(())
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-a", "VLC", &file_path])
            .spawn()
            .map_err(|e| format!("Failed to launch VLC: {}", e))?;
        Ok(())
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("vlc")
            .arg(&file_path)
            .spawn()
            .map_err(|e| format!("Failed to launch VLC: {}", e))?;
        Ok(())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![greet, open_vlc,])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.emit("window-close-requested", ());
                let win = window.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(2));
                    let _ = win.destroy();
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
