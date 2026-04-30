import { useEffect, useMemo, useState } from 'react';
import mermaid from 'mermaid';
import { useTheme } from '@/hooks/useTheme';

/**
 * Base URL of an external mermaid → image rendering service. Configurable via
 * the `VITE_MERMAID_IMG_BASE` env variable so deployments can swap to a
 * self-hosted instance (e.g. kroki, or a private mermaid-ink mirror) without
 * code changes.
 *
 * The contract: GET `<base><base64-mermaid-source>` returns an image (PNG by
 * default). mermaid.ink, kroki and most clones honour this shape.
 *
 * Why a remote URL instead of a client-rendered data: URL?
 * Confluence Cloud / Jira Cloud strip `data:` image URLs from pasted HTML
 * (security policy), so diagrams rendered to base64 PNGs vanish on paste
 * even though they paste fine into Word / Outlook / Gmail. A normal HTTP(S)
 * image URL goes through Confluence's image-upload paste path and shows up
 * as an attached image, identical to any other web image you paste in.
 */
const MERMAID_IMG_BASE =
  (import.meta.env.VITE_MERMAID_IMG_BASE as string | undefined) ?? 'https://mermaid.ink/img/';

function initMermaid(theme: 'light' | 'dark') {
  mermaid.initialize({
    startOnLoad: false,
    theme: theme === 'dark' ? 'dark' : 'default',
    securityLevel: 'loose',
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    class: { htmlLabels: false },
  } as Parameters<typeof mermaid.initialize>[0]);
}

// Initial pre-mount config — keeps existing render path working before the
// hook runs. The component re-initializes whenever the theme changes.
initMermaid(
  typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
    ? 'dark'
    : 'light',
);

let mermaidCounter = 0;

interface MermaidDiagramProps {
  readonly chart: string;
}

/** UTF-8 → base64url, no padding. Compatible with mermaid.ink and kroki. */
function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Extract the *content* width / height of a rendered mermaid SVG. Mermaid
 * usually emits `width="100%"` plus a `viewBox` carrying the real pixel
 * dimensions — prefer the viewBox so we know the diagram's true size and
 * can ask mermaid.ink for a high-DPI render of it.
 */
function getSvgSize(svgString: string): { width: number; height: number } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svgEl = doc.documentElement as unknown as SVGSVGElement;

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

  return { width: vbW ?? attrW ?? 800, height: vbH ?? attrH ?? 600 };
}

/**
 * Choose `width` + `scale` for the remote PNG render. We aim for ~3× the
 * diagram's natural size (matches the old client-side canvas rasterizer)
 * to keep text crisp on big graphs, while capping the longest output side
 * around 3200px — beyond that the puppeteer worker on mermaid.ink starts
 * returning 503 (memory pressure).
 */
function pickRenderParams(naturalW: number, naturalH: number): {
  width: number;
  scale: number;
} {
  const desiredScale = 3;
  const minScale = 2;
  const maxLong = 3200;
  const width = Math.max(1, Math.round(naturalW));
  const longest = Math.max(naturalW, naturalH);
  const capped = Math.floor(maxLong / Math.max(1, longest));
  const scale = Math.max(minScale, Math.min(desiredScale, capped || minScale));
  return { width, scale };
}

