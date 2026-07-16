const TARGET_BYTES = 200 * 1024;
const MAX_EDGE = 1600;

function canvasBlob(canvas, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("浏览器无法生成 WebP 图片")), "image/webp", quality));
}

export async function compressFieldImage(file, targetBytes = TARGET_BYTES) {
  if (!file?.type?.startsWith("image/")) return { file, compressed: false };
  if (file.type === "image/webp" && file.size <= targetBytes) return { file, compressed: false };
  let bitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new Error("该图片格式无法压缩，请转换为 JPG、PNG 或 WebP 后重试"); }

  const ratio = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  let quality = .76;
  let blob = await canvasBlob(canvas, quality);
  while (blob.size > targetBytes && quality > .34) { quality -= .07; blob = await canvasBlob(canvas, quality); }
  while (blob.size > targetBytes * 1.1 && Math.max(canvas.width, canvas.height) > 720) {
    const next = document.createElement("canvas");
    next.width = Math.max(1, Math.round(canvas.width * .84));
    next.height = Math.max(1, Math.round(canvas.height * .84));
    next.getContext("2d", { alpha: false }).drawImage(canvas, 0, 0, next.width, next.height);
    canvas.width = next.width;
    canvas.height = next.height;
    canvas.getContext("2d", { alpha: false }).drawImage(next, 0, 0);
    blob = await canvasBlob(canvas, .48);
  }
  const baseName = file.name.replace(/\.[^.]+$/, "") || "field-photo";
  return { file:new File([blob],`${baseName}.webp`,{type:"image/webp",lastModified:Date.now()}), compressed:true, originalBytes:file.size, outputBytes:blob.size };
}

export function formatFileSize(bytes = 0) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}
