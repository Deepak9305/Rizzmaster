/**
 * Service to handle image resizing and compression using Browser Canvas API.
 * This helps optimize token usage for Groq Vision models.
 */

export const resizeImage = async (dataUrl: string, maxDimension: number = 800): Promise<string> => {
    return new Promise((resolve, reject) => {
        // Only run in browser environments
        if (typeof window === 'undefined') {
            resolve(dataUrl);
            return;
        }

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            let width = img.width;
            let height = img.height;

            // Calculate new dimensions while maintaining aspect ratio
            if (width > height) {
                if (width > maxDimension) {
                    height *= maxDimension / width;
                    width = maxDimension;
                }
            } else {
                if (height > maxDimension) {
                    width *= maxDimension / height;
                    height = maxDimension;
                }
            }

            // Create canvas for resizing
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                console.error("Image optimization failed: Could not get canvas context.");
                resolve(dataUrl); // Fallback to original
                return;
            }

            // Draw and compress
            ctx.drawImage(img, 0, 0, width, height);

            // Use JPEG for better compression of photographs/screenshots
            const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.8);

            console.log(`[Image Optimizer] Resized: ${img.width}x${img.height} -> ${Math.round(width)}x${Math.round(height)}`);
            resolve(optimizedDataUrl);
        };

        img.onerror = (err) => {
            console.error("Image optimization failed: Error loading image.", err);
            resolve(dataUrl); // Fallback to original on error
        };

        img.src = dataUrl;
    });
};
