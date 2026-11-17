/**
 * Đọc file ảnh và thu nhỏ bằng canvas để lưu gọn trong localStorage.
 * Trả về data URL (JPEG, hoặc PNG nếu ảnh gốc có nền trong suốt dạng PNG/WebP nhỏ).
 */
export async function fileToResizedDataUrl(file: File, maxSize = 1000, quality = 0.82): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', quality);
}
