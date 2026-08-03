/**
 * Google Docs tabs (organizational tabs, not Sheets).
 * Create via Docs API advanced service; read via DocumentApp.
 */

function isDocTabAction_(action) {
  return action === 'listDocTabs' || action === 'createDocTab' || action === 'renameDocTab'
    || action === 'listDocTab' || action === 'createDocTab' || action === 'renameDocTab';
}

function listDocTabs_(doc) {
  return {
    documentId: doc.getId(),
    tabs: flattenDocTabs_(doc.getTabs()),
  };
}

function flattenDocTabs_(tabs, parentId) {
  var out = [];
  (tabs || []).forEach(function (tab) {
    var entry = {
      tabId: tab.getId(),
      title: tab.getTitle(),
      index: tab.getIndex(),
      parentTabId: parentId || null,
      type: String(tab.getType()),
    };
    out.push(entry);
    var children = tab.getChildTabs();
    if (children && children.length) {
      out = out.concat(flattenDocTabs_(children, entry.tabId));
    }
  });
  return out;
}

function createDocTab_(doc, req) {
  var title = req.name || req.title;
  requireDoc_(title, 'name');
  ensureDocsApi_();
  var documentId = doc.getId();
  var response = Docs.Documents.batchUpdate({
    requests: [{
      addDocumentTab: {
        tabProperties: { title: String(title) },
      },
    }],
  }, documentId);
  var reply = response.replies && response.replies[0];
  var tabProps = reply && reply.addDocumentTab && reply.addDocumentTab.tabProperties;
  if (!tabProps || !tabProps.tabId) {
    throw new Error('createDocTab failed: no tabId in Docs API response');
  }
  return {
    tabId: tabProps.tabId,
    title: tabProps.title || title,
    name: tabProps.title || title,
    documentId: documentId,
  };
}

function renameDocTab_(doc, req) {
  requireDoc_(req.tabId, 'tabId');
  var title = req.name || req.title || req.newName;
  requireDoc_(title, 'name');
  ensureDocsApi_();
  Docs.Documents.batchUpdate({
    requests: [{
      updateDocumentTabProperties: {
        tabId: String(req.tabId),
        tabProperties: { title: String(title) },
        fields: 'title',
      },
    }],
  }, doc.getId());
  return { tabId: req.tabId, title: title, renamed: true };
}

function resolveMarkdownBody_(doc, req) {
  if (req.tabId) {
    return doc.getTab(String(req.tabId)).asDocumentTab().getBody();
  }
  return doc.getBody();
}

function ensureDocsApi_() {
  if (typeof Docs === 'undefined' || !Docs.Documents) {
    throw new Error(
      'Google Docs API advanced service required for doc tabs. '
      + 'Enable Docs API in Apps Script project Services (+).'
    );
  }
}

/**
 * Wipes body content (main doc or a specific tab) via the Docs API instead of
 * DocumentApp's body.clear(), which throws "Can't remove the last paragraph in
 * a document section." Preserves the required trailing paragraph marker and,
 * when tabId is given, targets that tab instead of the main body (DocumentApp's
 * body.clear() only ever touches the main body, silently leaving tab content
 * duplicated across republishes).
 */
function clearDocumentBodyViaDocsApi_(documentId, tabId) {
  ensureDocsApi_();
  var getParams = tabId ? { includeTabsContent: true } : undefined;
  var doc = Docs.Documents.get(documentId, getParams);
  var body = tabId ? findDocumentTabInApi_(doc.tabs, tabId) : doc.body;
  if (!body) {
    throw new Error('clearDocumentBodyViaDocsApi_: could not resolve body for tabId ' + tabId);
  }
  var content = body.content || [];
  var endIndex = content.length ? content[content.length - 1].endIndex : 1;
  if (endIndex <= 2) return;
  var deleteRange = { startIndex: 1, endIndex: endIndex - 1 };
  if (tabId) deleteRange.tabId = tabId;
  Docs.Documents.batchUpdate({
    requests: [{ deleteContentRange: { range: deleteRange } }],
  }, documentId);
}

function findDocumentTabInApi_(tabs, tabId) {
  var found = null;
  (tabs || []).some(function (tab) {
    var props = tab.tabProperties;
    if (props && props.tabId === tabId) {
      found = tab.documentTab && tab.documentTab.body;
      return true;
    }
    if (tab.childTabs && tab.childTabs.length) {
      found = findDocumentTabInApi_(tab.childTabs, tabId);
      return !!found;
    }
    return false;
  });
  return found;
}
