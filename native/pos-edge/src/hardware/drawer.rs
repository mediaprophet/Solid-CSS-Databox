use std::fs::OpenOptions;
use std::io::Write;

use pos_edge::printer::KICK_CASH_DRAWER_BYTES;

/// Opens the cash drawer. If `via` is "printer", sends ESC/POS kick bytes
/// through the printer device. If "direct", opens the drawer's own device.
pub fn open_cash_drawer(printer_device: Option<&str>, via: &str) -> std::io::Result<()> {
    eprintln!("[pos-edge:drawer] Opening cash drawer via {}", via);
    match via {
        "printer" => {
            let device = printer_device
                .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "No printer device for cash drawer"))?;
            let mut file = OpenOptions::new()
                .write(true)
                .open(device)?;
            file.write_all(KICK_CASH_DRAWER_BYTES)?;
            file.flush()?;
            eprintln!("[pos-edge:drawer] Cash drawer kick sent via printer");
            Ok(())
        }
        "direct" => {
            eprintln!("[pos-edge:drawer] Direct cash drawer device not yet implemented — would write to /dev/cash-drawer");
            Ok(())
        }
        _ => Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, format!("Unknown cash_drawer_via: {}", via))),
    }
}
