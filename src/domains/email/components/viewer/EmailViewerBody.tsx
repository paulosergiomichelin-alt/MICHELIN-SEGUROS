import React, { useRef, useState, useEffect } from 'react';
import { sanitizeHtml, extractEmailContent } from '../../utils/htmlSanitize';

interface Props {
  bodyHtml?: string;
  bodyText?: string;
  snippet?: string;
  messageId?: string;
}

export const EmailViewerBody: React.FC<Props> = ({ bodyHtml, bodyText, snippet, messageId }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(300);

  useEffect(() => {
    if (!iframeRef.current || !bodyHtml) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        if (h > 0) setIframeHeight(h + 32);
      }
    });
    const iframe = iframeRef.current;
    const onLoad = () => {
      try {
        const doc = iframe.contentDocument;
        if (doc?.body) {
          observer.observe(doc.body);
          setIframeHeight(doc.body.scrollHeight + 32);
        }
      } catch {
        // cross-origin
      }
    };
    iframe.addEventListener('load', onLoad);
    return () => {
      iframe.removeEventListener('load', onLoad);
      observer.disconnect();
    };
  }, [messageId, bodyHtml]);

  if (bodyHtml) {
    const { styles, body } = extractEmailContent(sanitizeHtml(bodyHtml));
    const srcDoc = `<!DOCTYPE html><html><head>
<base target="_blank">
<meta charset="utf-8">
<style>
body{margin:0;padding:16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:rgba(255,255,255,0.75);background:transparent;font-size:14px;line-height:1.6;word-break:break-word;overflow-x:auto;}
a{color:#60a5fa;}
img{max-width:100%;height:auto;}
blockquote{border-left:3px solid rgba(255,255,255,0.15);margin:0;padding-left:12px;color:rgba(255,255,255,0.4);}
pre,code{background:rgba(255,255,255,0.05);border-radius:4px;padding:2px 6px;font-size:13px;}
table{max-width:100%;border-collapse:collapse;}
</style>
${styles ? `<style>${styles}</style>` : ''}
</head><body>${body}</body></html>`;

    return (
      <iframe
        ref={iframeRef}
        srcDoc={srcDoc}
        sandbox="allow-same-origin allow-popups"
        className="w-full border-0 bg-transparent"
        style={{ height: iframeHeight, minHeight: 200 }}
        title="Email body"
      />
    );
  }

  return (
    <pre className="text-white/70 text-sm leading-relaxed whitespace-pre-wrap font-sans">
      {bodyText || snippet || '(Mensagem sem conteúdo)'}
    </pre>
  );
};
