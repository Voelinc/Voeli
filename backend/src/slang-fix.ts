/**
 * Minimal slang fix for "nói mọn man"
 * Rewrites it to standard Vietnamese before sending to OpenAI
 */

export function rewriteSlang(text: string): { rewritten: string; wasChanged: boolean } {
  // Fix: "nói mọn man" → "nói liên tục"
  const pattern = /\b(nói|kêu|bảo)\s+mọn\s+man\b/gi;
  const rewritten = text.replace(pattern, '$1 liên tục');

  const wasChanged = rewritten !== text;

  if (wasChanged) {
    console.log('[SLANG FIX] Rewrote:', { original: text, rewritten });
  }

  return { rewritten, wasChanged };
}
