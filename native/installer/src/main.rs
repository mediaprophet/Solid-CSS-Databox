use std::{env, process};

mod config;
mod deploy;
mod deps;
mod handoff;
mod handshake;
mod node;
mod preflight;
mod service;
mod shape;

use shape::{default_install_dir, display_path, InstallProfile};

fn main() {
    let args: Vec<String> = env::args().collect();
    let mut package_type = "cms:CombinedInstall".to_owned();
    let mut install_dir = default_install_dir();
    let mut config_preset = None;
    let mut launch_after_install = true;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--package-type" | "-t" => { i += 1; if let Some(value) = args.get(i) { package_type = value.clone(); } }
            "--install-dir" | "-d" => { i += 1; if let Some(value) = args.get(i) { install_dir = value.into(); } }
            "--config-preset" | "-c" => { i += 1; if let Some(value) = args.get(i) { config_preset = Some(value.clone()); } }
            "--no-launch" => launch_after_install = false,
            "--help" | "-h" => { print_help(); return; }
            value => { eprintln!("Unknown option: {value}"); print_help(); process::exit(2); }
        }
        i += 1;
    }

    let profile = InstallProfile::from_type(&package_type, install_dir, config_preset)
        .unwrap_or_else(|error| { eprintln!("Error: {error}"); process::exit(2); });

    println!("\n┌────────────────────────────────────────────────────────┐");
    println!("│                SOLID DATABOX CMS SETUP                 │");
    println!("└────────────────────────────────────────────────────────┘");
    println!("  Product Profile : {}", profile.type_name);
    println!("  Target Location : {}\n", display_path(&profile.install_dir));

    let steps: [(&str, fn(&InstallProfile) -> Result<(), String>); 8] = [
        ("Checking system requirements and environment preflight", preflight::run),
        ("Preparing private Node.js application runtime", node::run),
        ("Installing application package and core bundles", deploy::run),
        ("Verifying application module dependencies", deps::run),
        ("Configuring secure local storage & access policies", config::run),
        ("Testing native helper integrations & IPC channels", handshake::run),
        ("Configuring background service and desktop auto-start", service::run),
        ("Finalizing installation state and handoff", handoff::run),
    ];

    let total = steps.len();
    for (index, (name, run)) in steps.iter().enumerate() {
        let step_num = index + 1;
        print!("[{step_num}/{total}] {name} ... ");
        match run(&profile) {
            Ok(()) => {
                println!("[✓ OK]");
            }
            Err(error) => {
                println!("[✕ FAILED]");
                eprintln!("\n┌────────────────────────────────────────────────────────┐");
                eprintln!("│               INSTALLATION STEP FAILED                 │");
                eprintln!("└────────────────────────────────────────────────────────┘");
                eprintln!("Details: {error}\n");
                eprintln!("Setup could not complete automatically. Resolve the issue and rerun setup.");
                process::exit(1);
            }
        }
    }

    println!("\n┌────────────────────────────────────────────────────────┐");
    println!("│             INSTALLATION COMPLETED CLEANLY              │");
    println!("└────────────────────────────────────────────────────────┘");

    if launch_after_install {
        if let Err(error) = handoff::launch(&profile) {
            eprintln!("Setup completed, but Databox could not be opened automatically: {error}");
            eprintln!("Open {} to start it.", display_path(&profile.binary_path("tray-supervisor")));
        } else {
            println!("  [✓] Databox CMS desktop supervisor launched successfully.");
        }
    }
    println!("  [✓] Databox CMS is ready for use.\n");
}

fn print_help() {
    println!("\nSolid Databox CMS Installer\n");
    println!("Usage: databox-installer [options]\n");
    println!("Options:");
    println!("  -t, --package-type <type>   Product profile to install (default: cms:CombinedInstall)");
    println!("  -d, --install-dir <path>    Installation target folder");
    println!("  -c, --config-preset <path>  Configuration preset inside the application");
    println!("      --no-launch             Finish installation without launching desktop app");
    println!("  -h, --help                  Show this help message\n");
    println!("Products:");
    println!("  cms:ServerInstall          Core Solid Databox CMS Server");
    println!("  cms:PosInstall             POS Edge Terminal & Server");
    println!("  cms:ConnectorInstall       Enterprise Sidecar Connector");
    println!("  cms:TraySupervisorInstall  Desktop System Tray Supervisor");
    println!("  cms:CombinedInstall        Full Server, POS Edge & Desktop Supervisor\n");
}

