#!/usr/bin/env node
/**
 * Behavioral regression test for Google Docs tab (`tabId`) routing.
 *
 * Loads the real .gs source (Docs.gs, DocTabs.gs, MarkdownDoc.gs, DriveUpload.gs)
 * into a sandboxed V8 context with mocked Apps Script globals (DocumentApp,
 * DriveApp, Utilities), then calls the actual action functions and asserts
 * which mock "tab body" received the write/read. This catches routing bugs
 * that a static grep (run_static.py) cannot see — e.g. an action silently
 * falling back to doc.getBody() instead of the requested tab.
 *
 * Usage: node evals/run_tabid_behavior.js
 * Exit code 0 = all assertions passed, 1 = failure (see printed diff).
 */

const vm = require('vm');
const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const FILES = ['Docs.gs', 'DocTabs.gs', 'MarkdownDoc.gs', 'DriveUpload.gs'];

function makeImage() {
  let width = 300;
  let height = 200;
  return {
    getWidth: () => width,
    getHeight: () => height,
    setWidth: (w) => { width = w; },
    setHeight: (h) => { height = h; },
  };
}

function makeParagraph(initialText) {
  let text = initialText || '';
  let heading = 'NORMAL';
  const textApi = {
    setText: (t) => { text = t; return textApi; },
    setBold: () => textApi,
    setItalic: () => textApi,
    setFontFamily: () => textApi,
    setBackgroundColor: () => textApi,
    setForegroundColor: () => textApi,
    setLinkUrl: () => textApi,
  };
  const paragraph = {
    getText: () => text,
    editAsText: () => textApi,
    setHeading: (h) => { heading = h; return paragraph; },
    getHeading: () => heading,
    setIndentStart: () => paragraph,
    setIndentFirstLine: () => paragraph,
    setSpacingBefore: () => paragraph,
    setSpacingAfter: () => paragraph,
    setGlyphType: () => paragraph,
    appendInlineImage: () => {
      const image = makeImage();
      paragraph.__image = image;
      return image;
    },
    removeFromParent: () => { paragraph.__removed = true; },
  };
  return paragraph;
}

function makeTable(rows) {
  const cells = rows.map((row) => row.map((cellText) => ({ text: cellText, bold: false, bg: null })));
  return {
    getNumRows: () => cells.length,
    getRow: (i) => ({
      getNumCells: () => cells[i].length,
      // Older styleTable_ variants call editAsText()/setBackgroundColor() on
      // the row directly instead of per-cell; support both call shapes.
      editAsText: () => ({ setBold: () => {} }),
      setBackgroundColor: () => {},
    }),
    getCell: (r, c) => {
      const cell = cells[r][c];
      return {
        editAsText: () => ({
          setText: (t) => { cell.text = t; },
          setBold: () => { cell.bold = true; },
        }),
        setBackgroundColor: (color) => { cell.bg = color; },
        getText: () => cell.text,
      };
    },
    setBorderWidth: () => {},
    __cells: cells,
  };
}

function makeBody(label) {
  const state = { label, paragraphs: [], tables: [] };
  return {
    __label: label,
    __state: state,
    appendParagraph: (text) => {
      const p = makeParagraph(text);
      state.paragraphs.push(p);
      return p;
    },
    appendListItem: (text) => {
      const p = makeParagraph(text);
      p.__isListItem = true;
      state.paragraphs.push(p);
      return p;
    },
    appendTable: (rows) => {
      const t = makeTable(rows);
      state.tables.push(t);
      return t;
    },
    appendHorizontalRule: () => { state.paragraphs.push({ getText: () => '', getHeading: () => 'NORMAL' }); },
    getParagraphs: () => state.paragraphs,
    getText: () => state.paragraphs.map((p) => p.getText()).join('\n'),
    editAsText: () => ({ deleteText: () => {}, insertText: () => {} }),
  };
}

function makeDoc(id) {
  const defaultBody = makeBody('default');
  const tabBodies = {};
  return {
    getId: () => id,
    getName: () => 'Mock Doc ' + id,
    getBody: () => defaultBody,
    getTab: (tabId) => {
      if (!tabBodies[tabId]) tabBodies[tabId] = makeBody(tabId);
      const body = tabBodies[tabId];
      return { asDocumentTab: () => ({ getBody: () => body }) };
    },
    __defaultBody: defaultBody,
    __tabBody: (tabId) => tabBodies[tabId],
  };
}

function buildContext() {
  const driveFiles = {};
  let nextFileId = 1;

  const context = {
    console,
    DocumentApp: {
      ParagraphHeading: {
        NORMAL: 'NORMAL', TITLE: 'TITLE', SUBTITLE: 'SUBTITLE',
        HEADING1: 'H1', HEADING2: 'H2', HEADING3: 'H3', HEADING4: 'H4', HEADING5: 'H5', HEADING6: 'H6',
      },
      GlyphType: { BULLET: 'BULLET', NUMBER: 'NUMBER' },
      Attribute: {
        BOLD: 'BOLD', ITALIC: 'ITALIC', UNDERLINE: 'UNDERLINE', FONT_SIZE: 'FONT_SIZE',
        FONT_FAMILY: 'FONT_FAMILY', FOREGROUND_COLOR: 'FOREGROUND_COLOR', BACKGROUND_COLOR: 'BACKGROUND_COLOR',
      },
    },
    DriveApp: {
      getFileById: (id) => {
        if (!driveFiles[id]) {
          driveFiles[id] = { id, name: 'file-' + id, mimeType: 'image/png', blob: { __mock: 'blob:' + id } };
        }
        const f = driveFiles[id];
        return { getId: () => f.id, getName: () => f.name, getMimeType: () => f.mimeType, getUrl: () => 'https://drive.google.com/file/d/' + f.id, getBlob: () => f.blob };
      },
      createFile: (blob) => {
        const id = 'drive-file-' + nextFileId++;
        driveFiles[id] = { id, name: blob.fileName || 'upload', mimeType: blob.mimeType || 'image/png', blob };
        const f = driveFiles[id];
        return { getId: () => f.id, getName: () => f.name, getMimeType: () => f.mimeType, getUrl: () => 'https://drive.google.com/file/d/' + f.id, getBlob: () => f.blob };
      },
    },
    Utilities: {
      base64Decode: (s) => Buffer.from(String(s), 'base64'),
      newBlob: (bytes, mimeType, fileName) => ({ bytes, mimeType, fileName }),
    },
    UrlFetchApp: {
      fetch: () => { throw new Error('UrlFetchApp.fetch not mocked in this harness — use driveFileId'); },
    },
  };
  vm.createContext(context);
  FILES.forEach((file) => {
    const src = fs.readFileSync(path.join(TEMPLATES_DIR, file), 'utf8');
    vm.runInContext(src, context, { filename: file });
  });
  return context;
}

