/**
 * Markdown → Google Docs renderer (headings, lists, tables, images, inline styles).
 * Used by appendMarkdown / appendTable / appendImage actions.
 */

function appendMarkdown_(doc, req) {
  var markdown = req.markdown || req.text || req.content;
  requireDoc_(markdown, 'markdown');
  if (req.clear === true) {
    clearDocumentBodyViaDocsApi_(doc.getId(), req.tabId ? String(req.tabId) : null);
  }
  var body = resolveMarkdownBody_(doc, req);
  return renderMarkdownIntoBody_(body, String(markdown), req);
}

function appendTable_(doc, req) {
  var rows = req.rows || req.data;
  if (!rows || !rows.length) {
    throw new Error('appendTable needs rows (2D array of strings)');
  }
  var body = resolveMarkdownBody_(doc, req);
  var table = body.appendTable(normalizeTableRows_(rows));
  styleTable_(table, req.headerRow !== false);
  return {
    rows: table.getNumRows(),
    columns: table.getRow(0).getNumCells(),
  };
}

function appendImage_(doc, req) {
  var blob = fetchImageBlob_(req);
  var body = resolveMarkdownBody_(doc, req);
  var paragraph = body.appendParagraph('');
  var image = paragraph.appendInlineImage(blob);
  applyImageSize_(image, req);
  if (req.alt) {
    var caption = body.appendParagraph(String(req.alt));
    caption.editAsText().setItalic(true).setForegroundColor('#6b7280');
  }
  return {
    inserted: true,
    alt: req.alt || '',
    width: image.getWidth(),
    height: image.getHeight(),
  };
}

function renderMarkdownIntoBody_(body, markdown, req) {
  var blocks = parseMarkdownBlocks_(markdown);
  var stats = {
    blocks: blocks.length,
    paragraphs: 0,
    headings: 0,
    lists: 0,
    tables: 0,
    images: 0,
    codeBlocks: 0,
  };

  blocks.forEach(function (block) {
    switch (block.type) {
      case 'heading':
        stats.headings++;
        appendHeadingBlock_(body, block);
        break;
      case 'paragraph':
        stats.paragraphs++;
        appendParagraphBlock_(body, block.text);
        break;
      case 'blockquote':
        stats.paragraphs++;
        appendBlockquote_(body, block.text);
        break;
      case 'list':
        stats.lists++;
        appendListBlock_(body, block.lines);
        break;
      case 'table':
        stats.tables++;
        appendMarkdownTable_(body, block.lines, req);
        break;
      case 'code':
        stats.codeBlocks++;
        appendCodeBlock_(body, block.text);
        break;
      case 'hr':
        body.appendHorizontalRule();
        break;
      case 'image':
        stats.images++;
        appendMarkdownImage_(body, block);
        break;
      default:
        break;
    }
  });

  return stats;
}

