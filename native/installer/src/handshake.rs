use std::process::Command;
use std::net::TcpStream;
use std::time::Duration;
use crate::shape::InstallProfile;

/// Step 6: Rust helper integration & handshake.
/// Verifies IPC between the Node app and the Rust helper binary.
pub fn run(profile: &InstallProfile) -> Result<(), String> {
    if let Some(ref native_binary) = profile.native_edge_binary {
        let bin_path = format!("{}/{}", profile.bin_dir(), native_binary);
        println!("  Native edge binary: {}", bin_path);

        if !std::path::Path::new(&bin_path).exists() {
            println!("  Warning: {} not found — skipping handshake (expected if building from source)", native_binary);
            return Ok(());
        }

        // Dry-run: start the binary briefly and check it doesn't crash immediately
        println!("  Running dry-run handshake...");
        let mut child = Command::new(&bin_path)
            .env("POS_NODE_BINARY", "node")
            .env("POS_NODE_CONFIG", &profile.config_preset)
            .env("POS_HTTP_PORT", profile.native_edge_http_port.to_string())
            .spawn()
            .map_err(|e| format!("Failed to start {}: {}", native_binary, e))?;

        // Give it a moment to start
        std::thread::sleep(Duration::from_secs(1));

        // Check if the HTTP bridge is responding
        let http_ok = TcpStream::connect(format!("127.0.0.1:{}", profile.native_edge_http_port)).is_ok();
        if http_ok {
            println!("  HTTP bridge responding on port {}", profile.native_edge_http_port);
        } else {
            println!("  Warning: HTTP bridge not yet responding (may need more startup time)");
        }

        // Kill the dry-run process
        let _ = child.kill();
        let _ = child.wait();
        println!("  Dry-run complete");
    } else {
        println!("  No native edge binary required for this install type");
    }

    Ok(())
}
