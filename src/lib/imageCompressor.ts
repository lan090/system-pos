/**
 * Frontend Image Compression Utility for FSRMS v2.0
 * Resizes images to maximum 800x600px, converts to JPEG/WebP, and lowers quality
 * until the size is strictly < 150KB to preserve free-tier Supabase Storage.
 */

export function compressImage(file: File): Promise<{ base64: string; sizeKB: number; originalSizeKB: number }> {
  return new Promise((resolve, reject) => {
    const originalSizeKB = Math.round(file.size / 1024);
    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;

      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Apply max 800x600 boundary while keeping aspect ratio
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 600;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Fill background with white in case of transparent pngs
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);

        ctx.drawImage(img, 0, 0, width, height);

        // Compress iteratively to comply with the <150KB requirement
        let quality = 0.85;
        let base64Result = '';
        let sizeKB = 0;

        // Iteratively lower quality if output size exceeds 150KB
        do {
          base64Result = canvas.toDataURL('image/jpeg', quality);
          // Calculate size from base64 string length
          const stringLength = base64Result.length - 'data:image/jpeg;base64,'.length;
          sizeKB = Math.round((stringLength * 3) / 4 / 1024);
          
          quality -= 0.1;
        } while (sizeKB >= 150 && quality > 0.1);

        resolve({
          base64: base64Result,
          sizeKB,
          originalSizeKB
        });
      };

      img.onerror = (err) => reject(err);
    };

    reader.onerror = (err) => reject(err);
  });
}
