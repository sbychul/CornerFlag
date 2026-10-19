#[cfg(windows)]
mod desktop;

use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, PhysicalPosition};

/// Show the dropdown menu window at the cursor, flipped so it stays inside the work area.
#[tauri::command]
fn show_menu(app: AppHandle) -> tauri::Result<()> {
    let menu = app.get_webview_window("menu").expect("menu window");
    let p = app.cursor_position()?;
    let size = menu.outer_size()?;
    let (w, h) = (size.width as i32, size.height as i32);
    let (mut x, mut y) = (p.x as i32, p.y as i32);
    if let Some(m) = app.monitor_from_point(p.x, p.y)? {
        let area = m.work_area();
        if x + w > area.position.x + area.size.width as i32 {
            x -= w;
        }
        if y + h > area.position.y + area.size.height as i32 {
            y -= h;
        }
    }
    menu.set_position(PhysicalPosition::new(x, y))?;
    menu.show()?;
    menu.set_focus()
}

#[tauri::command]
fn set_autostart(on: bool) {
    #[cfg(windows)]
    desktop::autostart(on);
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
            TrayIconBuilder::new()
                // The logo itself (white mark, made for the dark taskbar), not the exe's embedded icon resource.
                .icon(tauri::include_image!("icons/32x32.png"))
                .tooltip("CornerFlag")
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Right, button_state: MouseButtonState::Up, .. } = event {
                        let _ = show_menu(tray.app_handle().clone());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
