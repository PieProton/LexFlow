#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
// SECURITY FIX (Level-8 B2): removed is_webview2_installed() and install_webview2().
// NSIS offlineInstaller (tauri.conf.json) embeds the WebView2 runtime and installs it
// via the NSIS installer before the app ever launches — no runtime detection needed.
// The old approach had security issues: it downloaded an executable from the internet
// without a reliable hash pin and executed it silently with user privileges.

fn main() {
    app_lib::run();
}

