/** Strip markdown syntax so PDFs never show raw ###, **, or backticks. */
export function stripMarkdownSyntax(line: string): string {
  let out = line.trimEnd();

  const heading = out.match(/^#{1,6}\s+(.*)$/);
  if (heading) {
    out = heading[1].trim();
  }

  out = out.replace(/^[-*+]\s+/, '');

  out = out.replace(/\*\*(.*?)\*\*/g, '$1');
  out = out.replace(/\*(.*?)\*/g, '$1');
  out = out.replace(/__(.*?)__/g, '$1');
  out = out.replace(/_(.*?)_/g, '$1');
  out = out.replace(/`([^`]+)`/g, '$1');
  out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  return out.trim();
}

export function normalizeCvContent(content: string): string {
  const lines = content.split(/\r?\n/).map(stripMarkdownSyntax);
  const cleaned: string[] = [];

  for (const line of lines) {
    const prev = cleaned[cleaned.length - 1];
    if (!line && !prev) continue;
    cleaned.push(line);
  }

  return cleaned.join('\n').trim();
}

export function detectMarkdownArtifacts(content: string): string[] {
  const issues: string[] = [];
  const patterns: Array<[RegExp, string]> = [
    [/^#{1,6}\s/m, 'Markdown heading symbols (#)'],
    [/\*\*[^*]+\*\*/, 'Bold markdown (**)'],
    [/`[^`]+`/, 'Inline code backticks'],
    [/\[[^\]]+\]\([^)]+\)/, 'Markdown links'],
  ];

  for (const [re, label] of patterns) {
    if (re.test(content)) issues.push(label);
  }

  return issues;
}

export function isSectionHeader(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 48) return false;
  if (/^[•\-*]/.test(t)) return false;
  if (t.includes('|') && t.split('|').length > 2) return false;
  return t === t.toUpperCase() && /[A-Z]/.test(t) && !/^\d/.test(t);
}

export function isBulletLine(line: string): boolean {
  const t = line.trim();
  return (
    t.startsWith('• ') ||
    t.startsWith('- ') ||
    t.startsWith('* ') ||
    /^\d+\.\s/.test(t)
  );
}

export function toBulletText(line: string): string {
  const t = stripMarkdownSyntax(line);
  return t.replace(/^(?:•|-|\*|\d+\.)\s*/, '').trim();
}