const results = [];
function check(name, condition, detail) {
  results.push({ name, passed: !!condition, detail: detail || null });
}

function paragraphCount(body) {
  return body ? body.__state.paragraphs.length : 0;
}

function tableCount(body) {
  return body ? body.__state.tables.length : 0;
}

function run() {
  const ctx = buildContext();
  const doc = makeDoc('doc-1');
  const TAB = 't.example123';

  // appendImage_ with tabId must write into the tab body, not the default body.
  ctx.appendImage_(doc, { driveFileId: 'img-1', alt: 'Figure 1', tabId: TAB });
  check(
    'appendImage_ writes to tab body when tabId is given',
    paragraphCount(doc.__tabBody(TAB)) > 0 && paragraphCount(doc.__defaultBody) === 0,
    `tab paragraphs=${paragraphCount(doc.__tabBody(TAB))}, default paragraphs=${paragraphCount(doc.__defaultBody)}`
  );

  // appendImage_ without tabId must still fall back to the default body (no regression).
  const doc2 = makeDoc('doc-2');
  ctx.appendImage_(doc2, { driveFileId: 'img-2', alt: 'Figure 2' });
  check(
    'appendImage_ writes to default body when tabId is omitted',
    paragraphCount(doc2.__defaultBody) > 0,
    `default paragraphs=${paragraphCount(doc2.__defaultBody)}`
  );

  // appendTable_ with tabId.
  const doc3 = makeDoc('doc-3');
  ctx.appendTable_(doc3, { rows: [['a', 'b'], ['1', '2']], tabId: TAB });
  check(
    'appendTable_ writes to tab body when tabId is given',
    tableCount(doc3.__tabBody(TAB)) > 0 && tableCount(doc3.__defaultBody) === 0,
    `tab tables=${tableCount(doc3.__tabBody(TAB))}, default tables=${tableCount(doc3.__defaultBody)}`
  );

  // uploadAndAppendImage_ must forward tabId through to appendImage_.
  const doc4 = makeDoc('doc-4');
  ctx.uploadAndAppendImage_(doc4, { base64: Buffer.from('fake-bytes').toString('base64'), mimeType: 'image/png', tabId: TAB });
  check(
    'uploadAndAppendImage_ forwards tabId to appendImage_',
    paragraphCount(doc4.__tabBody(TAB)) > 0 && paragraphCount(doc4.__defaultBody) === 0,
    `tab paragraphs=${paragraphCount(doc4.__tabBody(TAB))}, default paragraphs=${paragraphCount(doc4.__defaultBody)}`
  );

  // readDoc_ / listDoc_ / deleteDoc_ must read/mutate the requested tab, not the default body.
  const doc5 = makeDoc('doc-5');
  doc5.getTab(TAB).asDocumentTab().getBody().appendParagraph('tab content');
  doc5.__defaultBody.appendParagraph('default content');
  const readResult = ctx.readDoc_(doc5, { tabId: TAB });
  check(
    'readDoc_ reads the requested tab body',
    readResult.text === 'tab content',
    `text=${JSON.stringify(readResult.text)}`
  );

  const listResult = ctx.listDoc_(doc5, { tabId: TAB });
  check(
    'listDoc_ reports paragraphCount from the requested tab body',
    listResult.paragraphCount === 1,
    `paragraphCount=${listResult.paragraphCount}`
  );

  ctx.deleteDoc_(doc5, { tabId: TAB, paragraphIndex: 0 });
  const tabBody5 = doc5.__tabBody(TAB);
  const tabRemoved = tabBody5 && tabBody5.__state.paragraphs[0] && tabBody5.__state.paragraphs[0].__removed === true;
  const defaultUnaffected = !doc5.__defaultBody.__state.paragraphs[0].__removed;
  check(
    'deleteDoc_ removes from the requested tab body, not the default body',
    tabRemoved && defaultUnaffected,
    `tab removed=${tabRemoved}, default untouched=${defaultUnaffected}`
  );

  return results;
}

const outcomes = run();
const passed = outcomes.filter((r) => r.passed).length;
outcomes.forEach((r) => {
  console.log(`${r.passed ? 'PASS' : 'FAIL'} - ${r.name}${r.detail ? ' (' + r.detail + ')' : ''}`);
});
console.log(`\n${passed}/${outcomes.length} passed`);

const OUT = path.join(__dirname, 'latest-results', 'tabid-behavior.json');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  metadata: { type: 'tabid-behavior' },
  summary: { passed, total: outcomes.length },
  results: outcomes,
}, null, 2) + '\n');
console.log(`Wrote ${OUT}`);

if (passed !== outcomes.length) process.exit(1);
