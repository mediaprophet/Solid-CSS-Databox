use std::env;
use std::process;

mod preflight;
mod node;
mod deploy;
mod deps;
mod config;
mod handshake;
mod service;
mod handoff;
mod shape;

use shape::InstallProfile;

fn main() {
    let args: Vec<String> = env::args().collect();
    let mut package_type = String::new();
    let mut install_dir = String::from("./databox");
    let mut config_preset: Option<String> = None;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--package-type" | "-t" => {
                i += 1;
                if i < args.len() {
                    package_type = args[i].clone();
                }
            }
            "--install-dir" | "-d" => {
                i += 1;
                if i < args.len() {
                    install_dir = args[i].clone();
                }
            }
            "--config-preset" | "-c" => {
                i += 1;
                if i < args.len() {
                    config_preset = Some(args[i].clone());
                }
            }
            "--help" | "-h" => {
                print_help();
                return;
            }
            _ => {}
        }
        i += 1;
    }

    if package_type.is_empty() {
        eprintln!("Error: --package-type is required");
        eprintln!("Valid types: cms:ServerInstall, cms:PosInstall, cms:ConnectorInstall, cms:TraySupervisorInstall, cms:CombinedInstall");
        process::exit(1);
    }

    let profile = InstallProfile::from_type(&package_type, &install_dir, config_preset);
    println!("=== Databox CMS Installer ===");
    println!("Package type: {}", profile.type_name);
    println!("Install directory: {}", profile.install_dir);
    println!();

    let steps: [(&str, fn(&InstallProfile) -> Result<(), String>); 8] = [
        ("Pre-flight assessment", preflight::run),
        ("Node.js 24 detection & provisioning", node::run),
        ("App & Rust helper deployment", deploy::run),
        ("Dependency resolution", deps::run),
        ("Configuration & crypto bootstrap", config::run),
        ("Rust helper integration & handshake", handshake::run),
        ("Service registration & persistence", service::run),
        ("Administrative provisioning & handoff", handoff::run),
    ];

    for (index, (name, step_fn)) in steps.iter().enumerate() {
        println!("Step {}/8: {}", index + 1, name);
        match step_fn(&profile) {
            Ok(()) => println!("  ✓ Done"),
            Err(e) => {
                eprintln!("  ✗ FAILED: {}", e);
                eprintln!("Installation aborted at step {}.", index + 1);
                process::exit(1);
            }
        }
        println!();
    }

    println!("=== Installation complete ===");
    println!("The Databox CMS is running. Open the admin panel in your browser.");
}

fn print_help() {
    println!("Databox CMS Installer");
    println!();
    println!("Usage: databox-installer --package-type <type> [options]");
    println!();
    println!("Options:");
    println!("  -t, --package-type <type>   Install package type (required)");
    println!("  -d, --install-dir <path>    Installation directory (default: ./databox)");
    println!("  -c, --config-preset <path>  Config preset path override");
    println!("  -h, --help                  Show this help");
    println!();
    println!("Package types:");
    println!("  cms:ServerInstall           CSS + CMS presets + Node 24 + service");
    println!("  cms:PosInstall              POS edge binary + Node POS app + hardware I/O");
    println!("  cms:ConnectorInstall        Connector sidecar (ODBC/LDAP) + Node runtime");
    println!("  cms:TraySupervisorInstall   Tray supervisor only");
    println!("  cms:CombinedInstall         Server + POS + tray supervisor");
}
