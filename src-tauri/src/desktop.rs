//! Keep the widget on the desktop layer (visible through "Show desktop", Win+D), single instance, start with Windows.

use windows_sys::Win32::Foundation::{ERROR_ALREADY_EXISTS, GetLastError, HWND};
use windows_sys::Win32::System::Registry::{HKEY_CURRENT_USER, REG_SZ, RegDeleteKeyValueW, RegSetKeyValueW};
use windows_sys::Win32::System::Threading::CreateMutexW;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    FindWindowW, GWLP_HWNDPARENT, HWND_BOTTOM, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SetWindowLongPtrW,
    SetWindowPos,
};

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}

/// Make Progman the owner. Owned windows stay above their owner, so Win+D does not hide the widget.
pub fn pin(hwnd: HWND) {
    unsafe {
        let progman = FindWindowW(wide("Progman").as_ptr(), std::ptr::null());
        SetWindowLongPtrW(hwnd, GWLP_HWNDPARENT, progman as isize);
        SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    }
}

/// False when another CornerFlag is already running. The mutex lives until the process exits.
pub fn first_instance() -> bool {
    unsafe { CreateMutexW(std::ptr::null(), 0, wide("io.github.sbychul.cornerflag").as_ptr()) };
    unsafe { GetLastError() != ERROR_ALREADY_EXISTS }
}

/// Start with Windows via the per-user Run key.
pub fn autostart(on: bool) {
    let key = wide(r"Software\Microsoft\Windows\CurrentVersion\Run");
    let name = wide("CornerFlag");
    unsafe {
        if on {
            let exe = std::env::current_exe().unwrap_or_default();
            let value = wide(&format!("\"{}\"", exe.display()));
            RegSetKeyValueW(HKEY_CURRENT_USER, key.as_ptr(), name.as_ptr(), REG_SZ, value.as_ptr().cast(), (value.len() * 2) as u32);
        } else {
            RegDeleteKeyValueW(HKEY_CURRENT_USER, key.as_ptr(), name.as_ptr());
        }
    }
}
