use std::fs::OpenOptions;
use std::io::Write;

/// Shows text on the customer-facing display.
pub fn show_text(device_path: &str, text: &str) -> std::io::Result<()> {
    eprintln!("[pos-edge:display] Showing text on {}: {:?}", device_path, text);
    let mut file = OpenOptions::new()
        .write(true)
        .open(device_path)?;
    // Clear display + write text
    file.write_all(&[0x0C])?; // Form feed clears many LCD displays
    file.write_all(text.as_bytes())?;
    file.flush()?;
    Ok(())
}

/// Shows a transaction total on the customer-facing display.
pub fn show_total(device_path: &str, total: &str) -> std::io::Result<()> {
    eprintln!("[pos-edge:display] Showing total on {}: {:?}", device_path, total);
    let mut file = OpenOptions::new()
        .write(true)
        .open(device_path)?;
    file.write_all(&[0x0C])?; // Clear
    // Many pole displays support a "total" line format
    let display_text = format!("Total: {}\n", total);
    file.write_all(display_text.as_bytes())?;
    file.flush()?;
    Ok(())
}
