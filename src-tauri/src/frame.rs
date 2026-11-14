//! Moldura da janela sem bordas no Windows (usado pelo launcher e pelo instalador).
//!
//! As janelas são desenhadas pelo próprio app (`decorations: false`). Com a sombra
//! do sistema ligada, o Windows 10 pinta uma linha de 1 px nas laterais e no rodapé,
//! e o Windows 11 pinta um contorno fino em volta. Por isso a sombra nasce desligada
//! (tauri.conf.json) e só é ligada quando o sistema deixa apagar esse contorno
//! (Windows 11): aí ficam a sombra e os cantos arredondados, sem linha nenhuma.

use tauri::{Runtime, WebviewWindow};

/// Chame antes de mostrar a janela (ela nasce oculta, então nada pisca).
pub fn apply<R: Runtime>(window: &WebviewWindow<R>) {
    #[cfg(windows)]
    imp::apply(window);
    #[cfg(not(windows))]
    let _ = window;
}

#[cfg(windows)]
mod imp {
    use std::ffi::c_void;
    use tauri::{Runtime, WebviewWindow};

    #[link(name = "dwmapi")]
    extern "system" {
        fn DwmSetWindowAttribute(hwnd: *mut c_void, attribute: u32, value: *const c_void, size: u32) -> i32;
    }

    // dwmapi.h (Windows 11, build 22000+)
    const DWMWA_WINDOW_CORNER_PREFERENCE: u32 = 33;
    const DWMWA_BORDER_COLOR: u32 = 34;
    const DWMWCP_ROUND: u32 = 2;
    const DWMWA_COLOR_NONE: u32 = 0xFFFF_FFFE;

    pub fn apply<R: Runtime>(window: &WebviewWindow<R>) {
        let Ok(hwnd) = window.hwnd() else {
            let _ = window.set_shadow(false);
            return;
        };
        let set = |attribute: u32, value: u32| {
            // SAFETY: janela válida (acabou de ser criada) e um u32 de 4 bytes, como a API pede
            unsafe { DwmSetWindowAttribute(hwnd.0, attribute, (&value as *const u32).cast(), 4) }
        };
        let _ = window.set_shadow(true);
        // o Windows 10 não conhece o atributo e recusa: lá fica sem sombra, sem linha
        if set(DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE) < 0 {
            let _ = window.set_shadow(false);
            return;
        }
        set(DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND);
    }
}
