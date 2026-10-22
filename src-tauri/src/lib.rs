#[cfg(windows)]
mod desktop;
#[cfg(target_os = "macos")]
mod macos;

use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, PhysicalSize};

/// Menu size in CSS px, as in tauri.conf.json and styles.css.
const MENU: LogicalSize<f64> = LogicalSize { width: 196.0, height: 153.0 };

/// Show the dropdown menu window at the cursor, flipped so it stays inside the work area.
#[tauri::command]
fn show_menu(app: AppHandle) -> tauri::Result<()> {
    let menu = app.get_webview_window("menu").expect("menu window");
    let p = app.cursor_position()?;
    // macOS: cursor_position() is physical, monitor_from_point() takes points (tao). Unconverted, a Retina cursor
    // fell outside every display and the menu was sized at scale 1, half size (issue #1).
    #[cfg(target_os = "macos")]
    let monitor = {
        let sf = app.primary_monitor()?.map_or(1.0, |m| m.scale_factor());
        app.monitor_from_point(p.x / sf, p.y / sf)?
    };
    #[cfg(not(target_os = "macos"))]
    let monitor = app.monitor_from_point(p.x, p.y)?;
    // Sized at the cursor's monitor scale, not the window's: a hidden window that Windows moves across monitors
    // (monitor off and on) keeps its old pixel size while WebView2 follows the new DPI, which clipped the menu.
    let size: PhysicalSize<u32> = MENU.to_physical(monitor.as_ref().map_or(1.0, |m| m.scale_factor()));
    let (w, h) = (size.width as i32, size.height as i32);
    let (mut x, mut y) = (p.x as i32, p.y as i32);
    if let Some(m) = monitor {
        let area = m.work_area();
        if x + w > area.position.x + area.size.width as i32 {
            x -= w;
        }
        if y + h > area.position.y + area.size.height as i32 {
            y -= h;
        }
    }
    menu.set_position(PhysicalPosition::new(x, y))?;
    menu.set_size(size)?;
    menu.show()?;
    menu.set_focus()
}

#[tauri::command]
fn set_autostart(on: bool) {
    #[cfg(windows)]
    desktop::autostart(on);
    #[cfg(target_os = "macos")]
    macos::autostart(on);
}
#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(windows)]
    if !desktop::first_instance() {
        return;
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![show_menu, set_autostart, quit])
        .setup(|app| {
            // The windows are see-through via CSS only. SWCA acrylic was tried (verification.md 6) but it painted
            // the whole window rect, cut corner included, hid the backdrop almost completely, and the window
            // region needed for the cut made Windows draw the classic caption.
            #[cfg(windows)]
            desktop::pin(app.get_webview_window("main").expect("main window").hwnd()?.0 as _);
            #[cfg(target_os = "macos")]
            macos::pin(app.get_webview_window("main").expect("main window").ns_window()?);
            // Menu bar app: no Dock icon, no Cmd+Tab entry.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            // Menu bar icons open on left click.
            let button = if cfg!(target_os = "macos") { MouseButton::Left } else { MouseButton::Right };
            TrayIconBuilder::new()
                // The logo itself (white mark, made for the dark taskbar), not the exe's embedded icon resource.
                // On macOS a template image: only its alpha is used, tinted to match the menu bar.
                .icon(tauri::include_image!("icons/32x32.png"))
                .icon_as_template(true)
                .tooltip("CornerFlag")
                .show_menu_on_left_click(false)
                .on_tray_icon_event(move |tray, event| {
                    if matches!(event, TrayIconEvent::Click { button: b, button_state: MouseButtonState::Up, .. } if b == button) {
                        let _ = show_menu(tray.app_handle().clone());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
