use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use crate::hardware::{self, HardwareConfig};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Job {
    pub id: String,
    pub device_id: String,
    pub command: String,
    pub status: String,
    pub raw_input: String,
    pub error: Option<String>,
}

pub struct JobQueue {
    jobs: HashMap<String, Job>,
    order: Vec<String>,
}

impl JobQueue {
    pub fn new() -> Self {
        Self {
            jobs: HashMap::new(),
            order: Vec::new(),
        }
    }

    pub fn enqueue(&mut self, id: String, device_id: String, command: String, raw_input: String) -> Job {
        let job = Job {
            id: id.clone(),
            device_id,
            command,
            status: "queued".to_string(),
            raw_input,
            error: None,
        };
        self.jobs.insert(id.clone(), job.clone());
        self.order.push(id);
        job
    }

    pub fn get(&self, id: &str) -> Option<&Job> {
        self.jobs.get(id)
    }

    pub fn cancel(&mut self, id: &str) -> Option<Job> {
        if let Some(job) = self.jobs.get_mut(id) {
            if job.status == "queued" {
                job.status = "cancelled".to_string();
                return Some(job.clone());
            }
        }
        None
    }

    pub fn claim_next(&mut self) -> Option<Job> {
        for id in &self.order {
            if let Some(job) = self.jobs.get_mut(id) {
                if job.status == "queued" {
                    job.status = "claimed".to_string();
                    return Some(job.clone());
                }
            }
        }
        None
    }

    pub fn complete(&mut self, id: &str) {
        if let Some(job) = self.jobs.get_mut(id) {
            job.status = "completed".to_string();
        }
    }

    pub fn fail(&mut self, id: &str, error: &str) {
        if let Some(job) = self.jobs.get_mut(id) {
            job.status = "failed".to_string();
            job.error = Some(error.to_string());
        }
    }
}

/// Background worker that claims queued jobs and executes hardware I/O.
pub fn run_job_worker(job_queue: Arc<Mutex<JobQueue>>, hw_config: Arc<HardwareConfig>) {
    loop {
        let job = {
            let mut queue = job_queue.lock().unwrap();
            queue.claim_next()
        };

        match job {
            Some(job) => {
                eprintln!(
                    "[pos-edge:worker] Executing job {} command {}",
                    job.id, job.command
                );
                let result = hardware::execute_command(&job.command, &job.raw_input, &hw_config);
                let mut queue = job_queue.lock().unwrap();
                match result {
                    Ok(()) => {
                        eprintln!("[pos-edge:worker] Job {} completed", job.id);
                        queue.complete(&job.id);
                    }
                    Err(e) => {
                        eprintln!("[pos-edge:worker] Job {} failed: {}", job.id, e);
                        queue.fail(&job.id, &e);
                    }
                }
            }
            None => {
                thread::sleep(Duration::from_millis(100));
            }
        }
    }
}
