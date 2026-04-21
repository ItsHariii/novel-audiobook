const MAX_CHUNK_CHARS = 1500;

export function chunkParagraphs(paragraphs: string[], maxChars = MAX_CHUNK_CHARS): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const raw of paragraphs) {
    const para = raw.trim();
    if (!para) continue;

    if (para.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (const piece of splitLongParagraph(para, maxChars)) {
        chunks.push(piece);
      }
      continue;
    }

    if (!current) {
      current = para;
    } else if (current.length + para.length + 2 <= maxChars) {
      current += "\n\n" + para;
    } else {
      chunks.push(current);
      current = para;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function splitLongParagraph(para: string, maxChars: number): string[] {
  const sentences = para.match(/[^.!?]+[.!?]+["')\]]?\s*|[^.!?]+$/g) ?? [para];
  const out: string[] = [];
  let current = "";

  for (const s of sentences) {
    const sentence = s.trim();
    if (!sentence) continue;

    if (sentence.length > maxChars) {
      if (current) {
        out.push(current);
        current = "";
      }
      for (let i = 0; i < sentence.length; i += maxChars) {
        out.push(sentence.slice(i, i + maxChars));
      }
      continue;
    }

    if (!current) {
      current = sentence;
    } else if (current.length + sentence.length + 1 <= maxChars) {
      current += " " + sentence;
    } else {
      out.push(current);
      current = sentence;
    }
  }

  if (current) out.push(current);
  return out;
}
