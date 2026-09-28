export const SM_EDGE = 480;
export const LG_EDGE = 1800;
export const ANALYSIS_EDGE = 64;
const WEBP_QUALITY = 0.82;

export interface ResizeResult {
  sm: Blob;
  lg: Blob;
  /** Pixel size of the lg image. */
  width: number;
  height: number;
  /** ~64px downsample for color analysis. */
  small: ImageData;
}

function draw(bitmap: ImageBitmap, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas;
}

function toWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b && b.type === 'image/webp' ? resolve(b) : reject(new Error('This browser cannot write webp images.'))),
      'image/webp',
      WEBP_QUALITY,
    ),
  );
}

function fit(w: number, h: number, edge: number): [number, number] {
  const s = Math.min(1, edge / Math.max(w, h)); // never upscale
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
}

/** File/Blob -> webp sm (long edge 480) and lg (long edge 1800) plus a 64px ImageData. EXIF orientation is respected. */
export async function resizePhoto(file: Blob): Promise<ResizeResult> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const [lw, lh] = fit(bitmap.width, bitmap.height, LG_EDGE);
    const lgCanvas = draw(bitmap, lw, lh);
    const [sw, sh] = fit(bitmap.width, bitmap.height, SM_EDGE);
    // downscale from lg canvas would be fine, but drawing from the bitmap keeps quality
    const smCanvas = draw(bitmap, sw, sh);
    const s = ANALYSIS_EDGE / Math.max(bitmap.width, bitmap.height);
    const aw = Math.max(1, Math.round(bitmap.width * Math.min(1, s)));
    const ah = Math.max(1, Math.round(bitmap.height * Math.min(1, s)));
    const small = draw(bitmap, aw, ah).getContext('2d')!.getImageData(0, 0, aw, ah);
    const [lg, sm] = await Promise.all([toWebp(lgCanvas), toWebp(smCanvas)]);
    return { sm, lg, width: lw, height: lh, small };
  } finally {
    bitmap.close();
  }
}
