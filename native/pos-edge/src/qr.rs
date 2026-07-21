use fast_qr::qr::QRBuilder;
use image::{ImageBuffer, Rgba};

/// Generates a QR code bitmap for the provided canonical URL (or text).
/// Returns an RGBA raw byte vector representing the image, or an error message.
pub fn generate_receipt_qr(url: &str) -> Result<(u32, u32, Vec<u8>), String> {
    let qr = QRBuilder::new(url.to_string())
        .build()
        .map_err(|e| format!("Failed to build QR: {:?}", e))?;

    let size = qr.size as u32;
    // We scale it up (e.g. 8 pixels per module) for better printing
    let scale = 8;
    let img_size = size * scale;

    let mut img: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::new(img_size, img_size);

    for (x, y, pixel) in img.enumerate_pixels_mut() {
        let qr_x = (x / scale) as usize;
        let qr_y = (y / scale) as usize;
        
        let color = if qr_x < qr.size && qr_y < qr.size {
            // fast_qr internal matrix uses bool (true = dark module)
            if qr[qr_y][qr_x].value() {
                Rgba([0, 0, 0, 255])
            } else {
                Rgba([255, 255, 255, 255])
            }
        } else {
            Rgba([255, 255, 255, 255])
        };
        *pixel = color;
    }

    Ok((img_size, img_size, img.into_raw()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_receipt_qr() {
        let url = "https://databox.example/receipts/123";
        let result = generate_receipt_qr(url);
        assert!(result.is_ok());
        let (width, height, raw) = result.unwrap();
        assert!(width > 0);
        assert!(height > 0);
        assert_eq!(raw.len() as u32, width * height * 4);
    }
}
