/* Nai: tiny safe Markdown renderer. HTML is escaped first, then Markdown is
   expanded, so model output can't inject markup. Supports: fenced code,
   headings, blockquotes, lists, pipe tables, links (http/https only),
   bold/italic/inline code. */

function naiMarkdown(src) {
  const esc = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const inline = (s) =>
    esc(s)
      .replace(/`([^`]+)`/g, (m, c) => '<code>' + c + '</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
      );

  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  const isBlockStart = (l) =>
    /^(```|#{1,4}\s|>\s?|\s*[-*]\s+|\s*\d+[.)]\s+)/.test(l);

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;

    if ((m = line.match(/^```(\w*)\s*$/))) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>');
      continue;
    }

    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      const level = m[1].length;
      out.push('<h' + level + '>' + inline(m[2]) + '</h' + level + '>');
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push('<blockquote>' + buf.map(inline).join('<br>') + '</blockquote>');
      continue;
    }

    // Pipe table: header row, then a |---| separator row.
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) &&
      lines[i + 1].includes('-')
    ) {
      const cells = (r) =>
        r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => inline(c.trim()));
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      out.push(
        '<table><thead><tr>' + head.map((c) => '<th>' + c + '</th>').join('') +
        '</tr></thead><tbody>' +
        rows.map((r) => '<tr>' + r.map((c) => '<td>' + c + '</td>').join('') + '</tr>').join('') +
        '</tbody></table>'
      );
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]))
        items.push(lines[i++].replace(/^\s*[-*]\s+/, ''));
      out.push('<ul>' + items.map((x) => '<li>' + inline(x) + '</li>').join('') + '</ul>');
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i]))
        items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ''));
      out.push('<ol>' + items.map((x) => '<li>' + inline(x) + '</li>').join('') + '</ol>');
      continue;
    }

    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) buf.push(lines[i++]);
    out.push('<p>' + buf.map(inline).join('<br>') + '</p>');
  }

  return out.join('');
}
