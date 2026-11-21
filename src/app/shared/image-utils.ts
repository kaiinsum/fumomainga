let webpOk: boolean | undefined;

/** Trình duyệt có xuất được WebP từ canvas không (Safari cũ trả về PNG). */
function canWebp(): boolean {
  if (webpOk === undefined) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    webpOk = c.toDataURL('image/webp').startsWith('data:image/webp');
  }
  return webpOk;
}

/**
 * Đọc file ảnh, thu nhỏ bằng canvas rồi tự nén sang WebP (nhẹ hơn JPEG ~25-35%, giữ được nền trong suốt).
 * `format: 'jpeg'` dùng cho ảnh chia sẻ mạng xã hội (Zalo / một số app chưa đọc WebP).
 * Trình duyệt không hỗ trợ WebP → tự dùng JPEG.
 */
export async function fileToResizedDataUrl(
  file: File,
  maxSize = 1000,
  quality = 0.82,
  format: 'webp' | 'jpeg' = 'webp',
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const webp = format === 'webp' && canWebp();
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  if (!webp) {
    // JPEG không có nền trong suốt → lót trắng
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return webp ? canvas.toDataURL('image/webp', quality) : canvas.toDataURL('image/jpeg', quality);
}
