use crate::shape::InstallProfile;

pub fn run(profile: &InstallProfile) -> Result<(), String> {
    for binary in &profile.required_binaries {
        let path = profile.binary_path(binary);
        if !path.is_file() { return Err(format!("Required helper '{binary}' was not installed.")); }
    }
    if profile.native_edge_binary.is_some() { println!("  POS edge is installed and will be started by the desktop supervisor"); }
    Ok(())
}
