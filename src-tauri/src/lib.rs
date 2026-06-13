use librqbit::api::{Api, TorrentIdOrHash};
use librqbit::{AddTorrent, AddTorrentOptions, Session};
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::Arc;
use tauri::Emitter;
use tauri::State;
use tokio::sync::Mutex;

/// Holds the librqbit session + API (initialized lazily on first download)
struct TorrentState {
    session: Mutex<Option<Arc<Session>>>,
    api: Mutex<Option<Api>>,
}

/// Progress info sent back to the frontend
#[derive(Clone, Serialize, Deserialize)]
struct TorrentProgress {
    id: usize,
    name: String,
    progress_pct: f64,
    downloaded_bytes: u64,
    total_bytes: u64,
    download_speed: f64,
    upload_speed: f64,
    state: String,
    peers: u32,
}

/// Summary of all active torrents
#[derive(Clone, Serialize, Deserialize)]
struct TorrentListItem {
    id: usize,
    name: String,
    progress_pct: f64,
    state: String,
    download_speed: f64,
    total_bytes: u64,
    downloaded_bytes: u64,
}

// ===== YTS API types =====

#[derive(Clone, Serialize, Deserialize, Debug)]
struct YTSTorrent {
    url: Option<String>,
    hash: String,
    quality: String,
    #[serde(rename = "type")]
    torrent_type: Option<String>,
    seeds: Option<u32>,
    peers: Option<u32>,
    size: Option<String>,
    size_bytes: Option<u64>,
    video_codec: Option<String>,
    audio_channels: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
struct YTSMovie {
    id: u64,
    title: String,
    title_long: Option<String>,
    year: Option<u32>,
    rating: Option<f64>,
    runtime: Option<u32>,
    genres: Option<Vec<String>>,
    summary: Option<String>,
    small_cover_image: Option<String>,
    medium_cover_image: Option<String>,
    large_cover_image: Option<String>,
    torrents: Option<Vec<YTSTorrent>>,
}

#[derive(Deserialize, Debug)]
struct YTSData {
    movies: Option<Vec<YTSMovie>>,
}

#[derive(Deserialize, Debug)]
#[allow(dead_code)]
struct YTSResponse {
    status: Option<String>,
    data: Option<YTSData>,
}

/// YTS domains to try (yts.mx is dead, these are the current alternatives)
const YTS_DOMAINS: &[&str] = &["yts.bz", "yts.lt", "yts.am"];

/// Resolve a domain name using Cloudflare DNS-over-HTTPS (bypasses ISP DNS blocks)
async fn resolve_via_doh(domain: &str) -> Result<std::net::IpAddr, String> {
    eprintln!("[DoH] Resolving {} via Cloudflare DoH", domain);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("Failed to create DoH client: {}", e))?;

    let resp = client
        .get("https://cloudflare-dns.com/dns-query")
        .query(&[("name", domain), ("type", "A")])
        .header("accept", "application/dns-json")
        .send()
        .await
        .map_err(|e| format!("DoH query failed: {}", e))?;

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("DoH response parse failed: {}", e))?;

    let ip_str = json["Answer"]
        .as_array()
        .and_then(|answers| {
            answers
                .iter()
                .find(|r| r["type"].as_u64() == Some(1)) // type 1 = A record
                .and_then(|r| r["data"].as_str())
        })
        .ok_or_else(|| format!("No A record found for {} (domain may be down)", domain))?;

    let ip: std::net::IpAddr = ip_str
        .parse()
        .map_err(|e| format!("Invalid IP '{}': {}", ip_str, e))?;

    eprintln!("[DoH] Resolved {} -> {}", domain, ip);
    Ok(ip)
}

