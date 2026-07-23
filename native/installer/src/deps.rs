use std::process::Command;
use crate::shape::InstallProfile;

pub fn run(profile: &InstallProfile) -> Result<(), String> {
    let npm = profile.npm_binary_path();
    if !npm.is_file() {
        return Err("The private Node.js runtime is missing its npm executable. Run setup again to repair the runtime.".to_owned());
    }
    println!("  Installing locked dependencies. This can take a few minutes the first time.");
    let output = Command::new(&npm).args(["ci", "--no-audit", "--fund=false"]).current_dir(profile.app_dir()).output()
        .map_err(|error| format!("Could not start npm: {error}"))?;
    if !output.status.success() {
        return Err(format!("Dependency installation failed:\n{}", String::from_utf8_lossy(&output.stderr).trim()));
    }
    println!("  Dependencies installed");
    Ok(())
}
