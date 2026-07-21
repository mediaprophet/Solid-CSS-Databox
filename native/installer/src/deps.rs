use std::process::Command;
use crate::shape::InstallProfile;

/// Step 4: Dependency resolution.
/// Runs `npm ci` in the app directory using the provisioned Node binary.
pub fn run(profile: &InstallProfile) -> Result<(), String> {
    let node_binary = profile.node_binary_path();
    let app_dir = profile.app_dir();

    // Use local Node if provisioned, otherwise fall back to system Node
    let npm_path = if std::path::Path::new(&node_binary).exists() {
        node_binary.replace("node", "npm")
    } else {
        "npm".to_string()
    };

    // Check if package.json exists in app_dir
    let package_json = format!("{}/package.json", app_dir);
    if !std::path::Path::new(&package_json).exists() {
        println!("  No package.json in {} — skipping dependency resolution", app_dir);
        println!("  (In a real install, the app would be extracted here first)");
        return Ok(());
    }

    println!("  Running npm ci in {}...", app_dir);

    let output = Command::new(&npm_path)
        .arg("ci")
        .current_dir(&app_dir)
        .output()
        .map_err(|e| format!("Failed to run npm ci: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("npm ci failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let last_line = stdout.lines().last().unwrap_or("Done");
    println!("  {}", last_line);

    // Also build forge-admin if present
    let forge_admin_dir = format!("{}/forge-admin", app_dir);
    if std::path::Path::new(&format!("{}/package.json", forge_admin_dir)).exists() {
        println!("  Building forge-admin...");
        let forge_output = Command::new(&npm_path)
            .args(["run", "build"])
            .current_dir(&forge_admin_dir)
            .output()
            .map_err(|e| format!("Failed to build forge-admin: {}", e))?;

        if !forge_output.status.success() {
            let stderr = String::from_utf8_lossy(&forge_output.stderr);
            println!("  Warning: forge-admin build failed: {}", stderr);
        } else {
            println!("  forge-admin built successfully");
        }
    }

    Ok(())
}
