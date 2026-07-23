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

    println!("\nDatabox CMS setup\n=================");
    println!("Product: {}", profile.type_name);
    println!("Location: {}\n", display_path(&profile.install_dir));

    let steps: [(&str, fn(&InstallProfile) -> Result<(), String>); 8] = [
        ("Checking this computer", preflight::run),
        ("Preparing the private Node.js runtime", node::run),
        ("Installing the application", deploy::run),
        ("Installing application dependencies", deps::run),
        ("Securing local configuration", config::run),
        ("Checking native integrations", handshake::run),
        ("Setting up background startup", service::run),
        ("Finishing setup", handoff::run),
    ];

    for (index, (name, run)) in steps.iter().enumerate() {
        println!("[{}/{}] {name}", index + 1, steps.len());
        if let Err(error) = run(&profile) {
            eprintln!("\nSetup could not finish: {error}\nNothing has been started. You can safely run setup again after resolving the issue.");
            process::exit(1);
        }
        println!("  Done\n");
    }

    if launch_after_install {
        if let Err(error) = handoff::launch(&profile) {
            eprintln!("Setup completed, but Databox could not be opened automatically: {error}");
            eprintln!("Open {} to start it.", display_path(&profile.binary_path("tray-supervisor")));
        }
    }
    println!("Databox CMS is ready.");
}

fn print_help() {
    println!("Databox CMS setup\n\nUsage: databox-installer [options]\n\nOptions:\n  -t, --package-type <type>   Product to install (default: cms:CombinedInstall)\n  -d, --install-dir <path>    Installation folder\n  -c, --config-preset <path>  Config preset inside the application\n      --no-launch             Finish without opening the desktop app\n  -h, --help                  Show this help\n\nProducts: cms:ServerInstall, cms:PosInstall, cms:ConnectorInstall, cms:TraySupervisorInstall, cms:CombinedInstall");
}
