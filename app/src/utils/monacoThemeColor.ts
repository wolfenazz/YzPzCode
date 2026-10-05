const HEX_COLOR = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i;
const byteHex = (value: number): string => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');

/** Monaco theme colors must be hex, even when the app uses translucent CSS colors. */
export function toMonacoThemeColor(value: string, fallback: string): string {
  const color = value.trim();
  const safeFallback = HEX_COLOR.test(fallback) ? fallback : '#262626';
  if (HEX_COLOR.test(color)) return color;
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(color);
  if (rgb) {
    const channels = rgb[1].trim().split(/[\s,/]+/);
    if (channels.length === 3 || channels.length === 4) {
      const values = channels.slice(0, 3).map((channel) => Number.parseFloat(channel) * (channel.endsWith('%') ? 2.55 : 1));
      const alpha = channels[3] ? Number.parseFloat(channels[3]) * (channels[3].endsWith('%') ? 2.55 : 255) : 255;
      if ([...values, alpha].every(Number.isFinite)) return `#${values.map(byteHex).join('')}${channels.length === 4 ? byteHex(alpha) : ''}`;
    }
  }
  // Let the browser resolve named, HSL, and CSS Color 4 values into sRGB bytes.
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = safeFallback;
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const rgba = Array.from(context.getImageData(0, 0, 1, 1).data);
      return `#${rgba.map(byteHex).join('')}`;
    }
  }
  return safeFallback;
}
