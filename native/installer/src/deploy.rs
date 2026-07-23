use std::{env, fs, path::{Path, PathBuf}};

use serde::Deserialize;
use sha2::{Digest, Sha256};

use crate::shape::{display_path, exe_suffix, InstallProfile};

/// Installs a complete application payload. The release archive keeps payload/ next to the
/// installer; running from a checkout remains supported for development.
pub fn run(profile: &InstallProfile) -> Result<(), String> {
    let source_root = payload_root()?;
    validate_payload_manifest(&source_root)?;
    let source_app = source_root.join("app");
    let source_app = if source_app.is_dir() { source_app } else { source_root.clone() };
    let app_dir = profile.app_dir();

    if !source_app.join("package.json").is_file() {
        return Err(format!("The application payload is incomplete: package.json was not found in {}", display_path(&source_app)));
    }

    fs::create_dir_all(&app_dir).map_err(|error| format!("Could not create the application folder: {error}"))?;
    for item in ["bin", "config", "dist", "templates", "patches", "forge-admin"] {
        let source = source_app.join(item);
        if source.exists() { copy_dir_recursive(&source, &app_dir.join(item))?; }
    }
    for item in ["package.json", "package-lock.json", ".npmrc"] {
        let source = source_app.join(item);
        if source.is_file() { fs::copy(&source, app_dir.join(item)).map_err(|error| format!("Could not copy {item}: {error}"))?; }
    }
    if !app_dir.join("bin").join("server.js").is_file() || !app_dir.join("package-lock.json").is_file() {
        return Err("The application payload is missing bin/server.js or package-lock.json. Download a complete Databox release and try again.".to_owned());
    }
    println!("  Application files copied to {}", display_path(&app_dir));

    fs::create_dir_all(profile.bin_dir()).map_err(|error| format!("Could not create the helper folder: {error}"))?;
    for helper in &profile.required_binaries {
        let source = find_helper(&source_root, helper)?;
        let destination = profile.binary_path(helper);
        fs::copy(&source, &destination).map_err(|error| format!("Could not install {helper}: {error}"))?;
        if file_sha256(&source)? != file_sha256(&destination)? {
            return Err(format!("Integrity check failed while installing {helper}"));
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&destination, fs::Permissions::from_mode(0o755)).map_err(|error| error.to_string())?;
        }
        println!("  Installed {helper}");
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PayloadManifest {
    platform: String,
    architecture: String,
}

fn validate_payload_manifest(source_root: &Path) -> Result<(), String> {
    let manifest_path = source_root.join("manifest.json");
    let is_packaged_release = source_root.join("app").is_dir();
    if !manifest_path.is_file() {
        if is_packaged_release {
            return Err("The desktop package is missing payload/manifest.json. Download a complete release for this platform and try again.".to_owned());
        }
        return Ok(());
    }

    let manifest: PayloadManifest = serde_json::from_slice(&fs::read(&manifest_path)
        .map_err(|error| format!("Could not read the package manifest: {error}"))?)
        .map_err(|error| format!("Could not parse the package manifest: {error}"))?;
    let platform = current_platform();
    let architecture = current_architecture();
    if manifest.platform != platform || manifest.architecture != architecture {
        return Err(format!(
            "This package is for {}/{} but this installer is {}/{}. Download the matching Databox release.",
            manifest.platform, manifest.architecture, platform, architecture,
        ));
    }
    Ok(())
}

fn current_platform() -> &'static str {
    #[cfg(target_os = "windows")]
    { "windows" }
    #[cfg(target_os = "macos")]
    { "macos" }
    #[cfg(target_os = "linux")]
    { "linux" }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    { "unsupported" }
}

fn current_architecture() -> &'static str {
    #[cfg(target_arch = "x86_64")]
    { "x64" }
    #[cfg(target_arch = "aarch64")]
    { "arm64" }
    #[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64")))]
    { "unsupported" }
}

fn payload_root() -> Result<PathBuf, String> {
    if let Some(path) = env::var_os("DATABOX_PACKAGE_ROOT") {
        return Ok(PathBuf::from(path));
    }
    let executable = env::current_exe().map_err(|error| format!("Could not locate the installer: {error}"))?;
    let release_root = executable.parent().unwrap_or_else(|| Path::new(".")).join("payload");
    if release_root.is_dir() { return Ok(release_root); }
    env::current_dir().map_err(|error| format!("Could not locate the application payload: {error}"))
}

fn find_helper(root: &Path, helper: &str) -> Result<PathBuf, String> {
    let filename = format!("{}{}", helper, exe_suffix());
    let packaged = root.join("bin").join(&filename);
    if packaged.is_file() { return Ok(packaged); }
    let development = root.join("native").join("target").join("release").join(&filename);
    if development.is_file() { return Ok(development); }
    Err(format!("Required helper '{filename}' was not included with this release."))
}

fn copy_dir_recursive(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|error| format!("Could not create {}: {error}", display_path(destination)))?;
    for entry in fs::read_dir(source).map_err(|error| format!("Could not read {}: {error}", display_path(source)))? {
        let entry = entry.map_err(|error| error.to_string())?;
        let name = entry.file_name();
        if ["node_modules", ".git", "target", ".data"].iter().any(|ignored| name == *ignored) { continue; }
        let target = destination.join(&name);
        if entry.path().is_dir() { copy_dir_recursive(&entry.path(), &target)?; }
        else { fs::copy(entry.path(), target).map_err(|error| error.to_string())?; }
    }
    Ok(())
}

fn file_sha256(path: &Path) -> Result<String, String> {
    let mut hash = Sha256::new();
    hash.update(fs::read(path).map_err(|error| format!("Could not read {}: {error}", display_path(path)))?);
    Ok(format!("{:x}", hash.finalize()))
}
