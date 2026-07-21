use std::io::{BufRead, BufReader, Write};
use std::process::Child;
use std::sync::{Arc, Mutex};

use crate::jobs::JobQueue;

/// Reads structured events from Node's stdout (JSON lines) and writes
/// control commands to Node's stdin. This is the lifecycle channel.
pub fn run_lifecycle_loop(child: Arc<Mutex<Child>>, _job_queue: Arc<Mutex<JobQueue>>) {
    let stdout = {
        let mut guard = child.lock().unwrap();
        guard.stdout.take().expect("No stdout from Node")
    };
    let stdin = {
        let mut guard = child.lock().unwrap();
        guard.stdin.take().expect("No stdin to Node")
    };

    let reader = BufReader::new(stdout);
    let _writer = stdin;

    for line_result in reader.lines() {
        match line_result {
            Ok(line) => {
                if line.trim().is_empty() {
                    continue;
                }
                eprintln!("[pos-edge:ipc] Node stdout: {}", line);
                if let Some(event) = parse_lifecycle_event(&line) {
                    handle_lifecycle_event(&event);
                }
            }
            Err(e) => {
                eprintln!("[pos-edge:ipc] Error reading Node stdout: {}", e);
                break;
            }
        }
    }
}

#[derive(Debug)]
pub struct LifecycleEvent {
    pub event_type: String,
    pub port: Option<u16>,
    pub message: Option<String>,
}

fn parse_lifecycle_event(line: &str) -> Option<LifecycleEvent> {
    let trimmed = line.trim();
    if !trimmed.starts_with('{') {
        return None;
    }
    let parsed: serde_json::Value = serde_json::from_str(trimmed).ok()?;
    let event_type = parsed.get("type")?.as_str()?.to_string();
    let port = parsed.get("port").and_then(|v| v.as_u64()).map(|v| v as u16);
    let message = parsed.get("message").and_then(|v| v.as_str()).map(String::from);
    Some(LifecycleEvent { event_type, port, message })
}

fn handle_lifecycle_event(event: &LifecycleEvent) {
    match event.event_type.as_str() {
        "ready" => {
            eprintln!(
                "[pos-edge:ipc] Node is ready on port {}",
                event.port.unwrap_or(3000)
            );
        }
        "error" => {
            eprintln!(
                "[pos-edge:ipc] Node error: {}",
                event.message.as_deref().unwrap_or("unknown")
            );
        }
        "log" => {
            eprintln!(
                "[pos-edge:ipc] Node log: {}",
                event.message.as_deref().unwrap_or("")
            );
        }
        _ => {
            eprintln!("[pos-edge:ipc] Unknown event type: {}", event.event_type);
        }
    }
}

/// Sends a shutdown command to Node via stdin.
#[allow(dead_code)]
pub fn send_shutdown(writer: &mut impl Write) {
    let cmd = r#"{"cmd":"shutdown"}"#;
    let _ = writer.write_all(cmd.as_bytes());
    let _ = writer.write_all(b"\n");
    let _ = writer.flush();
}
