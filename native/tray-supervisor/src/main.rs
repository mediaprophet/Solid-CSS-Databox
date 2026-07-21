use std::process::{Child, Command};
use std::env;
use tao::{
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoopBuilder},
    window::WindowBuilder,
};
use tray_icon::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    Icon, TrayIconBuilder,
};
use webbrowser;
use wry::WebViewBuilder;

fn main() {
    let event_loop = EventLoopBuilder::new().build();

    // Determine spawn mode: pos-edge (if POS_EDGE_SPAWN=true) or direct node
    let spawn_pos_edge = env::var("POS_EDGE_SPAWN").unwrap_or_default() == "true";
    let pos_edge_binary = env::var("POS_EDGE_BINARY").unwrap_or_else(|_| "pos-edge".to_string());

    // Create an empty 32x32 RGBA icon
    let icon_rgba = vec![0; 32 * 32 * 4];
    let icon = Icon::from_rgba(icon_rgba, 32, 32).expect("Failed to create icon");

    let tray_menu = Menu::new();
    let start_server_i = MenuItem::new("Start Server", true, None);
    let stop_server_i = MenuItem::new("Stop Server", false, None);
    let open_admin_i = MenuItem::new("Open Admin", true, None);
    let open_display_i = MenuItem::new("Open Customer Display", true, None);
    let quit_i = PredefinedMenuItem::quit(None);

    tray_menu.append(&start_server_i).unwrap();
    tray_menu.append(&stop_server_i).unwrap();
    tray_menu.append(&PredefinedMenuItem::separator()).unwrap();
    tray_menu.append(&open_admin_i).unwrap();
    tray_menu.append(&open_display_i).unwrap();
    tray_menu.append(&PredefinedMenuItem::separator()).unwrap();
    tray_menu.append(&quit_i).unwrap();

    let mut tray_icon = Some(
        TrayIconBuilder::new()
            .with_menu(Box::new(tray_menu.clone()))
            .with_tooltip("Community Solid Server CMS")
            .with_icon(icon)
            .build()
            .unwrap(),
    );

    let menu_channel = MenuEvent::receiver();
    let mut server_process: Option<Child> = None;
    
    // Hold onto the window and webview to keep them alive
    let mut display_window = None;

    event_loop.run(move |event, event_loop_window_target, control_flow| {
        *control_flow = ControlFlow::Wait;

        if let Ok(menu_event) = menu_channel.try_recv() {
            println!("Menu event: {:?}", menu_event);
            if menu_event.id == start_server_i.id() {
                if server_process.is_none() {
                    println!("Starting server...");
                    let child = if spawn_pos_edge {
                        // CombinedInstall chain: tray → pos-edge → node
                        println!("Spawning via pos-edge binary: {}", pos_edge_binary);
                        Command::new(&pos_edge_binary)
                            .spawn()
                    } else {
                        // Direct node spawn (default)
                        Command::new("node")
                            .arg("./bin/server.js")
                            .arg("-c")
                            .arg("config/cms/cms.json")
                            .spawn()
                    };
                    match child {
                        Ok(child) => {
                            server_process = Some(child);
                            start_server_i.set_enabled(false);
                            stop_server_i.set_enabled(true);
                        }
                        Err(e) => {
                            eprintln!("Failed to start server: {}", e);
                        }
                    }
                }
            } else if menu_event.id == stop_server_i.id() {
                if let Some(mut child) = server_process.take() {
                    println!("Stopping server...");
                    let _ = child.kill();
                    let _ = child.wait();
                    start_server_i.set_enabled(true);
                    stop_server_i.set_enabled(false);
                }
            } else if menu_event.id == open_admin_i.id() {
                println!("Opening admin panel...");
                let _ = webbrowser::open("http://localhost:3000/.databox/cms/admin");
            } else if menu_event.id == open_display_i.id() {
                println!("Opening customer display...");
                if display_window.is_none() {
                    let window = WindowBuilder::new()
                        .with_title("Customer Display")
                        // In production, we could set .with_fullscreen()
                        .build(event_loop_window_target)
                        .unwrap();
                    
                    let webview = WebViewBuilder::new()
                        .with_url("http://localhost:3000/.databox/cms/admin/pos/display")
                        .build(&window)
                        .unwrap();
                    
                    display_window = Some((window, webview));
                }
            } else if menu_event.id == quit_i.id() {
                if let Some(mut child) = server_process.take() {
                    println!("Stopping server before quit...");
                    let _ = child.kill();
                    let _ = child.wait();
                }
                tray_icon.take(); // Drop icon
                *control_flow = ControlFlow::Exit;
            }
        }

        // Handle window events (like closing the customer display)
        if let Event::WindowEvent { event, window_id: _, .. } = event {
            match event {
                WindowEvent::CloseRequested => {
                    display_window = None;
                }
                _ => {}
            }
        }
    });
}
