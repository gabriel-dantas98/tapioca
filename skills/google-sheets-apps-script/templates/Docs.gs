/**
 * Google Docs actions for Workspace Agent API.
 * Requires documentId in payload (or container-bound doc on deploy).
 */

function isDocRequest_(req) {
  var action = req.action || '';
  if (isSheetAction_(action)) return false;
  if (action === 'batch') {
    var ops = req.ops || [];
    if (!ops.length) return false;
    return ops.some(function (op) {
      return isDocAction_(op.action || '');
    });
  }
  if (isDocAction_(action)) return true;
  return !!req.documentId && !req.spreadsheetId;
}

function isSheetAction_(action) {
  return action === 'read' || action === 'create' || action === 'update'
    || action === 'delete' || action === 'style' || action === 'comment'
    || action === 'listSheets' || action === 'createSheet' || action === 'renameSheet'
    || action === 'deleteSheet' || action === 'tabColor';
}

function isDocAction_(action) {
  if (/^doc[A-Z]/.test(action)) return true;
  return action === 'readDoc' || action === 'appendDoc' || action === 'insertDoc'
    || action === 'replaceDoc' || action === 'styleDoc' || action === 'deleteDoc'
    || action === 'commentDoc' || action === 'listDoc' || action === 'appendMarkdown'
    || action === 'renderMarkdown' || action === 'appendTable' || action === 'appendImage'
    || action === 'readDocComments' || action === 'listDocComments'
    || action === 'replyDocComment' || action === 'resolveDocComment'
    || action === 'uploadAndAppendImage'
    || action === 'listDocTabs' || action === 'listDocTab'
    || action === 'createDocTab' || action === 'renameDocTab';
}

function resolveDocContext_(req) {
  var doc = openDocument_(req.documentId);
  return {
    documentId: doc.getId(),
    doc: doc,
    commentPrefix: req.commentPrefix || 'claude: ',
  };
}

function runDocApi_(req) {
  if (req.action === 'batch') {
    return (req.ops || []).map(function (op) {
      var ctx = resolveDocContext_(Object.assign({}, req, op));
      return { success: true, action: op.action, data: dispatchDoc_(ctx, op) };
    });
  }
  return dispatchDoc_(resolveDocContext_(req), req);
}

function openDocument_(documentId) {
  if (documentId) return DocumentApp.openById(documentId);
  return DocumentApp.getActiveDocument();
}

function dispatchDoc_(ctx, req) {
  var doc = ctx.doc;
  switch (req.action) {
    case 'readDoc':
    case 'docRead':
      return readDoc_(doc, req);
    case 'listDoc':
    case 'docList':
      return listDoc_(doc, req);
    case 'appendDoc':
    case 'docAppend':
      return appendDoc_(doc, req);
    case 'insertDoc':
    case 'docInsert':
      return insertDoc_(doc, req);
    case 'replaceDoc':
    case 'docReplace':
      return replaceDoc_(doc, req);
    case 'styleDoc':
    case 'docStyle':
      return styleDoc_(doc, req);
    case 'deleteDoc':
    case 'docDelete':
      return deleteDoc_(doc, req);
    case 'commentDoc':
    case 'docComment':
      return commentDoc_(doc, req, ctx.commentPrefix);
    case 'appendMarkdown':
    case 'renderMarkdown':
      return appendMarkdown_(doc, req);
    case 'appendTable':
      return appendTable_(doc, req);
    case 'appendImage':
      return appendImage_(doc, req);
    case 'uploadAndAppendImage':
      return uploadAndAppendImage_(doc, req);
    case 'listDocTabs':
    case 'listDocTab':
      return listDocTabs_(doc);
    case 'createDocTab':
      return createDocTab_(doc, req);
    case 'renameDocTab':
      return renameDocTab_(doc, req);
    case 'readDocComments':
    case 'listDocComments':
      return readDocComments_(doc, req);
    case 'replyDocComment':
    case 'docReplyComment':
      return replyDocComment_(doc, req);
    case 'resolveDocComment':
    case 'docResolveComment':
      return resolveDocComment_(doc, req);
    default:
      throw new Error('Unknown doc action: ' + req.action);
  }
}

function paragraphBounds_(body, paragraphIndex) {
  var paragraphs = body.getParagraphs();
  if (paragraphIndex < 0 || paragraphIndex >= paragraphs.length) {
    throw new Error('paragraph index out of range: ' + paragraphIndex);
  }
  var start = 1;
  for (var i = 0; i < paragraphIndex; i++) {
    start += paragraphs[i].getText().length + 1;
  }
  var text = paragraphs[paragraphIndex].getText();
  return { startIndex: start, endIndex: start + text.length };
}

function readDoc_(doc, req) {
  var body = resolveMarkdownBody_(doc, req);
  var text = body.getText();
  var result = {
    title: doc.getName(),
    documentId: doc.getId(),
    text: text,
    length: text.length,
  };
  if (req.structure || req.includeParagraphs) {
    var paragraphs = body.getParagraphs();
    result.paragraphs = paragraphs.map(function (p, i) {
      var bounds = paragraphBounds_(body, i);
      return {
        index: i,
        text: p.getText(),
        heading: String(p.getHeading()),
        startIndex: bounds.startIndex,
        endIndex: bounds.endIndex,
      };
    });
  }
  return result;
}

function listDoc_(doc, req) {
  var body = resolveMarkdownBody_(doc, req);
  var paragraphs = body.getParagraphs();
  var headings = [];
  paragraphs.forEach(function (p, i) {
    var h = p.getHeading();
    if (h !== DocumentApp.ParagraphHeading.NORMAL) {
      headings.push({ index: i, level: String(h), text: p.getText() });
    }
  });
  return {
    title: doc.getName(),
    documentId: doc.getId(),
    paragraphCount: paragraphs.length,
    headings: headings,
    length: body.getText().length,
  };
}

