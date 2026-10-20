//! macOS counterpart of desktop.rs: keep the widget on the desktop layer (visible through "Show Desktop"), open at login.

use objc2::msg_send;
use objc2::runtime::AnyObject;

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGWindowLevelForKey(key: i32) -> i32;
}
const DESKTOP_ICON_LEVEL_KEY: i32 = 18; // kCGDesktopIconWindowLevelKey

// NSWindowCollectionBehavior
const CAN_JOIN_ALL_SPACES: usize = 1 << 0;
const STATIONARY: usize = 1 << 4; // stays put through Show Desktop and Mission Control, like the desktop itself
const IGNORES_CYCLE: usize = 1 << 6;

/// Just above the desktop icons, so the card still takes clicks, and below every normal window.
pub fn pin(ns_window: *mut std::ffi::c_void) {
    let w = unsafe { &*(ns_window as *const AnyObject) };
    let level = unsafe { CGWindowLevelForKey(DESKTOP_ICON_LEVEL_KEY) } as isize + 1;
    unsafe {
        let _: () = msg_send![w, setLevel: level];
        let _: () = msg_send![w, setCollectionBehavior: CAN_JOIN_ALL_SPACES | STATIONARY | IGNORES_CYCLE];
    }
}

/// Open at login via a per-user LaunchAgent.
pub fn autostart(on: bool) {
    let Some(home) = std::env::var_os("HOME") else { return };
    let dir = std::path::Path::new(&home).join("Library/LaunchAgents");
    let plist = dir.join("io.github.sbychul.cornerflag.plist");
    if !on {
        let _ = std::fs::remove_file(plist);
        return;
    }
    // ponytail: exe path is not XML-escaped, fine for /Applications/CornerFlag.app
    let exe = std::env::current_exe().unwrap_or_default();
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::fs::write(
        plist,
        format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>io.github.sbychul.cornerflag</string>
<key>ProgramArguments</key><array><string>{}</string></array>
<key>RunAtLoad</key><true/>
</dict></plist>
"#,
            exe.display()
        ),
    );
}
