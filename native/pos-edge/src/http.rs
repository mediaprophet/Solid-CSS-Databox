use std::sync::{Arc, Mutex};
use std::io::{Read, Write};
use std::net::TcpListener;

use crate::jobs::JobQueue;
use crate::hardware::HardwareConfig;

/// Runs the localhost HTTP job bridge server on the given port.
/// The Node CMS posts POS device jobs to this endpoint.
pub fn run_http_server(port: u16, job_queue: Arc<Mutex<JobQueue>>, hw_config: Arc<HardwareConfig>) {
    let listener = match TcpListener::bind(format!("127.0.0.1:{}", port)) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[pos-edge:http] Failed to bind port {}: {}", port, e);
            return;
        }
    };
    eprintln!("[pos-edge:http] Listening on 127.0.0.1:{}", port);

    for stream_result in listener.incoming() {
        match stream_result {
            Ok(stream) => {
                let queue = Arc::clone(&job_queue);
                let hw = Arc::clone(&hw_config);
                std::thread::spawn(move || {
                    handle_request(stream, queue, hw);
                });
            }
            Err(e) => {
                eprintln!("[pos-edge:http] Accept error: {}", e);
            }
        }
    }
}

fn handle_request(
    mut stream: std::net::TcpStream,
    job_queue: Arc<Mutex<JobQueue>>,
    hw_config: Arc<HardwareConfig>,
) {
    let mut buffer = [0u8; 4096];
    let bytes_read = match stream.read(&mut buffer) {
        Ok(n) if n > 0 => n,
        _ => return,
    };

    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
    let (method, path, body) = parse_request(&request);

    eprintln!("[pos-edge:http] {} {}", method, path);

    let response = match (method.as_str(), path.as_str()) {
        ("GET", "/health") => handle_health(&hw_config),
        ("POST", "/jobs") => handle_create_job(&body, &job_queue),
        ("GET", p) if p.starts_with("/jobs/") => {
            let job_id = p.strip_prefix("/jobs/").unwrap_or("");
            handle_get_job(job_id, &job_queue)
        }
        ("POST", p) if p.starts_with("/jobs/") && p.ends_with("/cancel") => {
            let job_id = p.strip_prefix("/jobs/").unwrap_or("");
            let job_id = job_id.strip_suffix("/cancel").unwrap_or(job_id);
            handle_cancel_job(job_id, &job_queue)
        }
        _ => json_response(404, r#"{"error":"not-found"}"#),
    };

    let _ = stream.write_all(response.as_bytes());
}

fn parse_request(request: &str) -> (String, String, String) {
    let mut lines = request.lines();
    let request_line = lines.next().unwrap_or("GET / HTTP/1.1");
    let parts: Vec<&str> = request_line.split_whitespace().collect();
    let method = parts.first().unwrap_or(&"GET").to_string();
    let path = parts.get(1).unwrap_or(&"/").to_string();

    let body_start = request.find("\r\n\r\n").map(|i| i + 4).unwrap_or(request.len());
    let body = request[body_start..].trim_end_matches('\0').to_string();

    (method, path, body)
}

fn handle_health(hw_config: &HardwareConfig) -> String {
    let printer_connected = hw_config.printer_device.is_some();
    let display_connected = hw_config.display_device.is_some();
    json_response(200, &format!(
        r#"{{"status":"healthy","printer":{},"display":{},"cashDrawerVia":"{}"}}"#,
        printer_connected,
        display_connected,
        hw_config.cash_drawer_via,
    ))
}

fn handle_create_job(body: &str, job_queue: &Arc<Mutex<JobQueue>>) -> String {
    let job_input: serde_json::Value = match serde_json::from_str(body) {
        Ok(v) => v,
        Err(e) => return json_response(400, &format!(r#"{{"error":"invalid-json: {}"}}"#, e)),
    };

    let job_id = job_input
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();
    let command = job_input
        .get("command")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();
    let device_id = job_input
        .get("deviceId")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    let mut queue = job_queue.lock().unwrap();
    let job = queue.enqueue(job_id, device_id, command, body.to_string());
    json_response(201, &serde_json::to_string(&job).unwrap_or_default())
}

fn handle_get_job(job_id: &str, job_queue: &Arc<Mutex<JobQueue>>) -> String {
    let queue = job_queue.lock().unwrap();
    match queue.get(job_id) {
        Some(job) => json_response(200, &serde_json::to_string(job).unwrap_or_default()),
        None => json_response(404, r#"{"error":"job-not-found"}"#),
    }
}

fn handle_cancel_job(job_id: &str, job_queue: &Arc<Mutex<JobQueue>>) -> String {
    let mut queue = job_queue.lock().unwrap();
    match queue.cancel(job_id) {
        Some(job) => json_response(200, &serde_json::to_string(&job).unwrap_or_default()),
        None => json_response(404, r#"{"error":"job-not-found"}"#),
    }
}

fn json_response(status: u16, body: &str) -> String {
    format!(
        "HTTP/1.1 {} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\n\r\n{}",
        status,
        body.len(),
        body,
    )
}
