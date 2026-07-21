use anyhow::{Context, Result};
use reqwest::{Client, header};

pub struct SolidClient {
    client: Client,
    base_url: String,
}

impl SolidClient {
    pub fn new(base_url: String, token: Option<String>) -> Result<Self> {
        let mut headers = header::HeaderMap::new();
        if let Some(tok) = token {
            let mut auth_value = header::HeaderValue::from_str(&format!("Bearer {}", tok))?;
            auth_value.set_sensitive(true);
            headers.insert(header::AUTHORIZATION, auth_value);
        }

        let client = Client::builder()
            .default_headers(headers)
            .build()
            .context("Failed to build HTTP client")?;

        Ok(Self { client, base_url })
    }

    pub async fn upload_rdf(&self, path: &str, turtle_data: &str) -> Result<()> {
        let url = format!("{}{}", self.base_url.trim_end_matches('/'), path);
        
        let response = self.client.put(&url)
            .header(header::CONTENT_TYPE, "text/turtle")
            .body(turtle_data.to_string())
            .send()
            .await
            .context("Failed to send LDP request")?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to upload RDF to {}: {} - {}", url, status, text);
        }

        Ok(())
    }
}
