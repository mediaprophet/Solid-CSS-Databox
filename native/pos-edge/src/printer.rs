use std::fs::OpenOptions;
use std::io::{self, Write};

/// Industry standard ESC/POS bytes for kicking the cash drawer.
pub const KICK_CASH_DRAWER_BYTES: &[u8] = &[0x1B, 0x70, 0x00, 0x19, 0x19];
/// Industry standard ESC/POS bytes for initializing printer.
pub const INIT_PRINTER_BYTES: &[u8] = &[0x1B, 0x40];

pub struct Printer {
    device_path: String,
}

impl Printer {
    pub fn new(device_path: &str) -> Self {
        Self {
            device_path: device_path.to_string(),
        }
    }

    /// Opens the raw device file (e.g., /dev/usb/lp0 on Linux)
    fn open_device(&self) -> io::Result<std::fs::File> {
        OpenOptions::new()
            .write(true)
            .append(true)
            .open(&self.device_path)
    }

    pub fn print_text(&self, text: &str) -> io::Result<()> {
        let mut file = self.open_device()?;
        file.write_all(INIT_PRINTER_BYTES)?;
        file.write_all(text.as_bytes())?;
        file.write_all(b"\n")?;
        Ok(())
    }

    pub fn open_cash_drawer(&self) -> io::Result<()> {
        let mut file = self.open_device()?;
        file.write_all(KICK_CASH_DRAWER_BYTES)?;
        Ok(())
    }

    /// Generate an ESC/POS raster image sequence for a given bitmap
    pub fn generate_raster_bytes(width: u32, height: u32, rgba_data: &[u8]) -> Vec<u8> {
        let mut bytes = Vec::new();
        // GS v 0 (raster image command)
        bytes.extend_from_slice(&[0x1D, 0x76, 0x30, 0x00]);

        // xL, xH, yL, yH
        let x_bytes = (width / 8) as u16;
        let y_bytes = height as u16;
        bytes.push((x_bytes & 0xFF) as u8);
        bytes.push(((x_bytes >> 8) & 0xFF) as u8);
        bytes.push((y_bytes & 0xFF) as u8);
        bytes.push(((y_bytes >> 8) & 0xFF) as u8);

        // Pack the RGBA data into 1-bit monochrome, 8 pixels per byte
        let mut current_byte = 0u8;
        let mut bit_index = 0;

        for y in 0..height {
            for x in 0..width {
                let idx = ((y * width + x) * 4) as usize;
                // Threshold on red channel (assuming grayscale/b&w)
                let r = rgba_data[idx];
                
                // If it's dark (e.g. < 128), set the bit to 1 (print black)
                if r < 128 {
                    current_byte |= 1 << (7 - bit_index);
                }

                bit_index += 1;
                if bit_index == 8 {
                    bytes.push(current_byte);
                    current_byte = 0;
                    bit_index = 0;
                }
            }
        }

        bytes
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cash_drawer_bytes() {
        assert_eq!(KICK_CASH_DRAWER_BYTES, &[27, 112, 0, 25, 25]);
    }
}
