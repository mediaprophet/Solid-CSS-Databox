use std::process::{Child, Command, Stdio};
use std::fs::File;
use std::path::PathBuf;

pub struct ServerProcess {
    process: Option<Child>,
    log_file: PathBuf,
}

impl ServerProcess {
    pub fn new() -> Self {
        // For simplicity, we just put logs in the OS temp directory
        let log_file = std::env::temp_dir().join("databox_cms.log");
        Self {
            process: None,
            log_file,
        }
    }

    pub fn start(&mut self) {
        if self.process.is_some() {
            return;
        }

        // Open or create the log file for appending
        let out_file = File::create(&self.log_file).unwrap();
        let err_file = out_file.try_clone().unwrap();

        // The Community Solid Server is assumed to be run from its root, which we assume
        // is the parent of `rust/tray-supervisor` 
        let mut cmd = Command::new("node");
        cmd.arg("bin/server.js")
            .current_dir("../../") // Assuming rust/tray-supervisor is two levels deep
            .stdout(Stdio::from(out_file))
            .stderr(Stdio::from(err_file));

        // It is recommended to use the CMS preset here, e.g. CSS_CONFIG="config/cms/file.json"
        // But for the scope of this implementation, we run it as normal
        
        match cmd.spawn() {
            Ok(child) => {
                self.process = Some(child);
                println!("Server started successfully.");
            }
            Err(e) => {
                eprintln!("Failed to start server: {}", e);
            }
        }
    }

    pub fn stop(&mut self) {
        if let Some(mut child) = self.process.take() {
            let _ = child.kill();
            let _ = child.wait();
            println!("Server stopped.");
        }
    }

    pub fn logs_path(&self) -> &std::path::Path {
        self.log_file.as_path()
    }
}