/** Build the remote image URL for a given mermaid source + theme. */
function buildImageUrl(
  chart: string,
  theme: 'light' | 'dark',
  size: { width: number; height: number } | undefined,
  name: string,
): string {
  const encoded = toBase64Url(chart);
  const params = new URLSearchParams();
  // Force PNG output. mermaid.ink's `/img/` defaults to JPEG, which produces
  // visible compression artifacts on diagram text. PNG is lossless and
  // pastes into Confluence / Jira just as well.
  params.set('type', 'png');
  if (size) {
    const { width, scale } = pickRenderParams(size.width, size.height);
    params.set('width', String(width));
    params.set('scale', String(scale));
  }
  if (theme === 'dark') {
    params.set('theme', 'dark');
    params.set('bgColor', '1f2020');
  } else {
    params.set('bgColor', 'ffffff');
  }

  // Always emit an *absolute* URL. If the configured base is a same-origin
  // relative path (e.g. "/mermaid/img/" — our default in Docker, served by
  // the nginx reverse-proxy), prepend `window.location.origin`. Why: when
  // the user pastes the rendered HTML into Jira / Confluence, the target
  // app resolves relative URLs against *its own* origin (jira.company.com),
  // which 404s. An absolute URL points at *this* server every time.
  const isAbsolute = /^https?:\/\//i.test(MERMAID_IMG_BASE);
  const origin =
    !isAbsolute && typeof window !== 'undefined' ? window.location.origin : '';

  // When going through our own nginx proxy we append `/<name>.png` to the
  // URL path. Confluence / Jira and "Save image as…" both use the URL's
  // last path segment as the saved filename, so this is what makes pasted
  // diagrams arrive with a sensible name like `mermaid_diagram_<ts>_<hash>.png`
  // instead of an opaque base64 blob. nginx strips the suffix before
  // forwarding upstream — see nginx.conf. We can't do this for the public
  // mermaid.ink fallback because its router rejects trailing segments.
  const filenameSuffix = !isAbsolute ? `/${name}.png` : '';
  return `${origin}${MERMAID_IMG_BASE}${encoded}${filenameSuffix}?${params.toString()}`;
}

/** Make sure the SVG carries the xmlns so it renders inside dangerouslySetInnerHTML. */
function ensureSvgNamespaces(svgString: string): string {
  if (svgString.includes('xmlns="http://www.w3.org/2000/svg"')) return svgString;
  return svgString.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
}

/**
 * Validate the mermaid source locally before pointing an <img> at the remote
 * renderer. We do this so syntax errors surface inline (with the source) the
 * same way they did before, instead of as a generic "image failed to load".
 *
 * On success we keep the rendered SVG as an offline-friendly fallback in case
 * the remote service is unreachable (network blocked, service down, etc.).
 */
async function validateAndRender(
  chart: string,
  theme: 'light' | 'dark',
  id: string,
): Promise<string> {
  initMermaid(theme);
  const out = await mermaid.render(id, chart);
  return ensureSvgNamespaces(out.svg);
}

/** Short deterministic hash of a string (DJB2). Used for stable diagram alt
 *  text / filenames so the same chart copy-pasted twice gets the same name. */
function shortHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Human-friendly base name for downloads / Confluence-Jira paste attachments. */
function diagramName(chart: string): string {
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `mermaid_diagram_${ts}_${shortHash(chart)}`;
}

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [svgFallback, setSvgFallback] = useState<string | null>(null);
  const [remoteFailed, setRemoteFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { theme } = useTheme();
  // Stable per-chart name reused for the URL path suffix and the <img alt>
  // so downloads / pasted attachments / accessibility labels all match.
  const name = useMemo(() => diagramName(chart), [chart]);

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${++mermaidCounter}`;

    setImgUrl(null);
    setSvgFallback(null);
    setRemoteFailed(false);
    setError(null);

    (async () => {
      try {
        const svg = await validateAndRender(chart, theme, id);
        if (cancelled) return;
        setSvgFallback(svg);
        const size = getSvgSize(svg);
        setImgUrl(buildImageUrl(chart, theme, size, name));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to render diagram');
        document.getElementById(`d${id}`)?.remove();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart, theme, name]);

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

  // Remote image failed to load (offline, blocked, service down, …): fall back
  // to the locally-rendered SVG so the user still sees the diagram. The SVG
  // won't survive a paste into Confluence the same way, but viewing still works.
  if (remoteFailed && svgFallback) {
    return (
      <div
        className="my-4 flex justify-center overflow-x-auto [&_svg]:max-w-full"
        dangerouslySetInnerHTML={{ __html: svgFallback }}
      />
    );
  }

  if (!imgUrl) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
        Rendering diagram…
      </div>
    );
  }

  // Plain <img> with a real HTTP(S) URL. This is what Confluence / Jira Cloud
  // need to recognise the diagram on paste — they fetch the URL server-side
  // and store the result as a regular attached image, exactly like any other
  // web image you'd drop into the editor.
  return (
    <img
      src={imgUrl}
      alt={name}
      title={name}
      loading="lazy"
      onError={() => setRemoteFailed(true)}
      className="block mx-auto max-w-full h-auto my-4"
    />
  );
}
