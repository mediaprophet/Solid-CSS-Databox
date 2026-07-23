#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use std::{env, fs::OpenOptions, path::{Path, PathBuf}, process::{Child, Command, Stdio}};
use serde::Deserialize;
use tao::event_loop::{ControlFlow, EventLoopBuilder};
use tray_icon::{menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem}, Icon, TrayIconBuilder};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopConfig {
    app_dir: PathBuf,
    node_path: PathBuf,
    config_preset: String,
    admin_url: String,
    logs_dir: PathBuf,
    #[serde(default)] pos_edge_path: Option<PathBuf>,
    #[serde(default = "start_on_launch")] start_on_launch: bool,
}

fn start_on_launch() -> bool { true }

fn main() {
    let config = match load_config() {
        Ok(config) => config,
        Err(error) => { show_error(&error); return; }
    };
    let event_loop = EventLoopBuilder::new().build();
    let menu = Menu::new();
    let status = MenuItem::new("Databox CMS — starting…", false, None);
    let open_admin = MenuItem::new("Open admin panel", true, None);
    let open_display = MenuItem::new("Open customer display", true, None);
    let start = MenuItem::new("Start server", true, None);
    let stop = MenuItem::new("Stop server", false, None);
    let open_logs = MenuItem::new("Open logs folder", true, None);
    let quit = PredefinedMenuItem::quit(None);
    menu.append(&status).expect("Could not build tray menu");
    menu.append(&PredefinedMenuItem::separator()).expect("Could not build tray menu");
    menu.append(&open_admin).expect("Could not build tray menu");
    menu.append(&open_display).expect("Could not build tray menu");
    menu.append(&PredefinedMenuItem::separator()).expect("Could not build tray menu");
    menu.append(&start).expect("Could not build tray menu");
    menu.append(&stop).expect("Could not build tray menu");
    menu.append(&PredefinedMenuItem::separator()).expect("Could not build tray menu");
    menu.append(&open_logs).expect("Could not build tray menu");
    menu.append(&quit).expect("Could not build tray menu");
    let _tray = TrayIconBuilder::new().with_menu(Box::new(menu)).with_tooltip("Databox CMS").with_icon(databox_icon()).build().expect("Could not create the notification icon");

    let menu_events = MenuEvent::receiver();
    let mut server = if config.start_on_launch { start_server(&config, &status, &start, &stop) } else { None };
    event_loop.run(move |_event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        if let Ok(event) = menu_events.try_recv() {
            if event.id == start.id() {
                if server.is_none() { server = start_server(&config, &status, &start, &stop); }
            } else if event.id == stop.id() {
                if let Some(mut child) = server.take() { let _ = child.kill(); let _ = child.wait(); }
                status.set_text("Databox CMS — stopped"); start.set_enabled(true); stop.set_enabled(false);
            } else if event.id == open_admin.id() {
                let _ = webbrowser::open(&config.admin_url);
            } else if event.id == open_display.id() {
                let _ = webbrowser::open(&format!("{}/pos/display", config.admin_url.trim_end_matches('/')));
            } else if event.id == open_logs.id() {
                open_folder(&config.logs_dir);
            } else if event.id == quit.id() {
                if let Some(mut child) = server.take() { let _ = child.kill(); let _ = child.wait(); }
                *control_flow = ControlFlow::Exit;
            }
        }
    });
}

fn start_server(config: &DesktopConfig, status: &MenuItem, start: &MenuItem, stop: &MenuItem) -> Option<Child> {
    if let Err(error) = std::fs::create_dir_all(&config.logs_dir) { show_error(&format!("Could not create the log folder: {error}")); return None; }
    let log_path = config.logs_dir.join("server.log");
    let output = match OpenOptions::new().create(true).append(true).open(&log_path) { Ok(file) => file, Err(error) => { show_error(&format!("Could not open the server log: {error}")); return None; } };
    let error = match output.try_clone() { Ok(file) => file, Err(error) => { show_error(&format!("Could not prepare the server log: {error}")); return None; } };
    let mut command = if let Some(edge) = &config.pos_edge_path { Command::new(edge) } else { Command::new(&config.node_path) };
    command.current_dir(&config.app_dir).stdout(Stdio::from(output)).stderr(Stdio::from(error));
    if config.pos_edge_path.is_some() {
        command.env("POS_NODE_BINARY", &config.node_path).env("POS_NODE_CONFIG", &config.config_preset).env("POS_HTTP_PORT", "9100");
    } else {
        command.arg("./bin/server.js").arg("-c").arg(&config.config_preset);
    }
    match command.spawn() {
        Ok(child) => { status.set_text("Databox CMS — running"); start.set_enabled(false); stop.set_enabled(true); Some(child) }
        Err(error) => { status.set_text("Databox CMS — could not start"); show_error(&format!("Databox could not start. See {}\n\n{error}", log_path.display())); None }
    }
}

fn load_config() -> Result<DesktopConfig, String> {
    if let Some(path) = env::var_os("DATABOX_DESKTOP_CONFIG") {
        return parse_config(PathBuf::from(path));
    }
    let executable = env::current_exe().map_err(|error| error.to_string())?;
    let installed = executable.parent().and_then(Path::parent).unwrap_or_else(|| Path::new(".")).join("databox-desktop.json");
    if installed.is_file() { return parse_config(installed); }
    Err("Databox is not configured. Run the installer again to repair this installation.".to_owned())
}

fn parse_config(path: PathBuf) -> Result<DesktopConfig, String> {
    serde_json::from_slice(&std::fs::read(&path).map_err(|error| format!("Could not read {}: {error}", path.display()))?).map_err(|error| format!("Could not read desktop configuration: {error}"))
}

fn open_folder(folder: &Path) {
    #[cfg(target_os = "windows")]
    { let _ = Command::new("explorer").arg(folder).spawn(); }
    #[cfg(target_os = "macos")]
    { let _ = Command::new("open").arg(folder).spawn(); }
    #[cfg(target_os = "linux")]
    { let _ = Command::new("xdg-open").arg(folder).spawn(); }
}

fn show_error(message: &str) { eprintln!("{message}"); }

fn databox_icon() -> Icon {
    let mut rgba = vec![0_u8; 32 * 32 * 4];
    for y in 0..32 { for x in 0..32 {
        let offset = (y * 32 + x) * 4;
        let edge = x < 3 || x > 28 || y < 3 || y > 28;
        let white = (10..22).contains(&x) && (10..22).contains(&y) && ((x + y) % 5 != 0);
        rgba[offset..offset + 4].copy_from_slice(if edge { &[31, 61, 143, 255] } else if white { &[255, 255, 255, 255] } else { &[32, 120, 214, 255] });
    }}
    Icon::from_rgba(rgba, 32, 32).expect("Valid Databox icon")
}
