/**
 * Utility functions for cleaning pasted markdown artifacts, AI formatting,
 * and normalizing text for Persian and English study notes.
 */

/**
 * Removes markdown formatting artifacts (e.g. bold **, headers ###, lists *, code blocks, etc.)
 * so pasted AI responses or copied formatted text become clean, readable plain text.
 */
export function cleanPastedMarkdown(text: string): string {
  if (!text) return '';

  let cleaned = text;

  // Remove code blocks ```lang ... ``` or ```
  cleaned = cleaned.replace(/```[\s\S]*?```/g, (match) => {
    // Keep internal code content without the backticks
    return match.replace(/```[a-zA-Z0-9_-]*\n?/g, '').replace(/```/g, '');
  });

  // Remove inline backticks `code`
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

  // Remove markdown headers (# Title, ## Subtitle, etc.)
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');

  // Remove bold and italic markers: ***text***, **text**, *text*, ___text___, __text__, _text_
  cleaned = cleaned.replace(/(\*\*|__)(.*?)\1/g, '$2');
  cleaned = cleaned.replace(/(\*|_)(.*?)\1/g, '$2');

  // Remove strikethrough ~~text~~
  cleaned = cleaned.replace(/~~(.*?)~~/g, '$1');

  // Remove markdown links [text](url) -> text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Remove markdown images ![alt](url) -> alt or empty
  cleaned = cleaned.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');

  // Normalize markdown unordered list bullets (* item, - item, + item)
  cleaned = cleaned.replace(/^[\s]*[-*+]\s+/gm, '• ');

  // Remove blockquotes (> quote)
  cleaned = cleaned.replace(/^>\s?/gm, '');

  // Normalize multiple consecutive blank lines to at most two
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

/**
 * Checks if the given text has obvious markdown syntax artifacts.
 */
export function hasMarkdownArtifacts(text: string): boolean {
  if (!text) return false;
  const markdownPatterns = [
    /^#{1,6}\s+/m,
    /\*\*[^*]+\*\*/,
    /`[^`]+`/,
    /```[\s\S]*?```/,
    /\[[^\]]+\]\([^)]+\)/,
    /^>\s+/m,
    /^[\s]*[-*+]\s+/m,
  ];

  return markdownPatterns.some((pattern) => pattern.test(text));
}
