export const TRANSPARENT_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\s+on\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+on\w+\s*=\s*'[^']*'/gi, '')
    .replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"')
    .replace(/href\s*=\s*'javascript:[^']*'/gi, "href='#'")
    .replace(/src\s*=\s*["']cid:[^"']*["']/gi, `src="${TRANSPARENT_GIF}"`);
}

export function extractEmailContent(html: string): { styles: string; body: string } {
  const styleBlocks: string[] = [];
  const noStyles = html.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_, content) => {
    styleBlocks.push(content);
    return '';
  });
  const bodyMatch = noStyles.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const body = bodyMatch
    ? bodyMatch[1]
    : noStyles.replace(/<(?:\/?html|\/?head|meta|link|\/?title)[^>]*>/gi, '').trim();
  return { styles: styleBlocks.join('\n'), body };
}
