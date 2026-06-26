// Simple PNG logo generator for Harly emails
// This creates a minimal PNG logo that works in all email clients

export const HARLY_LOGO_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAXgAAAAtCAYAAACvWBoRAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAALEwAACxMBAJqcGAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAHFSURBVHic7dI9S8NAFMbxnyZqU0QURXbhLbi5iIPgIbgKCu4u4uLiIrgI/gdOFxcRcXAREZGiqJMGUzRp0vfi4ZKmbdImTdI06fcB4b67+d29y+USQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGE/AbyB1qCjFfMnGgFAAAAAElFTkSuQmCC";

// SVG logo that works in most email clients (not Gmail)
export const HARLY_LOGO_SVG = `<svg width="120" height="36" viewBox="0 0 120 36" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="36" height="36" rx="8" fill="#1c1917"/>
  <text x="18" y="24" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="700" fill="white" text-anchor="middle">H</text>
  <text x="72" y="24" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="600" fill="#1c1917" text-anchor="middle">harly</text>
</svg>`;

// Helper to get the appropriate logo based on email client
export function getHarlyLogoUrl(baseUrl?: string): string {
  // If baseUrl is provided, use hosted PNG
  if (baseUrl) {
    return `${baseUrl}/emails/harly-logo.png`;
  }
  
  // Fallback to inline SVG data URI (works in most clients except Gmail)
  const svgBase64 = Buffer.from(HARLY_LOGO_SVG).toString('base64');
  return `data:image/svg+xml;base64,${svgBase64}`;
}
