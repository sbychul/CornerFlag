//! Keep the widget on the desktop layer: visible through "Show desktop" (Win+D),
//! with an acrylic backdrop that keeps rendering while the window is inactive.

use std::ffi::c_void;
use windows_sys::Win32::Foundation::HWND;
use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};
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

#[repr(C)]
struct AccentPolicy {
    state: u32,
    flags: u32,
    gradient_abgr: u32,
    animation_id: u32,
}

#[repr(C)]
struct WindowCompositionAttribData {
    attrib: u32,
    data: *mut c_void,
    size: usize,
}

const WCA_ACCENT_POLICY: u32 = 19;
const ACCENT_ENABLE_ACRYLICBLURBEHIND: u32 = 4;

/// Acrylic via the undocumented SetWindowCompositionAttribute. The documented DWM system backdrop
/// (DWMWA_SYSTEMBACKDROP_TYPE) showed a solid fill for an inactive window, which a desktop widget always is.
pub fn acrylic(hwnd: HWND, gradient_abgr: u32) -> bool {
    unsafe {
        let user32 = LoadLibraryW(wide("user32.dll").as_ptr());
        let Some(proc) = GetProcAddress(user32, c"SetWindowCompositionAttribute".as_ptr().cast()) else {
            return false;
        };
        let swca: unsafe extern "system" fn(HWND, *mut WindowCompositionAttribData) -> i32 =
            std::mem::transmute(proc);
        let mut policy = AccentPolicy {
            state: ACCENT_ENABLE_ACRYLICBLURBEHIND,
            flags: 2,
            gradient_abgr,
            animation_id: 0,
        };
        let mut data = WindowCompositionAttribData {
            attrib: WCA_ACCENT_POLICY,
            data: (&raw mut policy).cast(),
            size: size_of::<AccentPolicy>(),
        };
        swca(hwnd, &mut data) != 0
    }
}
