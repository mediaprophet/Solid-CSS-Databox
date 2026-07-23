use std::process::Command;
#[cfg(target_os = "linux")]
use std::fs;
use crate::shape::{display_path, InstallProfile};

/// Desktop editions deliberately use a per-user startup entry, not `sc create`.
/// `sc` cannot supervise a Node script reliably and is invisible to the person using POS.
pub fn run(profile: &InstallProfile) -> Result<(), String> {
    if !profile.includes_tray() {
        println!("  This server edition has no desktop supervisor; start it with the installed Node runtime.");
        return Ok(());
    }
    let tray = profile.binary_path("tray-supervisor");
    if !tray.is_file() { return Err("The desktop supervisor is missing.".to_owned()); }

    #[cfg(target_os = "windows")]
    {
        let value = format!("\"{}\"", display_path(&tray));
        let output = Command::new("reg").args([
            "add", r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run", "/v", "DataboxCMS",
            "/t", "REG_SZ", "/d", &value, "/f",
        ]).output().map_err(|error| format!("Could not register startup: {error}"))?;
        if !output.status.success() { return Err(format!("Could not register startup: {}", String::from_utf8_lossy(&output.stderr).trim())); }
        println!("  Databox will appear in the notification area when you sign in");
    }
    #[cfg(target_os = "linux")]
    {
        let home = std::env::var("HOME").map_err(|_| "HOME is not set".to_owned())?;
        let folder = std::path::Path::new(&home).join(".config/autostart");
        fs::create_dir_all(&folder).map_err(|error| error.to_string())?;
        fs::write(folder.join("databox-cms.desktop"), format!("[Desktop Entry]\nType=Application\nName=Databox CMS\nExec={}\nX-GNOME-Autostart-enabled=true\n", display_path(&tray))).map_err(|error| error.to_string())?;
        println!("  Databox will start when you sign in");
    }
    #[cfg(target_os = "macos")]
    { println!("  Open {} to start Databox. Login-item registration is handled by the signed macOS app bundle.", display_path(&tray)); }
    Ok(())
}
