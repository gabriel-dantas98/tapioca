/**
 * Generic Sheets agent API — paste into any Apps Script project bound to a spreadsheet.
 *
 * Browser mode deploy:
 *   Execute as: Me
 *   Who has access: Only myself
 *
 * OAuth mode deploy (optional):
 *   Enable Apps Script API + Execution API sign-in
 */

/** Run once in Apps Script editor after upgrading to v2 (grants Docs scope). */
function authorizeWorkspace() {
  var spreadsheet = SpreadsheetApp.create('authorize-workspace-temp');
  spreadsheet.getId();
  DriveApp.getFileById(spreadsheet.getId()).setTrashed(true);
  var document = DocumentApp.create('authorize-workspace-temp');
  DriveApp.getFileById(document.getId()).setTrashed(true);
  var presentation = SlidesApp.create('authorize-workspace-temp');
  DriveApp.getFileById(presentation.getId()).setTrashed(true);
  UrlFetchApp.fetch('https://www.google.com/generate_204');
  return { ok: true, message: 'Workspace scopes authorized' };
}

/** Run once in editor after v2.2 to enable Drive API for readDocComments. */
function testReadDocComments() {
  var doc = DocumentApp.openById('1T0BfQtTbe54rvVQWgfQIuSbGbJrIc7HZvU4oVk-2O_w');
  return readDocComments_(doc, { includeReplies: true });
}

function runApi(payloadJson) {
  const req = normalizeRequest_(JSON.parse(payloadJson));
  if (isDriveUploadAction_(req.action)) {
    return runDriveUploadApi_(req);
  }
  if (isDocRequest_(req)) {
    return runDocApi_(req);
  }
  if (isSlidesRequest_(req)) {
    return runSlidesApi_(req);
  }
  const ctx = resolveContext_(req);

  if (req.action === 'batch') {
    return (req.ops || []).map(function (op) {
      const opCtx = resolveContext_(Object.assign({}, req, op));
      return { success: true, action: op.action, data: dispatch_(opCtx, op) };
    });
  }

  return dispatch_(ctx, req);
}

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const encoded = params.p || params.payload;

  if (!encoded) {
    return respond_({
      ok: true,
      version: '3.0.0',
      entrypoint: 'runApi',
      mode: 'browser-get',
      targets: ['spreadsheet', 'document', 'presentation'],
      sheetActions: [
        'read', 'create', 'update', 'delete', 'style', 'comment', 'batch',
        'listSheets', 'createSheet', 'renameSheet', 'deleteSheet', 'tabColor',
        'uploadDriveFile', 'shareDriveFile',
      ],
      docActions: [
        'readDoc', 'listDoc', 'appendDoc', 'insertDoc', 'replaceDoc',
        'styleDoc', 'deleteDoc', 'commentDoc', 'readDocComments', 'replyDocComment',
        'resolveDocComment', 'appendMarkdown', 'appendTable',
        'appendImage', 'uploadAndAppendImage', 'batch',
        'listDocTabs', 'createDocTab', 'renameDocTab',
      ],
      slidesActions: [
        'listSlides', 'getSlide', 'createSlide', 'duplicateSlide', 'deleteSlide',
        'moveSlide', 'replaceText', 'appendTextBox', 'insertShape', 'insertImage',
        'setBackground', 'copySlide', 'batch',
      ],
    });
  }

  try {
    const payloadJson = decodePayloadParam_(encoded);
    return respond_(runApi(payloadJson));
  } catch (err) {
    return respond_({ error: String(err.message || err) });
  }
}

function doPost(e) {
  try {
    const body = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const req = JSON.parse(body);
    const payloadJson = req.payload ? JSON.stringify(req.payload) : body;
    return respond_(runApi(payloadJson));
  } catch (err) {
    return respond_({ error: String(err.message || err) });
  }
}

function decodePayloadParam_(encoded) {
  const normalized = String(encoded).replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLength);
  return Utilities.newBlob(Utilities.base64Decode(padded)).getDataAsString();
}

function resolveContext_(req) {
  const ss = openSpreadsheet_(req.spreadsheetId);
  const sheet = isSpreadsheetOnlyAction_(req.action) ? null : resolveSheet_(ss, req);
  return {
    spreadsheetId: ss.getId(),
    ss: ss,
    sheet: sheet,
    sheetName: sheet ? sheet.getName() : null,
    commentPrefix: req.commentPrefix || 'claude: ',
  };
}

