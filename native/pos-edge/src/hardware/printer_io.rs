use std::fs::OpenOptions;
use std::io::Write;

use pos_edge::printer::Printer;
use pos_edge::qr;

/// Prints a receipt: text body + optional QR code, then feeds and cuts.
pub fn print_receipt(device_path: &str, text: &str, qr_url: Option<&str>) -> std::io::Result<()> {
    eprintln!("[pos-edge:printer] Printing receipt to {}", device_path);
    let printer = Printer::new(device_path);

    printer.print_text(text)?;

    if let Some(url) = qr_url {
        eprintln!("[pos-edge:printer] Generating QR for: {}", url);
        match qr::generate_receipt_qr(url) {
            Ok((width, height, rgba)) => {
                let raster_bytes = Printer::generate_raster_bytes(width, height, &rgba);
                let mut file = OpenOptions::new()
                    .write(true)
                    .append(true)
                    .open(device_path)?;
                file.write_all(&raster_bytes)?;
                file.flush()?;
                eprintln!("[pos-edge:printer] QR raster printed ({}x{})", width, height);
            }
            Err(e) => {
                eprintln!("[pos-edge:printer] QR generation failed: {} — printing text only", e);
            }
        }
    }

    Ok(())
}

/// Sends a partial cut command to the printer.
pub fn cut_paper(device_path: &str) -> std::io::Result<()> {
    eprintln!("[pos-edge:printer] Cutting paper on {}", device_path);
    let mut file = OpenOptions::new()
        .write(true)
        .append(true)
        .open(device_path)?;
    // ESC/POS partial cut: GS V 1
    file.write_all(&[0x1D, 0x56, 0x01])?;
    file.flush()?;
    Ok(())
}
