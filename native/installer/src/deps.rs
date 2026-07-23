use std::process::Command;
use crate::shape::InstallProfile;

pub fn run(profile: &InstallProfile) -> Result<(), String> {
    let npm = if profile.npm_binary_path().is_file() { profile.npm_binary_path() } else { "npm".into() };
    println!("  Installing locked dependencies. This can take a few minutes the first time.");
    let output = Command::new(&npm).args(["ci", "--no-audit", "--fund=false"]).current_dir(profile.app_dir()).output()
        .map_err(|error| format!("Could not start npm: {error}"))?;
    if !output.status.success() {
        return Err(format!("Dependency installation failed:\n{}", String::from_utf8_lossy(&output.stderr).trim()));
    }
    println!("  Dependencies installed");
    Ok(())
}
