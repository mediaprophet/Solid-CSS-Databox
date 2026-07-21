use crate::shape::InstallProfile;
use sha2::{Sha256, Digest};

/// Step 3: App & Rust helper deployment.
/// Extracts the CSS fork and places Rust helper binaries.
pub fn run(profile: &InstallProfile) -> Result<(), String> {
    let app_dir = profile.app_dir();
    let bin_dir = profile.bin_dir();

    std::fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create app dir: {}", e))?;
    std::fs::create_dir_all(&bin_dir)
        .map_err(|e| format!("Failed to create bin dir: {}", e))?;

    println!("  App directory: {}", app_dir);
    println!("  Binary directory: {}", bin_dir);

    // Copy the CSS fork source tree into app_dir if not already present.
    // In a real bundled installer, this would extract from an embedded tarball.
    // When running from source, we copy the current repo's essential files.
    let source_dir = std::env::current_dir()
        .map_err(|e| format!("Failed to get current dir: {}", e))?;

    let package_json_src = source_dir.join("package.json");
    let package_json_dest = std::path::Path::new(&app_dir).join("package.json");
    if package_json_src.exists() && !package_json_dest.exists() {
        std::fs::copy(&package_json_src, &package_json_dest)
            .map_err(|e| format!("Failed to copy package.json: {}", e))?;
        println!("  Copied package.json to app dir");
    }

    // Copy essential source directories
    for dir in &["src", "config", "templates"] {
        let src = source_dir.join(dir);
        let dst = std::path::Path::new(&app_dir).join(dir);
        if src.exists() && !dst.exists() {
            copy_dir_recursive(&src, &dst)?;
            println!("  Copied {} to app dir", dir);
        }
    }

    // Copy Rust helper binaries from build output with checksum verification
    for binary_name in &profile.required_binaries {
        let binary_path = format!("{}/{}", bin_dir, binary_name);
        let source_path = format!("native/target/release/{}", binary_name);

        if std::path::Path::new(&source_path).exists() {
            // Compute checksum of source binary
            let source_sha = file_sha256(&source_path)?;
            std::fs::copy(&source_path, &binary_path)
                .map_err(|e| format!("Failed to copy {}: {}", binary_name, e))?;

            // Verify copied binary matches source checksum
            let dest_sha = file_sha256(&binary_path)?;
            if source_sha != dest_sha {
                return Err(format!("Checksum mismatch for {} after copy", binary_name));
            }
            println!("  Copied {} (sha256: {}...)", binary_name, &source_sha[..16]);

            // Set executable permissions on Unix
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mut perms = std::fs::metadata(&binary_path)
                    .map_err(|e| format!("Failed to stat {}: {}", binary_name, e))?
                    .permissions();
                perms.set_mode(0o755);
                std::fs::set_permissions(&binary_path, perms)
                    .map_err(|e| format!("Failed to chmod {}: {}", binary_name, e))?;
            }
        } else {
            println!("  Warning: {} not found at {} — expected if building from source", binary_name, source_path);
        }
    }

    Ok(())
}

fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    std::fs::create_dir_all(dst)
        .map_err(|e| format!("Failed to create dir {}: {}", dst.display(), e))?;
    for entry in std::fs::read_dir(src)
        .map_err(|e| format!("Failed to read dir {}: {}", src.display(), e))?
    {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let file_name = entry.file_name();
        let dest_path = dst.join(&file_name);

        // Skip node_modules, target, .git, data
        let name = file_name.to_string_lossy();
        if name == "node_modules" || name == "target" || name == ".git" || name == "data" {
            continue;
        }

        if path.is_dir() {
            copy_dir_recursive(&path, &dest_path)?;
        } else {
            std::fs::copy(&path, &dest_path)
                .map_err(|e| format!("Failed to copy {}: {}", path.display(), e))?;
        }
    }
    Ok(())
}

fn file_sha256(path: &str) -> Result<String, String> {
    let data = std::fs::read(path)
        .map_err(|e| format!("Failed to read {}: {}", path, e))?;
    let mut hasher = Sha256::new();
    hasher.update(&data);
    let result = hasher.finalize();
    Ok(result.iter().map(|b| format!("{:02x}", b)).collect())
}
