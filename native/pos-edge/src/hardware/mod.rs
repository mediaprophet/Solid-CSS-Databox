mod drawer;
mod printer_io;
mod display;

#[derive(Clone)]
pub struct HardwareConfig {
    pub printer_device: Option<String>,
    pub display_device: Option<String>,
    pub cash_drawer_via: String,
}

/// Dispatches a hardware command to the appropriate I/O driver.
pub fn execute_command(
    command: &str,
    raw_input: &str,
    config: &HardwareConfig,
) -> Result<(), String> {
    eprintln!(
        "[pos-edge:hw] Dispatching command: {} (drawer via: {})",
        command, config.cash_drawer_via
    );
    match command {
        "cash-drawer.open" => {
            let printer_device = config.printer_device.as_deref();
            drawer::open_cash_drawer(printer_device, &config.cash_drawer_via)
                .map_err(|e| format!("cash-drawer.open failed: {}", e))
        }
        "receipt-printer.print-receipt" => {
            let device = config.printer_device.as_deref()
                .ok_or("No printer device configured")?;
            let input: serde_json::Value = serde_json::from_str(raw_input)
                .map_err(|e| format!("Invalid job input: {}", e))?;
            let text = input
                .get("text")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let qr_url = input
                .get("qrUrl")
                .and_then(|v| v.as_str());
            printer_io::print_receipt(device, text, qr_url)
                .map_err(|e| format!("receipt-printer.print-receipt failed: {}", e))
        }
        "receipt-printer.cut-paper" => {
            let device = config.printer_device.as_deref()
                .ok_or("No printer device configured")?;
            printer_io::cut_paper(device)
                .map_err(|e| format!("receipt-printer.cut-paper failed: {}", e))
        }
        "customer-display.show-text" => {
            let device = config.display_device.as_deref()
                .ok_or("No display device configured")?;
            let input: serde_json::Value = serde_json::from_str(raw_input)
                .map_err(|e| format!("Invalid job input: {}", e))?;
            let text = input
                .get("text")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            display::show_text(device, text)
                .map_err(|e| format!("customer-display.show-text failed: {}", e))
        }
        "customer-display.show-total" => {
            let device = config.display_device.as_deref()
                .ok_or("No display device configured")?;
            let input: serde_json::Value = serde_json::from_str(raw_input)
                .map_err(|e| format!("Invalid job input: {}", e))?;
            let total = input
                .get("total")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            display::show_total(device, total)
                .map_err(|e| format!("customer-display.show-total failed: {}", e))
        }
        "pos-terminal.request-payment" | "pos-terminal.cancel-payment" => {
            eprintln!("[pos-edge:hw] Terminal command {} queued (PCI scope — no hardware I/O)", command);
            Ok(())
        }
        _ => Err(format!("Unknown command: {}", command)),
    }
}
