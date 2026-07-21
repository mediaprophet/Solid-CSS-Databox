use std::process::Command;
use std::net::TcpStream;
use std::time::Duration;
use crate::shape::InstallProfile;

/// Step 7: Service registration & persistence.
/// Registers the server as a background daemon and starts it.
pub fn run(profile: &InstallProfile) -> Result<(), String> {
    let os = detect_os();

    match os.as_str() {
        "linux" => register_systemd(profile)?,
        "windows" => register_windows_service(profile)?,
        "macos" => register_launchd(profile)?,
        _ => {
            println!("  Warning: Unsupported OS for service registration — skipping");
            println!("  Start the server manually with: node ./bin/server.js -c {}", profile.config_preset);
            return Ok(());
        }
    }

    // Poll health endpoint
    println!("  Polling health endpoint...");
    for attempt in 1..=15 {
        std::thread::sleep(Duration::from_secs(2));
        if TcpStream::connect(format!("127.0.0.1:{}", profile.required_port)).is_ok() {
            println!("  Server is responding on port {} (attempt {})", profile.required_port, attempt);
            return Ok(());
        }
        print!("  Attempt {} — not yet responding...\r", attempt);
    }

    Err(format!("Server did not respond on port {} within 30s", profile.required_port))
}

fn register_systemd(profile: &InstallProfile) -> Result<(), String> {
    let unit_path = format!("/etc/systemd/system/{}.service", profile.service_name);
    let node_binary = profile.node_binary_path();
    let node_path = if std::path::Path::new(&node_binary).exists() {
        node_binary
    } else {
        "node".to_string()
    };

    let unit_content = format!(
        r#"[Unit]
Description=Databox CMS Server
After=network.target

[Service]
Type=simple
WorkingDirectory={}
ExecStart={} ./bin/server.js -c {}
Restart=on-failure
RestartSec=5
EnvironmentFile={}/.env

[Install]
WantedBy=multi-user.target
"#,
        profile.app_dir(),
        node_path,
        profile.config_preset,
        profile.app_dir(),
    );

    println!("  Writing systemd unit to {}", unit_path);
    std::fs::write(&unit_path, &unit_content)
        .map_err(|e| format!("Failed to write systemd unit: {}", e))?;

    // Enable and start the service
    let service_name = &profile.service_name;
    for cmd in &["daemon-reload", &format!("enable {}", service_name), &format!("start {}", service_name)] {
        let result = Command::new("systemctl").arg(cmd).output();
        match result {
            Ok(output) if output.status.success() => {
                println!("  systemctl {} — OK", cmd);
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr);
                println!("  systemctl {} — warning: {}", cmd, stderr.trim());
            }
            Err(e) => {
                println!("  systemctl {} — error: {} (may need root)", cmd, e);
            }
        }
    }

    Ok(())
}

fn register_windows_service(profile: &InstallProfile) -> Result<(), String> {
    let node_binary = profile.node_binary_path();
    let node_path = if std::path::Path::new(&node_binary).exists() {
        node_binary
    } else {
        "node".to_string()
    };

    println!("  Registering Windows service: {}", profile.service_name);

    // Use sc create to register the service
    let exe_path = format!("{}\\bin\\server.js", profile.app_dir());
    let bin_path = format!("{} \"{}\" -c {}", node_path, exe_path, profile.config_preset);

    let result = Command::new("sc")
        .args(["create", &profile.service_name, "binPath=", &bin_path, "start=", "auto"])
        .output();

    match result {
        Ok(output) if output.status.success() => {
            println!("  Service registered successfully");
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            println!("  Warning: sc create — {} (may need Administrator)", stderr.trim());
        }
        Err(e) => {
            println!("  Warning: sc command not available: {}", e);
        }
    }

    // Start the service
    let _ = Command::new("sc").args(["start", &profile.service_name]).output();

    Ok(())
}

fn register_launchd(profile: &InstallProfile) -> Result<(), String> {
    let plist_path = format!(
        "{}/Library/LaunchAgents/org.databox.{}.plist",
        std::env::var("HOME").unwrap_or_default(),
        profile.service_name
    );

    let node_binary = profile.node_binary_path();
    let node_path = if std::path::Path::new(&node_binary).exists() {
        node_binary
    } else {
        "/usr/local/bin/node".to_string()
    };

    let plist_content = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>org.databox.{}</string>
  <key>WorkingDirectory</key>
  <string>{}</string>
  <key>ProgramArguments</key>
  <array>
    <string>{}</string>
    <string>./bin/server.js</string>
    <string>-c</string>
    <string>{}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
"#,
        profile.service_name,
        profile.app_dir(),
        node_path,
        profile.config_preset,
    );

    println!("  Writing launchd plist to {}", plist_path);
    if let Some(parent) = std::path::Path::new(&plist_path).parent() {
        std::fs::create_dir_all(parent).ok();
    }
    std::fs::write(&plist_path, &plist_content)
        .map_err(|e| format!("Failed to write plist: {}", e))?;

    let _ = Command::new("launchctl")
        .args(["load", &plist_path])
        .output();

    println!("  Service loaded via launchctl");
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
