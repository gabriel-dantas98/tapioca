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
