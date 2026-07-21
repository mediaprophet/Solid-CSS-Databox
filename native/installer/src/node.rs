use std::process::Command;
use crate::shape::InstallProfile;

/// Step 2: Node.js 24 detection & provisioning.
/// Checks for Node 24 on PATH; if missing, provisions a local copy.
pub fn run(profile: &InstallProfile) -> Result<(), String> {
    let local_node = profile.node_binary_path();

    // First check if we already have a local Node
    if std::path::Path::new(&local_node).exists() {
        let version = get_node_version(&local_node)?;
        if is_node_24(&version) {
            println!("  Local Node {} already provisioned", version);
            return Ok(());
        }
    }

    // Check system Node
    if let Ok(version) = get_node_version("node") {
        if is_node_24(&version) {
            println!("  System Node {} is compatible", version);
            return Ok(());
        } else {
            println!("  System Node {} is not Node 24, provisioning local copy", version);
        }
    } else {
        println!("  Node not found on PATH, provisioning local copy");
    }

    provision_node(profile)?;
    let version = get_node_version(&local_node)?;
    println!("  Provisioned Node {} at {}", version, local_node);

    Ok(())
}

fn get_node_version(binary: &str) -> Result<String, String> {
    let output = Command::new(binary)
        .arg("-v")
        .output()
        .map_err(|e| format!("Failed to execute '{} -v': {}", binary, e))?;

    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if version.is_empty() {
        return Err("Empty version output".to_string());
    }
    Ok(version)
}

fn is_node_24(version: &str) -> bool {
    // Version strings look like "v24.18.0"
    version.starts_with("v24.")
}

fn provision_node(profile: &InstallProfile) -> Result<(), String> {
    let os = detect_os();
    let arch = detect_arch();

    let platform_suffix = match os.as_str() {
        "windows" => "win",
        "linux" => "linux",
        "macos" => "darwin",
        _ => return Err(format!("Unsupported OS for Node provisioning: {}", os)),
    };

    let arch_suffix = match arch.as_str() {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        _ => return Err(format!("Unsupported architecture for Node provisioning: {}", arch)),
    };

    let node_version = "v24.18.0";
    let archive_name = format!("node-{}-{}-{}", node_version, platform_suffix, arch_suffix);
    let archive_ext = if os == "windows" { "zip" } else { "tar.xz" };
    let url = format!(
        "https://nodejs.org/dist/{}/{}.{}",
        node_version, archive_name, archive_ext
    );

    let runtime_dir = format!("{}/runtime/node", profile.install_dir);
    std::fs::create_dir_all(&runtime_dir)
        .map_err(|e| format!("Failed to create runtime dir: {}", e))?;

    let archive_path = format!("{}/{}.{}", runtime_dir, archive_name, archive_ext);

    println!("  Downloading Node from: {}", url);
    download_file(&url, &archive_path)?;

    let sha_url = format!("https://nodejs.org/dist/{}/SHASUMS256.txt", node_version);
    let expected_sha = fetch_sha256(&sha_url, &format!("{}.{}", archive_name, archive_ext))?;
    println!("  Verifying SHA-256 checksum...");
    verify_sha256(&archive_path, &expected_sha)?;

    println!("  Extracting archive...");
    extract_archive(&archive_path, &runtime_dir, &os)?;

    std::fs::remove_file(&archive_path)
        .map_err(|e| format!("Failed to remove archive: {}", e))?;

    println!("  Node.js provisioned to {}", runtime_dir);
    Ok(())
}

fn download_file(url: &str, dest: &str) -> Result<(), String> {
    let response = reqwest::blocking::get(url)
        .map_err(|e| format!("Failed to download {}: {}", url, e))?;
    if !response.status().is_success() {
        return Err(format!("Download failed with HTTP {}", response.status()));
    }
    let bytes = response.bytes()
        .map_err(|e| format!("Failed to read response body: {}", e))?;
    std::fs::write(dest, &bytes)
        .map_err(|e| format!("Failed to write archive to {}: {}", dest, e))?;
    Ok(())
}

fn fetch_sha256(shasums_url: &str, filename: &str) -> Result<String, String> {
    let response = reqwest::blocking::get(shasums_url)
        .map_err(|e| format!("Failed to fetch SHASUMS256.txt: {}", e))?;
    if !response.status().is_success() {
        return Err(format!("SHASUMS256.txt fetch failed with HTTP {}", response.status()));
    }
    let text = response.text()
        .map_err(|e| format!("Failed to read SHASUMS256.txt: {}", e))?;
    for line in text.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() == 2 && parts[1] == filename {
            return Ok(parts[0].to_lowercase());
        }
    }
    Err(format!("Checksum for {} not found in SHASUMS256.txt", filename))
}

fn verify_sha256(path: &str, expected: &str) -> Result<(), String> {
    use sha2::{Sha256, Digest};
    let data = std::fs::read(path)
        .map_err(|e| format!("Failed to read archive for hashing: {}", e))?;
    let mut hasher = Sha256::new();
    hasher.update(&data);
    let result = hasher.finalize();
    let actual: String = result.iter().map(|b| format!("{:02x}", b)).collect();
    if actual != expected {
        return Err(format!("SHA-256 mismatch: expected {}, got {}", expected, actual));
    }
    Ok(())
}

fn extract_archive(archive_path: &str, dest: &str, os: &str) -> Result<(), String> {
    if os == "windows" {
        let file = std::fs::File::open(archive_path)
            .map_err(|e| format!("Failed to open zip: {}", e))?;
        let mut archive = zip::ZipArchive::new(file)
            .map_err(|e| format!("Failed to read zip archive: {}", e))?;
        for i in 0..archive.len() {
            let mut entry = archive.by_index(i)
                .map_err(|e| format!("Failed to read zip entry {}: {}", i, e))?;
            let name = entry.name().to_string();
            let outpath = std::path::Path::new(dest).join(&name);
            if entry.is_dir() {
                std::fs::create_dir_all(&outpath)
                    .map_err(|e| format!("Failed to create dir {}: {}", outpath.display(), e))?;
            } else {
                if let Some(parent) = outpath.parent() {
                    std::fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create parent dir: {}", e))?;
                }
                let mut outfile = std::fs::File::create(&outpath)
                    .map_err(|e| format!("Failed to create file {}: {}", outpath.display(), e))?;
                std::io::copy(&mut entry, &mut outfile)
                    .map_err(|e| format!("Failed to extract {}: {}", name, e))?;
            }
        }
    } else {
        let file = std::fs::File::open(archive_path)
            .map_err(|e| format!("Failed to open tarball: {}", e))?;
        let decoder = xz2::read::XzDecoder::new(file);
        let mut archive = tar::Archive::new(decoder);
        archive.unpack(dest)
            .map_err(|e| format!("Failed to extract tarball: {}", e))?;
    }
    Ok(())
}

fn detect_os() -> String {
    #[cfg(target_os = "windows")]
    return "windows".to_string();
    #[cfg(target_os = "linux")]
    return "linux".to_string();
    #[cfg(target_os = "macos")]
    return "macos".to_string();
    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    return "unknown".to_string();
}

fn detect_arch() -> String {
    #[cfg(target_arch = "x86_64")]
    return "x86_64".to_string();
    #[cfg(target_arch = "aarch64")]
    return "aarch64".to_string();
    #[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64")))]
    return std::env::consts::ARCH.to_string();
}
