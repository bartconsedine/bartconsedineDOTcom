// A lossless partition of the original text. Measurement is supplied by the rendered font/pane.
export function textPages(text, fits) {
  if (!text) return [''];
  const pages = []; let start = 0;
  while (start < text.length) {
    let lo = 1, hi = text.length - start, count = 1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (fits(text.slice(start, start + mid))) { count = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    if (start + count < text.length) {
      const chunk = text.slice(start, start + count), boundary = chunk.search(/\s+\S*$/);
      if (boundary > count / 2) count = boundary + 1;
      // Never split a UTF-16 surrogate pair between pages.
      if (/[\uD800-\uDBFF]/.test(text[start + count - 1]) && count > 1) count--;
    }
    pages.push(text.slice(start, start + count)); start += count;
  }
  return pages;
}
