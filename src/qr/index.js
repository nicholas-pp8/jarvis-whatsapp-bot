import QRCode from 'qrcode';
export async function generateQR(text){
 if(typeof text!=='string'||!text.trim())throw new Error('Usage: /qr <text or URL>');
 if(Buffer.byteLength(text,'utf8')>2000)throw new Error('QR data is too long. Use at most 2000 UTF-8 bytes.');
 if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text))throw new Error('QR data contains unsupported control characters.');
 try{return await QRCode.toBuffer(text,{type:'png',width:1024,margin:4,errorCorrectionLevel:'M'});}catch{throw new Error('Could not generate this QR code. Try shorter text.');}
}