function runDriveUploadApi_(req) {
  switch (req.action) {
    case 'uploadDriveFile':
      return uploadDriveFile_(req);
    case 'shareDriveFile':
      return shareDriveFile_(req);
    default:
      throw new Error('Unknown drive upload action: ' + req.action);
  }
}

function normalizeRequest_(req) {
  if (req.action) req.action = normalizeAction_(req.action);
  if (req.ops && req.ops.length) {
    req.ops = req.ops.map(function (op) {
      var next = Object.assign({}, op);
      if (next.action) next.action = normalizeAction_(next.action);
      return next;
    });
  }
  return req;
}

function normalizeAction_(action) {
  var aliases = {
    listTabs: 'listSheets',
    createTab: 'createSheet',
    renameTab: 'renameSheet',
    deleteTab: 'deleteSheet',
    setTabColor: 'tabColor',
  };
  return aliases[action] || action || '';
}

function isSpreadsheetOnlyAction_(action) {
  return action === 'listSheets' || action === 'createSheet'
    || action === 'renameSheet' || action === 'deleteSheet';
}

function openSpreadsheet_(spreadsheetId) {
  if (spreadsheetId) return SpreadsheetApp.openById(spreadsheetId);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function resolveSheet_(ss, req) {
  if (req.sheetName) {
    const sheet = ss.getSheetByName(req.sheetName);
    if (!sheet) throw new Error('Sheet not found: ' + req.sheetName);
    return sheet;
  }
  if (req.sheetId != null) {
    const sheet = ss.getSheets().filter(function (s) {
      return s.getSheetId() === req.sheetId;
    })[0];
    if (!sheet) throw new Error('Sheet not found with id: ' + req.sheetId);
    return sheet;
  }
  if (req.sheetIndex != null) {
    const sheet = ss.getSheets()[req.sheetIndex];
    if (!sheet) throw new Error('Sheet not found at index: ' + req.sheetIndex);
    return sheet;
  }
  return ss.getActiveSheet() || ss.getSheets()[0];
}

function resolveSheetForOp_(ss, req) {
  if (req.sheetName || req.sheetId != null || req.sheetIndex != null) {
    return resolveSheet_(ss, req);
  }
  if (req.name) {
    const byName = ss.getSheetByName(req.name);
    if (byName) return byName;
  }
  throw new Error('sheetName, sheetId, sheetIndex, or name is required');
}

function dispatch_(ctx, req) {
  const sheet = ctx.sheet;
  const ss = ctx.ss;

  switch (req.action) {
    case 'read': return read_(sheet, req);
    case 'create': return create_(sheet, req);
    case 'update': return update_(sheet, req);
    case 'delete': return delete_(sheet, req);
    case 'style': return style_(sheet, req);
    case 'comment': return comment_(sheet, req, ctx.commentPrefix);
    case 'listSheets': return listSheets_(ss);
    case 'createSheet': return createSheet_(ss, req);
    case 'renameSheet': return renameSheet_(ss, req);
    case 'deleteSheet': return deleteSheet_(ss, req);
    case 'tabColor': return tabColor_(resolveSheetForOp_(ss, req), req);
    default: throw new Error('Unknown action: ' + req.action);
  }
}

function listSheets_(ss) {
  return ss.getSheets().map(function (s, i) {
    return {
      index: i,
      sheetId: s.getSheetId(),
      name: s.getName(),
      tabColor: s.getTabColor(),
    };
  });
}

function createSheet_(ss, req) {
  require_(req.name, 'name');
  if (ss.getSheetByName(req.name)) {
    throw new Error('Sheet already exists: ' + req.name);
  }

  const sheet = req.index != null ? ss.insertSheet(req.name, req.index) : ss.insertSheet(req.name);

  if (req.tabColor === null || req.tabColor === '') {
    sheet.setTabColor(null);
  } else if (req.tabColor) {
    sheet.setTabColor(req.tabColor);
  }

  if (req.activate) ss.setActiveSheet(sheet);

  return {
    sheetName: sheet.getName(),
    sheetId: sheet.getSheetId(),
    index: sheet.getIndex(),
    tabColor: sheet.getTabColor(),
  };
}

function renameSheet_(ss, req) {
  require_(req.newName, 'newName');
  const sheet = resolveSheetForOp_(ss, req);
  const oldName = sheet.getName();
  sheet.setName(req.newName);
  return { oldName: oldName, newName: req.newName, sheetId: sheet.getSheetId() };
}

function deleteSheet_(ss, req) {
  const sheet = resolveSheetForOp_(ss, req);
  if (ss.getSheets().length <= 1) {
    throw new Error('Cannot delete the only sheet in the workbook');
  }
  const deletedSheet = sheet.getName();
  ss.deleteSheet(sheet);
  return { deletedSheet: deletedSheet };
}

function tabColor_(sheet, req) {
  if (req.tabColor === null || req.tabColor === '') {
    sheet.setTabColor(null);
  } else {
    require_(req.tabColor, 'tabColor');
    sheet.setTabColor(req.tabColor);
  }
  return { sheetName: sheet.getName(), tabColor: sheet.getTabColor() };
}

function read_(sheet, req) {
  require_(req.range, 'range');
  const range = sheet.getRange(req.range);
  return {
    range: range.getA1Notation(),
    values: range.getValues(),
    formulas: req.includeFormulas ? range.getFormulas() : undefined,
    notes: req.includeNotes ? range.getNotes() : undefined,
  };
}

function create_(sheet, req) {
  if (req.values) {
    const rows = req.values.length;
    const cols = req.values[0].length;
    const startRow = req.row || sheet.getLastRow() + 1;
    const startCol = req.col || 1;
    const range = sheet.getRange(startRow, startCol, rows, cols);
    range.setValues(req.values);
    return { range: range.getA1Notation(), rows: rows, cols: cols };
  }
  if (req.row) {
    sheet.insertRowBefore(req.row);
    if (req.value != null) sheet.getRange(req.row, req.col || 1).setValue(req.value);
    if (req.values) {
      sheet.getRange(req.row, req.col || 1, 1, req.values.length).setValues([req.values]);
    }
    return { row: req.row };
  }
  throw new Error('create needs values or row');
}

function update_(sheet, req) {
  require_(req.range, 'range');
  const range = sheet.getRange(req.range);
  if (req.value !== undefined) range.setValue(req.value);
  if (req.values) range.setValues(req.values);
  if (req.formula) range.setFormula(req.formula);
  return { range: range.getA1Notation() };
}

function delete_(sheet, req) {
  if (req.row) {
    sheet.deleteRow(req.row);
    return { deletedRow: req.row };
  }
  if (req.rows && req.rows.length) {
    req.rows.sort(function (a, b) { return b - a; }).forEach(function (r) {
      sheet.deleteRow(r);
    });
    return { deletedRows: req.rows };
  }
  if (req.range) {
    const range = sheet.getRange(req.range);
    if (req.clearNotes) range.clearNote();
    range.clearContent();
    return { cleared: req.range };
  }
  throw new Error('delete needs row, rows, or range');
}

function style_(sheet, req) {
  require_(req.range, 'range');
  const range = sheet.getRange(req.range);
  const s = req.style || {};

  if (s.background != null) range.setBackground(s.background);
  if (s.fontColor != null) range.setFontColor(s.fontColor);
  if (s.fontSize != null) range.setFontSize(s.fontSize);
  if (s.fontFamily != null) range.setFontFamily(s.fontFamily);
  if (s.bold != null) range.setFontWeight(s.bold ? 'bold' : 'normal');
  if (s.italic != null) range.setFontStyle(s.italic ? 'italic' : 'normal');
  if (s.horizontalAlign != null) range.setHorizontalAlignment(s.horizontalAlign);
  if (s.verticalAlign != null) range.setVerticalAlignment(s.verticalAlign);
  if (s.wrap != null) range.setWrap(s.wrap);
  if (s.numberFormat != null) range.setNumberFormat(s.numberFormat);

  return { range: range.getA1Notation(), applied: s };
}

function comment_(sheet, req, prefix) {
  require_(req.range, 'range');
  require_(req.text, 'text');
  const range = sheet.getRange(req.range);
  const note = prefix + String(req.text).trim();
  range.setNote(note);
  return { range: range.getA1Notation(), note: note };
}

function require_(value, name) {
  if (value === undefined || value === null || value === '') {
    throw new Error(name + ' is required');
  }
}

function respond_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