/// Try to fetch YTS movies from a specific domain
async fn try_yts_domain(domain: &str, query: &str) -> Result<Vec<YTSMovie>, String> {
    eprintln!("[YTS] Trying domain: {}", domain);

    // Resolve IP via DoH to bypass ISP blocks
    let ip = resolve_via_doh(domain).await?;
    let addr = std::net::SocketAddr::new(ip, 443);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .resolve(domain, addr)
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let url = format!("https://{}/api/v2/list_movies.json", domain);
    eprintln!("[YTS] Requesting: {} (via IP {})", url, ip);

    let resp = client
        .get(&url)
        .query(&[
            ("query_term", query),
            ("limit", "5"),
            ("sort_by", "relevance"),
        ])
        .send()
        .await
        .map_err(|e| format!("Request to {} failed: {}", domain, e))?;

    let status = resp.status();
    eprintln!("[YTS] Response status: {} from {}", status, domain);

    if !status.is_success() {
        return Err(format!("{} returned HTTP {}", domain, status));
    }

    let raw_text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read response from {}: {}", domain, e))?;

    eprintln!("[YTS] Response from {}: {} bytes", domain, raw_text.len());

    let json: YTSResponse = serde_json::from_str(&raw_text)
        .map_err(|e| format!("Failed to parse JSON from {}: {}", domain, e))?;

    match json.data {
        Some(data) => {
            let movies = data.movies.unwrap_or_default();
            eprintln!("[YTS] Found {} movies from {}", movies.len(), domain);
            for m in &movies {
                eprintln!(
                    "[YTS]   - {} ({:?}) with {} torrents",
                    m.title,
                    m.year,
                    m.torrents.as_ref().map(|t| t.len()).unwrap_or(0)
                );
            }
            Ok(movies)
        }
        None => Ok(vec![]),
    }
}

/// Search YTS for movies – tries multiple domains with DoH bypass
#[tauri::command]
async fn yts_search(query: String) -> Result<Vec<YTSMovie>, String> {
    eprintln!("[YTS] Searching for: '{}'", query);

    let mut last_error = String::from("No YTS domains available");

    for domain in YTS_DOMAINS {
        match try_yts_domain(domain, &query).await {
            Ok(movies) => {
                eprintln!("[YTS] Success via {}", domain);
                return Ok(movies);
            }
            Err(e) => {
                eprintln!("[YTS] {} failed: {}", domain, e);
                last_error = format!("{}: {}", domain, e);
                // Continue to next domain
            }
        }
    }

    Err(format!(
        "All YTS domains failed. Last error: {}",
        last_error
    ))
}

// ===== Torrent engine helpers =====

/// Ensure the torrent session is initialized and return the Api handle
async fn ensure_session(state: &TorrentState, download_dir: &str) -> Result<Api, String> {
    let mut session_guard = state.session.lock().await;
    let mut api_guard = state.api.lock().await;

    if let Some(ref api) = *api_guard {
        return Ok(api.clone());
    }

    std::fs::create_dir_all(download_dir)
        .map_err(|e| format!("Failed to create download directory: {}", e))?;

    let session = Session::new(download_dir.into())
        .await
        .map_err(|e| format!("Failed to create torrent session: {}", e))?;

    let api = Api::new(session.clone(), None);
    *session_guard = Some(session);
    *api_guard = Some(api.clone());
    Ok(api)
}

fn get_api(api_guard: &Option<Api>) -> Result<Api, String> {
    api_guard
        .as_ref()
        .cloned()
        .ok_or_else(|| "No torrent session active".to_string())
}

