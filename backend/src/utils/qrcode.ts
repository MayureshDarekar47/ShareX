import QRCode from 'qrcode';

/**
 * Generate a QR code as a data URL (base64 PNG) for the given text.
 */
export async function generateQRCode(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    type: 'image/png',
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
    width: 400,
  });
}

/**
 * Generate a QR code as an SVG string.
 */
export async function generateQRCodeSVG(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
  });
}
