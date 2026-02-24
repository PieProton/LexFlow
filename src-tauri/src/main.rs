#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Windows: check WebView2 availability and install if missing
    #[cfg(target_os = "windows")]
    {
        if !is_webview2_installed() {
            // Show a message and auto-download the bootstrapper
            install_webview2();
        }
    }

    app_lib::run();
}

/// Check if WebView2 runtime is installed on Windows
#[cfg(target_os = "windows")]
fn is_webview2_installed() -> bool {
    use std::process::Command;
    // Check via registry — WebView2 stores its version in this key
    let output = Command::new("reg")
        .args([
            "query",
            r"HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BEB-235B8D6E5B40}",
            "/v",
            "pv",
        ])
        .output();
    if let Ok(out) = output {
        let stdout = String::from_utf8_lossy(&out.stdout);
        // If "pv" exists and is not empty/0.0.0.0, WebView2 is installed
        if out.status.success() && !stdout.contains("0.0.0.0") {
            return true;
        }
    }
    // Also check per-user install
    let output2 = Command::new("reg")
        .args([
            "query",
            r"HKCU\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BEB-235B8D6E5B40}",
            "/v",
            "pv",
        ])
        .output();
    if let Ok(out) = output2 {
        let stdout = String::from_utf8_lossy(&out.stdout);
        if out.status.success() && !stdout.contains("0.0.0.0") {
            return true;
        }
    }
    false
}

/// Download and run the WebView2 bootstrapper
#[cfg(target_os = "windows")]
fn install_webview2() {
    use std::process::Command;

    // Show a message box to the user
    let _ = Command::new("cmd")
        .args([
            "/C",
            "msg * /TIME:10 \"LexFlow richiede Microsoft WebView2. Installazione automatica in corso...\"",
        ])
        .spawn();

    // Download the bootstrapper (~1.8MB) to temp
    let temp = std::env::temp_dir().join("MicrosoftEdgeWebview2Setup.exe");
    let download_result = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            &format!(
                "Invoke-WebRequest -Uri 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile '{}'",
                temp.display()
            ),
        ])
        .output();

    if download_result.is_ok() && temp.exists() {
        // Run the bootstrapper silently
        let _ = Command::new(&temp)
            .args(["/silent", "/install"])
            .status();
        // Clean up
        let _ = std::fs::remove_file(&temp);
    }
}
