use crate::shape::InstallProfile;

/// Step 8: Administrative provisioning & handoff.
/// Writes the install manifest and outputs final URLs.
pub fn run(profile: &InstallProfile) -> Result<(), String> {
    let data_dir = profile.data_dir();
    let manifest_path = format!("{}/install-state.ttl", data_dir);

    let timestamp = current_timestamp();
    let manifest = format!(
        r#"@prefix cms: <urn:solid-server:databox:cms#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix dct: <http://purl.org/dc/terms/> .

<{}/install-state> a cms:InstallProfile ;
  cms:installType "{}" ;
  cms:configPreset "{}" ;
  cms:serviceName "{}" ;
  cms:requiredPort {} ;
  dct:created "{}"^^xsd:dateTime ;
  cms:installDir "{}" .
"#,
        data_dir,
        profile.type_name,
        profile.config_preset,
        profile.service_name,
        profile.required_port,
        timestamp,
        profile.install_dir,
    );

    std::fs::write(&manifest_path, &manifest)
        .map_err(|e| format!("Failed to write install manifest: {}", e))?;

    println!("  Install manifest written to {}", manifest_path);
    println!();
    println!("  ──────────────────────────────────────────────");
    println!("  Admin panel:     http://localhost:{}/.databox/cms/admin", profile.required_port);
    println!("  Server root:     http://localhost:{}/", profile.required_port);
    if profile.native_edge_binary.is_some() {
        println!("  POS edge bridge: http://localhost:{}/health", profile.native_edge_http_port);
    }
    println!("  Service name:    {}", profile.service_name);
    println!("  Data directory:  {}", data_dir);
    println!("  ──────────────────────────────────────────────");
    println!();
    println!("  Next steps:");
    println!("    1. Open the admin panel URL in your browser");
    println!("    2. Create the root WebID and primary data pod");
    println!("    3. Configure access control lists (ACLs)");
    println!("    4. Enable the first CMS module (hosting)");

    Ok(())
}

fn current_timestamp() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}
