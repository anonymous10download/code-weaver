import { useEffect, useState } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  // Disable HTML labels so mermaid emits pure SVG (<text>) instead of
  // <foreignObject>, which taints the canvas and breaks PNG export.
  htmlLabels: false,
  flowchart: { htmlLabels: false },
  class: { htmlLabels: false },
} as Parameters<typeof mermaid.initialize>[0]);

let mermaidCounter = 0;

interface MermaidDiagramProps {
  readonly chart: string;
}

interface RasterResult {
  url: string;
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Extract the *content* width / height of a rendered mermaid SVG. Mermaid
 * usually emits `width="100%"` plus a `viewBox` carrying the real pixel
 * dimensions — we must prefer the viewBox in that case, otherwise the canvas
 * gets sized to 100×something and the PNG looks tiny / blurry.
 */
function getSvgSize(svgString: string): { width: number; height: number } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svgEl = doc.documentElement as unknown as SVGSVGElement;

  // Only accept plain numbers or px values — reject %, em, etc.
  const parsePxLen = (v: string | null): number | null => {
    if (!v) return null;
    const trimmed = v.trim();
    if (!/^-?\d*\.?\d+(px)?$/i.test(trimmed)) return null;
    const n = Number.parseFloat(trimmed);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  let vbW: number | null = null;
  let vbH: number | null = null;
  const vb = svgEl.getAttribute('viewBox');
  if (vb) {
    const parts = vb.split(/[\s,]+/).map((s) => Number.parseFloat(s));
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      vbW = parts[2];
      vbH = parts[3];
    }
  }

  const attrW = parsePxLen(svgEl.getAttribute('width'));
  const attrH = parsePxLen(svgEl.getAttribute('height'));

  // Prefer viewBox dimensions (mermaid's true content size), fall back to
  // px attributes, then to a sane default.
  const width = vbW ?? attrW ?? 800;
  const height = vbH ?? attrH ?? 600;
  return { width, height };
}

/** Make sure the SVG carries the xmlns so it can load inside <img>. */
function ensureSvgNamespaces(svgString: string): string {
  if (svgString.includes('xmlns="http://www.w3.org/2000/svg"')) return svgString;
  return svgString.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
}

/**
 * Force explicit pixel `width` / `height` attributes on the root <svg> so
 * the browser rasterizes it at the diagram's real size instead of falling
 * back to 300×150 (the default for percentage-sized SVGs loaded into <img>).
 */
function withExplicitSize(svgString: string, width: number, height: number): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svgEl = doc.documentElement as unknown as SVGSVGElement;
  if (!svgEl.getAttribute('xmlns')) {
    svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
  svgEl.setAttribute('width', String(width));
  svgEl.setAttribute('height', String(height));
  // Drop any inline max-width:100% style that would constrain rasterization.
  const style = svgEl.getAttribute('style');
  if (style) {
    const cleaned = style
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s && !/^max-width\s*:/i.test(s))
      .join('; ');
    if (cleaned) svgEl.setAttribute('style', cleaned);
    else svgEl.removeAttribute('style');
  }
  return new XMLSerializer().serializeToString(svgEl);
}

/**
 * Pick an output scale similar to mermaid.live's "auto" PNG export: aim for
 * ~3× the natural size, but cap the longest side at ~8000px to avoid huge
 * files / browser memory issues, and ensure a minimum 2× for sharpness.
 */
function pickExportScale(width: number, height: number): number {
  const longest = Math.max(width, height);
  const desired = 3;
  const maxLong = 8000;
  const minScale = 2;
  const capped = Math.min(desired, maxLong / longest);
  return Math.max(minScale, Math.min(desired, capped));
}

async function rasterizeSvgToPng(svgString: string): Promise<RasterResult> {
  const { width, height } = getSvgSize(svgString);
  const scale = pickExportScale(width, height);
  const outW = Math.max(1, Math.round(width * scale));
  const outH = Math.max(1, Math.round(height * scale));

  const sized = withExplicitSize(ensureSvgNamespaces(svgString), width, height);
  const svgBlob = new Blob([sized], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    img.decoding = 'async';

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load SVG into image element'));
      img.src = svgUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    // High quality scaling.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, outW, outH);

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob returned null'))),
        'image/png',
      );
    });

    return { url: URL.createObjectURL(blob), blob, width: outW, height: outH };
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const [png, setPng] = useState<RasterResult | null>(null);
  const [svgFallback, setSvgFallback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    const id = `mermaid-${++mermaidCounter}`;

    (async () => {
      let rendered = '';
      try {
        const out = await mermaid.render(id, chart);
        rendered = out.svg;
        if (cancelled) return;
        const raster = await rasterizeSvgToPng(rendered);
        if (cancelled) {
          URL.revokeObjectURL(raster.url);
          return;
        }
        createdUrl = raster.url;
        setPng(raster);
        setSvgFallback(null);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        // If we already have an SVG but rasterization failed (e.g. tainted
        // canvas from <foreignObject>), keep showing the SVG so the user
        // still gets a usable diagram.
        if (rendered) {
          console.warn('Mermaid PNG rasterization failed, falling back to SVG.', err);
          setSvgFallback(ensureSvgNamespaces(rendered));
          setPng(null);
          setError(null);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to render diagram');
          setPng(null);
          setSvgFallback(null);
        }
        document.getElementById(`d${id}`)?.remove();
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [chart]);

  const handleCopy = async () => {
    if (!png) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png.blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Copy PNG failed', err);
      setCopied(false);
    }
  };

  const handleDownload = () => {
    if (!png) return;
    const a = document.createElement('a');
    a.href = png.url;
    a.download = 'diagram.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 my-4">
        <p className="text-sm font-semibold text-destructive mb-1">Mermaid diagram error</p>
        <pre className="text-xs text-muted-foreground whitespace-pre-wrap">{error}</pre>
        <details className="mt-2">
          <summary className="text-xs text-muted-foreground cursor-pointer">Show source</summary>
          <pre className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">{chart}</pre>
        </details>
      </div>
    );
  }

  if (!png) {
    if (svgFallback) {
      return (
        <div
          className="my-4 flex justify-center overflow-x-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svgFallback }}
        />
      );
    }
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
        Rendering diagram…
      </div>
    );
  }

  return (
    <div className="my-4 group relative flex flex-col items-center">
      <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md border border-border bg-background/80 backdrop-blur px-2 py-1 text-xs text-foreground hover:bg-background"
          aria-label="Copy diagram as PNG"
        >
          {copied ? 'Copied!' : 'Copy PNG'}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="rounded-md border border-border bg-background/80 backdrop-blur px-2 py-1 text-xs text-foreground hover:bg-background"
          aria-label="Download diagram as PNG"
        >
          Download
        </button>
      </div>
      <img
        src={png.url}
        alt="Mermaid diagram"
        width={png.width}
        height={png.height}
        className="max-w-full h-auto"
        draggable
      />
    </div>
  );
}