function parseMarkdownBlocks_(markdown) {
  var lines = String(markdown).replace(/\r\n/g, '\n').split('\n');
  var blocks = [];
  var i = 0;

  while (i < lines.length) {
    var line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    if (line.match(/^```/)) {
      var fence = line;
      i++;
      var codeLines = [];
      while (i < lines.length && !lines[i].match(/^```/)) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({ type: 'code', text: codeLines.join('\n') });
      continue;
    }

    if (line.match(/^\|.*\|/)) {
      var tableLines = [];
      while (i < lines.length && lines[i].match(/^\|.*\|/)) {
        tableLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'table', lines: tableLines });
      continue;
    }

    var headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      i++;
      continue;
    }

    if (line.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    if (line.match(/^>\s?/)) {
      var quoteLines = [];
      while (i < lines.length && lines[i].match(/^>\s?/)) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'blockquote', text: quoteLines.join('\n') });
      continue;
    }

    var imageMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (imageMatch) {
      blocks.push({ type: 'image', alt: imageMatch[1], url: imageMatch[2] });
      i++;
      continue;
    }

    if (line.match(/^(\s*[-*+]\s|\d+\.\s)/)) {
      var listLines = [];
      while (i < lines.length && lines[i].match(/^(\s*[-*+]\s|\d+\.\s)/)) {
        listLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'list', lines: listLines });
      continue;
    }

    var paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].match(/^```/) &&
      !lines[i].match(/^\|.*\|/) &&
      !lines[i].match(/^#{1,6}\s/) &&
      !lines[i].match(/^(-{3,}|\*{3,}|_{3,})$/) &&
      !lines[i].match(/^>\s?/) &&
      !lines[i].match(/^!\[[^\]]*\]\([^)]+\)\s*$/) &&
      !lines[i].match(/^(\s*[-*+]\s|\d+\.\s)/)
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length) {
      blocks.push({ type: 'paragraph', text: paraLines.join('\n') });
    }
  }

  return blocks;
}

function appendHeadingBlock_(body, block) {
  var level = Math.min(Math.max(block.level, 1), 6);
  var headingKey = 'H' + level;
  var paragraph = body.appendParagraph('');
  applyInlineMarkdown_(paragraph.editAsText(), block.text);
  paragraph.setHeading(parseHeading_(headingKey));
}

function appendParagraphBlock_(body, text) {
  var paragraph = body.appendParagraph('');
  applyInlineMarkdown_(paragraph.editAsText(), text);
}

function appendBlockquote_(body, text) {
  var paragraph = body.appendParagraph('');
  applyInlineMarkdown_(paragraph.editAsText(), text);
  paragraph.setIndentStart(36);
  paragraph.setIndentFirstLine(36);
  var len = String(text || '').length;
  if (len > 0) {
    paragraph.editAsText().setForegroundColor(0, len - 1, '#4b5563');
  }
}

function appendListBlock_(body, lines) {
  lines.forEach(function (line) {
    var numbered = line.match(/^\d+\.\s+(.*)$/);
    var bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    var text = numbered ? numbered[1] : (bullet ? bullet[1] : line);
    var item = body.appendListItem('');
    applyInlineMarkdown_(item.editAsText(), text);
    item.setGlyphType(numbered ? DocumentApp.GlyphType.NUMBER : DocumentApp.GlyphType.BULLET);
  });
}

function appendCodeBlock_(body, code) {
  var paragraph = body.appendParagraph(String(code || ''));
  paragraph.setSpacingBefore(6);
  paragraph.setSpacingAfter(6);
  var textEl = paragraph.editAsText();
  var len = String(code || '').length;
  if (len > 0) {
    textEl.setFontFamily(0, len - 1, 'Courier New');
    textEl.setBackgroundColor(0, len - 1, '#f3f4f6');
    textEl.setForegroundColor(0, len - 1, '#111827');
  }
}

function appendMarkdownTable_(body, lines, req) {
  var rawRows = parseMarkdownTableRows_(lines);
  if (!rawRows.length) return;
  var plainRows = rawRows.map(function (row) {
    return row.map(function (cell) { return parseInlineMarkdown_(cell).plain; });
  });
  var table = body.appendTable(plainRows);
  for (var r = 0; r < rawRows.length; r++) {
    for (var c = 0; c < rawRows[r].length; c++) {
      applyInlineMarkdown_(table.getCell(r, c).editAsText(), rawRows[r][c]);
    }
  }
  styleTable_(table, req.tableHeaderRow !== false);
}

function appendMarkdownImage_(body, block) {
  var blob = fetchImageBlob_({ url: block.url, driveFileId: block.driveFileId });
  var paragraph = body.appendParagraph('');
  var image = paragraph.appendInlineImage(blob);
  applyImageSize_(image, block);
  if (block.alt) {
    var caption = body.appendParagraph(String(block.alt));
    caption.editAsText().setItalic(true).setForegroundColor('#6b7280');
  }
}

function parseMarkdownTableRows_(lines) {
  var rows = [];
  lines.forEach(function (line) {
    if (line.match(/^\|[\s\-:|]+\|$/)) return;
    var cells = line.split('|');
    if (cells.length && cells[0].trim() === '') cells.shift();
    if (cells.length && cells[cells.length - 1].trim() === '') cells.pop();
    cells = cells.map(function (c) { return c.trim(); });
    if (cells.length) rows.push(cells);
  });
  return normalizeTableRows_(rows);
}

function normalizeTableRows_(rows) {
  var maxCols = 0;
  rows.forEach(function (row) {
    if (row.length > maxCols) maxCols = row.length;
  });
  return rows.map(function (row) {
    var copy = row.slice();
    while (copy.length < maxCols) copy.push('');
    return copy;
  });
}

function styleTable_(table, headerRow) {
  table.setBorderWidth(1);
  if (headerRow && table.getNumRows() > 0) {
    var headerCells = table.getRow(0).getNumCells();
    for (var c = 0; c < headerCells; c++) {
      var cell = table.getCell(0, c);
      cell.editAsText().setBold(true);
      cell.setBackgroundColor('#f8fafc');
    }
  }
}

function applyInlineMarkdown_(textEl, source) {
  var parsed = parseInlineMarkdown_(String(source || ''));
  if (!parsed.plain) {
    textEl.setText('');
    return;
  }
  textEl.setText(parsed.plain);
  var len = parsed.plain.length;
  parsed.marks.forEach(function (mark) {
    if (mark.end < mark.start || mark.start < 0) return;
    var start = Math.max(0, Math.min(mark.start, len - 1));
    var end = Math.max(start, Math.min(mark.end, len - 1));
    if (len === 0) return;
    if (mark.bold) textEl.setBold(start, end, true);
    if (mark.italic) textEl.setItalic(start, end, true);
    if (mark.code) {
      textEl.setFontFamily(start, end, 'Courier New');
      textEl.setBackgroundColor(start, end, '#f3f4f6');
    }
    if (mark.link) textEl.setLinkUrl(start, end, mark.link);
  });
}

function parseInlineMarkdown_(source) {
  var tokens = tokenizeInlineMarkdown_(source);
  var plain = '';
  var marks = [];

  tokens.forEach(function (token) {
    if (token.type === 'text') {
      plain += token.value;
      return;
    }
    var start = plain.length;
    plain += token.value;
    var end = plain.length - 1;
    marks.push({
      start: start,
      end: end,
      bold: token.type === 'bold',
      italic: token.type === 'italic',
      code: token.type === 'code',
      link: token.type === 'link' ? token.url : null,
    });
  });

  return { plain: plain, marks: marks };
}

function tokenizeInlineMarkdown_(source) {
  var tokens = [];
  var i = 0;

  while (i < source.length) {
    var rest = source.slice(i);
    var match;

    match = rest.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (match) {
      tokens.push({ type: 'link', value: match[1], url: match[2] });
      i += match[0].length;
      continue;
    }

    match = rest.match(/^(\*\*|__)([\s\S]+?)\1/);
    if (match) {
      tokens.push({ type: 'bold', value: match[2] });
      i += match[0].length;
      continue;
    }

    match = rest.match(/^(\*|_)([\s\S]+?)\1/);
    if (match) {
      tokens.push({ type: 'italic', value: match[2] });
      i += match[0].length;
      continue;
    }

    match = rest.match(/^`([^`]+)`/);
    if (match) {
      tokens.push({ type: 'code', value: match[1] });
      i += match[0].length;
      continue;
    }

    tokens.push({ type: 'text', value: rest.charAt(0) });
    i += 1;
  }

  return tokens;
}

function fetchImageBlob_(req) {
  if (req.driveFileId) {
    return DriveApp.getFileById(String(req.driveFileId)).getBlob();
  }
  if (req.driveUrl) {
    var idMatch = String(req.driveUrl).match(/[-\w]{25,}/);
    if (idMatch) return DriveApp.getFileById(idMatch[0]).getBlob();
  }
  var url = req.url || req.imageUrl;
  requireDoc_(url, 'url or driveFileId');
  var response = UrlFetchApp.fetch(String(url), { muteHttpExceptions: true, followRedirects: true });
  if (response.getResponseCode() >= 400) {
    throw new Error('Could not fetch image URL (' + response.getResponseCode() + '): ' + url);
  }
  return response.getBlob();
}

function applyImageSize_(image, req) {
  if (req.width != null) {
    image.setWidth(Number(req.width));
  }
  if (req.height != null) {
    image.setHeight(Number(req.height));
  }
  if (req.maxWidth != null && image.getWidth() > Number(req.maxWidth)) {
    var ratio = Number(req.maxWidth) / image.getWidth();
    image.setWidth(Number(req.maxWidth));
    image.setHeight(Math.round(image.getHeight() * ratio));
  }
}
