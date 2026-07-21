use anyhow::{Context, Result};
use clap::Parser;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper_util::rt::TokioIo;
use std::net::SocketAddr;
use tokio::net::TcpListener;

mod proxy;

#[derive(Parser, Debug, Clone)]
#[command(author, version, about, long_about = None)]
pub struct Args {
    /// Port to listen on locally
    #[arg(short, long, default_value_t = 8080)]
    pub port: u16,

    /// Target Solid Pod Base URL (e.g., https://solid.example.com/)
    #[arg(short, long)]
    pub target_url: String,

    /// Path to the PKCS12 (.p12 / .pfx) client certificate containing the WebID-TLS identity
    #[arg(short, long)]
    pub cert_path: String,

    /// Password for the PKCS12 certificate (if any)
    #[arg(long, default_value = "")]
    pub cert_pass: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    
    // Load proxy state (which reads the certificate)
    let proxy_state = proxy::ProxyState::new(args.clone())
        .await
        .context("Failed to initialize proxy state and load client certificates")?;

    let addr = SocketAddr::from(([127, 0, 0, 1], args.port));
    let listener = TcpListener::bind(addr).await?;
    println!("Native POS Edge Proxy listening on http://{}", addr);
    println!("Forwarding requests with WebID-TLS to {}", args.target_url);

    loop {
        let (stream, _) = listener.accept().await?;
        let io = TokioIo::new(stream);
        let state = proxy_state.clone();

        tokio::task::spawn(async move {
            let service = service_fn(move |req| proxy::handle_request(req, state.clone()));
            if let Err(err) = http1::Builder::new().serve_connection(io, service).await {
                eprintln!("Error serving connection: {:?}", err);
            }
        });
    }
}