/// Start downloading a torrent from a magnet link
#[tauri::command]
async fn torrent_add_magnet(
    state: State<'_, TorrentState>,
    magnet_link: String,
    download_dir: String,
) -> Result<usize, String> {
    eprintln!("[TORRENT] Request to add magnet link");
    eprintln!("[TORRENT]   Link length: {}", magnet_link.len());
    eprintln!(
        "[TORRENT]   Link preview: {}",
        &magnet_link[..magnet_link.len().min(100)]
    );
    eprintln!("[TORRENT]   Download dir: {}", download_dir);

    let api = ensure_session(&state, &download_dir).await?;
    let session = api.session();

    eprintln!("[TORRENT] Session ready, adding torrent to librqbit...");

    let handle = session
        .add_torrent(
            AddTorrent::from_url(&magnet_link),
            Some(AddTorrentOptions {
                output_folder: Some(download_dir.into()),
                overwrite: true,
                ..Default::default()
            }),
        )
        .await
        .map_err(|e| {
            eprintln!("[TORRENT] ERROR adding torrent: {}", e);
            format!("Failed to add torrent: {}", e)
        })?
        .into_handle()
        .ok_or_else(|| {
            eprintln!("[TORRENT] ERROR: Response was list-only, no handle");
            "Torrent was a listing-only response".to_string()
        })?;

    eprintln!("[TORRENT] Successfully added torrent. ID: {}", handle.id());
    Ok(handle.id())
}

/// Get the progress/status of a specific torrent by ID
#[tauri::command]
async fn torrent_get_progress(
    state: State<'_, TorrentState>,
    torrent_id: usize,
) -> Result<TorrentProgress, String> {
    let api_guard = state.api.lock().await;
    let api = get_api(&api_guard)?;

    // Get the name from details
    let name = match api.api_torrent_details(TorrentIdOrHash::Id(torrent_id)) {
        Ok(details) => details.name.unwrap_or_else(|| "Unknown".to_string()),
        Err(_) => "Unknown".to_string(),
    };

    // Get the actual stats
    match api.api_stats_v1(TorrentIdOrHash::Id(torrent_id)) {
        Ok(stats) => {
            let total = stats.total_bytes;
            let progress_bytes = stats.progress_bytes;
            let progress_pct = if total > 0 {
                (progress_bytes as f64 / total as f64) * 100.0
            } else {
                0.0
            };

            // Debug print
            // eprintln!("[TORRENT_PROGRESS] ID: {}, Name: {}, Total: {}, Progress: {}, State: {:?}", torrent_id, name, total, progress_bytes, stats.state);

            Ok(TorrentProgress {
                id: torrent_id,
                name,
                progress_pct,
                downloaded_bytes: progress_bytes,
                total_bytes: total,
                download_speed: stats
                    .live
                    .as_ref()
                    .map(|l| l.download_speed.mbps)
                    .unwrap_or(0.0),
                upload_speed: stats
                    .live
                    .as_ref()
                    .map(|l| l.upload_speed.mbps)
                    .unwrap_or(0.0),
                state: format!("{:?}", stats.state),
                peers: stats
                    .live
                    .as_ref()
                    .map(|l| l.snapshot.peer_stats.live as u32)
                    .unwrap_or(0),
            })
        }
        Err(e) => {
            eprintln!(
                "[TORRENT_PROGRESS] Error getting stats for ID {}: {}",
                torrent_id, e
            );
            Ok(TorrentProgress {
                id: torrent_id,
                name,
                progress_pct: 0.0,
                downloaded_bytes: 0,
                total_bytes: 0,
                download_speed: 0.0,
                upload_speed: 0.0,
                state: "Initializing".to_string(),
                peers: 0,
            })
        }
    }
}

