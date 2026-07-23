use std::{fs, process::Command};
use chrono::Utc;
use crate::shape::{display_path, InstallProfile};

pub fn run(profile: &InstallProfile) -> Result<(), String> {
    let manifest = format!("@prefix cms: <urn:solid-server:databox:cms#> .\n@prefix dct: <http://purl.org/dc/terms/> .\n\n<install-state> a cms:InstallProfile ;\n  cms:installType \"{}\" ;\n  cms:configPreset \"{}\" ;\n  cms:requiredPort {} ;\n  dct:created \"{}\" .\n", profile.type_name, profile.config_preset, profile.required_port, Utc::now().format("%Y-%m-%dT%H:%M:%SZ"));
    fs::write(profile.data_dir().join("install-state.ttl"), manifest).map_err(|error| format!("Could not save install details: {error}"))?;
    println!("  Install details saved to {}", display_path(&profile.data_dir().join("install-state.ttl")));
    if profile.includes_tray() {
        println!("  The desktop supervisor will keep Databox available from the notification area.");
    } else {
        println!("  Start the server from {}", display_path(&profile.app_dir()));
    }
    Ok(())
}

pub fn launch(profile: &InstallProfile) -> Result<(), String> {
    if !profile.includes_tray() { return Ok(()); }
    Command::new(profile.binary_path("tray-supervisor")).spawn()
        .map(|_| ()).map_err(|error| format!("Could not launch the desktop supervisor: {error}"))
}