function appendDoc_(doc, req) {
  requireDoc_(req.text, 'text');
  var body = doc.getBody();
  if (req.heading) {
    var p = body.appendParagraph(req.text);
    p.setHeading(parseHeading_(req.heading));
    return { appended: req.text, heading: String(p.getHeading()) };
  }
  body.appendParagraph(req.text);
  return { appended: req.text };
}

function insertDoc_(doc, req) {
  requireDoc_(req.text, 'text');
  var body = doc.getBody();
  if (req.index != null) {
    body.editAsText().insertText(req.index, req.text);
    return { index: req.index, inserted: req.text };
  }
  if (req.afterParagraph != null) {
    var paragraphs = body.getParagraphs();
    var idx = req.afterParagraph;
    if (idx < 0 || idx >= paragraphs.length) {
      throw new Error('afterParagraph out of range: ' + idx);
    }
    var bounds = paragraphBounds_(body, idx);
    var insertAt = bounds.endIndex;
    body.editAsText().insertText(insertAt, '\n' + req.text);
    return { afterParagraph: idx, inserted: req.text };
  }
  return appendDoc_(doc, req);
}

function replaceDoc_(doc, req) {
  var body = doc.getBody();
  var textEl = body.editAsText();
  if (req.find != null && req.replace !== undefined) {
    var pattern = req.regex === true ? String(req.find) : escapeRegexLiteral_(String(req.find));
    textEl.replaceText(pattern, String(req.replace));
    return { find: req.find, replace: req.replace, replaced: true };
  }
  if (req.startIndex != null && req.endIndex != null && req.text !== undefined) {
    textEl.deleteText(req.startIndex, req.endIndex);
    textEl.insertText(req.startIndex, req.text);
    return { startIndex: req.startIndex, endIndex: req.endIndex, text: req.text };
  }
  throw new Error('replaceDoc needs find/replace or startIndex/endIndex/text');
}

function styleDoc_(doc, req) {
  requireDoc_(req.startIndex, 'startIndex');
  requireDoc_(req.endIndex, 'endIndex');
  var s = req.style || req;
  var attrs = {};
  if (s.bold != null) attrs[DocumentApp.Attribute.BOLD] = s.bold;
  if (s.italic != null) attrs[DocumentApp.Attribute.ITALIC] = s.italic;
  if (s.underline != null) attrs[DocumentApp.Attribute.UNDERLINE] = s.underline;
  if (s.fontSize != null) attrs[DocumentApp.Attribute.FONT_SIZE] = s.fontSize;
  if (s.fontFamily != null) attrs[DocumentApp.Attribute.FONT_FAMILY] = s.fontFamily;
  if (s.foregroundColor != null) attrs[DocumentApp.Attribute.FOREGROUND_COLOR] = s.foregroundColor;
  if (s.backgroundColor != null) attrs[DocumentApp.Attribute.BACKGROUND_COLOR] = s.backgroundColor;
  doc.getBody().editAsText().setAttributes(req.startIndex, req.endIndex, attrs);
  return { startIndex: req.startIndex, endIndex: req.endIndex, applied: s };
}

function deleteDoc_(doc, req) {
  var body = resolveMarkdownBody_(doc, req);
  if (req.startIndex != null && req.endIndex != null) {
    body.editAsText().deleteText(req.startIndex, req.endIndex);
    return { deleted: { startIndex: req.startIndex, endIndex: req.endIndex } };
  }
  if (req.paragraphIndex != null) {
    var paragraphs = body.getParagraphs();
    var idx = req.paragraphIndex;
    if (idx < 0 || idx >= paragraphs.length) {
      throw new Error('paragraphIndex out of range: ' + idx);
    }
    paragraphs[idx].removeFromParent();
    return { deletedParagraph: idx };
  }
  throw new Error('deleteDoc needs startIndex/endIndex or paragraphIndex');
}

function commentDoc_(doc, req, prefix) {
  requireDoc_(req.text, 'text');
  var note = prefix + String(req.text).trim();
  var body = doc.getBody();
  if (req.startIndex != null && req.endIndex != null) {
    body.editAsText().setBackgroundColor(req.startIndex, req.endIndex, req.highlight || '#fff3cd');
    return { startIndex: req.startIndex, endIndex: req.endIndex, note: note, highlight: true };
  }
  var p = body.appendParagraph('[' + note + ']');
  p.editAsText().setItalic(true).setForegroundColor('#6b7280');
  return { appendedComment: note };
}

function parseHeading_(value) {
  var map = {
    'TITLE': DocumentApp.ParagraphHeading.TITLE,
    'SUBTITLE': DocumentApp.ParagraphHeading.SUBTITLE,
    'H1': DocumentApp.ParagraphHeading.HEADING1,
    'H2': DocumentApp.ParagraphHeading.HEADING2,
    'H3': DocumentApp.ParagraphHeading.HEADING3,
    'H4': DocumentApp.ParagraphHeading.HEADING4,
    'H5': DocumentApp.ParagraphHeading.HEADING5,
    'H6': DocumentApp.ParagraphHeading.HEADING6,
    'NORMAL': DocumentApp.ParagraphHeading.NORMAL,
  };
  var key = String(value).toUpperCase();
  if (map[key]) return map[key];
  throw new Error('Unknown heading: ' + value);
}

function requireDoc_(value, name) {
  if (value === undefined || value === null || value === '') {
    throw new Error(name + ' is required');
  }
}

function escapeRegexLiteral_(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