/// List all active torrents with their progress
#[tauri::command]
async fn torrent_list(state: State<'_, TorrentState>) -> Result<Vec<TorrentListItem>, String> {
    let api_guard = state.api.lock().await;
    let api = match api_guard.as_ref() {
        Some(a) => a,
        None => return Ok(vec![]),
    };

    let list = api.api_torrent_list_ext(librqbit::api::ApiTorrentListOpts { with_stats: true });

    let mut items = Vec::new();
    for t in list.torrents {
        let tid = match t.id {
            Some(id) => id,
            None => continue,
        };

        let name = t.name.clone().unwrap_or_else(|| "Unknown".to_string());

        match t.stats {
            Some(ref stats) => {
                let total = stats.total_bytes;
                let progress_bytes = stats.progress_bytes;
                let progress_pct = if total > 0 {
                    (progress_bytes as f64 / total as f64) * 100.0
                } else {
                    0.0
                };

                items.push(TorrentListItem {
                    id: tid,
                    name,
                    progress_pct,
                    state: format!("{:?}", stats.state),
                    download_speed: stats
                        .live
                        .as_ref()
                        .map(|l| l.download_speed.mbps)
                        .unwrap_or(0.0),
                    total_bytes: total,
                    downloaded_bytes: progress_bytes,
                });
            }
            None => {
                items.push(TorrentListItem {
                    id: tid,
                    name,
                    progress_pct: 0.0,
                    state: "Initializing".to_string(),
                    download_speed: 0.0,
                    total_bytes: 0,
                    downloaded_bytes: 0,
                });
            }
        }
    }

    Ok(items)
}

/// Pause a torrent
#[tauri::command]
async fn torrent_pause(state: State<'_, TorrentState>, torrent_id: usize) -> Result<(), String> {
    let api_guard = state.api.lock().await;
    let api = get_api(&api_guard)?;

    api.api_torrent_action_pause(TorrentIdOrHash::Id(torrent_id))
        .await
        .map_err(|e| format!("Failed to pause torrent: {}", e))?;
    Ok(())
}

/// Delete / remove a torrent
#[tauri::command]
async fn torrent_delete(state: State<'_, TorrentState>, torrent_id: usize) -> Result<(), String> {
    let api_guard = state.api.lock().await;
    let api = get_api(&api_guard)?;

    api.api_torrent_action_delete(TorrentIdOrHash::Id(torrent_id))
        .await
        .map_err(|e| format!("Failed to delete torrent: {}", e))?;
    Ok(())
}

/// Default download directory (user's Downloads folder)
#[tauri::command]
fn get_default_download_dir() -> Result<String, String> {
    let dir = dirs_next::download_dir()
        .or_else(|| dirs_next::home_dir().map(|h| h.join("Downloads")))
        .ok_or_else(|| "Cannot determine download directory".to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

/// Recursively collect video and subtitle file paths from a directory
fn collect_media_files(
    dir: &std::path::Path,
    video_exts: &[&str],
    sub_exts: &[&str],
    results: &mut Vec<String>,
) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                collect_media_files(&path, video_exts, sub_exts, results);
            } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                let ext_lower = ext.to_lowercase();
                if video_exts.contains(&ext_lower.as_str())
                    || sub_exts.contains(&ext_lower.as_str())
                {
                    results.push(path.to_string_lossy().to_string());
                }
            }
        }
    }
}

/// Scan a directory recursively for video and subtitle files
#[tauri::command]
fn scan_directory_for_media(dir_path: String) -> Result<Vec<String>, String> {
    let video_extensions = ["mp4", "mkv", "avi", "mov", "webm", "flv", "m4v"];
    let subtitle_extensions = ["srt", "ass", "vtt", "sub", "ssa"];

    let path = std::path::Path::new(&dir_path);
    if !path.exists() {
        return Ok(vec![]);
    }

    let mut files = Vec::new();
    collect_media_files(
        path,
        &video_extensions,
        &subtitle_extensions,
        &mut files,
    );
    Ok(files)
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Open file in VLC player
#[tauri::command]
fn open_vlc(file_path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
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
    // Try to init tracing subscriber to see librqbit logs
    let _ = tracing_subscriber::fmt()
        .with_env_filter("info,librqbit=debug")
        .try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(TorrentState {
            session: Mutex::new(None),
            api: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            open_vlc,
            yts_search,
            torrent_add_magnet,
            torrent_get_progress,
            torrent_list,
            torrent_pause,
            torrent_delete,
            get_default_download_dir,
            scan_directory_for_media,
        ])
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
