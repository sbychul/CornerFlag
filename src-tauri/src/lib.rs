#[cfg(windows)]
mod desktop;

#[cfg(windows)]
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(windows)]
            for (label, window) in app.webview_windows() {
                let hwnd = window.hwnd()?.0 as _;
                desktop::pin(hwnd);
                // spike: "main" uses SWCA acrylic; "dwmsbt" keeps Tauri's built-in windowEffects acrylic for comparison
                if label == "main" {
                    println!("swca acrylic applied: {}", desktop::acrylic(hwnd, 0x8000C000));
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
