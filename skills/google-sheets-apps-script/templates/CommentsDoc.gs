/**
 * Native Google Docs comment threads via Drive API (Advanced Service or REST v3).
 * Requires drive scope + Drive API enabled on the script GCP project.
 */

function replyDocComment_(doc, req) {
  var fileId = doc.getId();
  requireDocCommentField_(req.commentId, 'commentId');
  requireDocCommentField_(req.text != null ? req.text : req.content, 'text');
  var commentId = String(req.commentId).trim();
  var formatted = formatDocCommentReply_(req.text != null ? req.text : req.content, req);

  var reply = insertDriveReply_(fileId, commentId, formatted);
  var result = {
    documentId: fileId,
    commentId: commentId,
    reply: normalizeDriveReply_(reply),
  };

  if (req.resolve === true) {
    result.resolved = resolveDriveComment_(fileId, commentId).resolved;
  }

  return result;
}

function resolveDocComment_(doc, req) {
  var fileId = doc.getId();
  requireDocCommentField_(req.commentId, 'commentId');
  var commentId = String(req.commentId).trim();
  var outcome = resolveDriveComment_(fileId, commentId, req.resolved);
  var result = {
    documentId: fileId,
    commentId: commentId,
    resolved: outcome.resolved,
  };
  if (req.debug) result.verified = outcome.verified;
  if (!outcome.resolved && outcome.note) result.note = outcome.note;
  return result;
}

function insertDriveReply_(fileId, commentId, payload) {
  try {
    if (typeof Drive !== 'undefined' && Drive.Replies && Drive.Replies.insert) {
      return insertDriveReplyAdvanced_(fileId, commentId, payload);
    }
  } catch (err) {
    var message = String(err && err.message ? err.message : err);
    if (message.indexOf('has not been enabled') === -1 && message.indexOf('Drive API') === -1) {
      throw err;
    }
  }
  return insertDriveReplyRest_(fileId, commentId, payload);
}

function insertDriveReplyAdvanced_(fileId, commentId, payload) {
  return Drive.Replies.insert(payload, fileId, commentId);
}

function insertDriveReplyRest_(fileId, commentId, payload) {
  return driveApiRequest_(
    'POST',
    '/files/' + encodeURIComponent(fileId) + '/comments/' + encodeURIComponent(commentId) + '/replies',
    { fields: 'id,content,htmlContent,author(displayName,emailAddress),createdTime,modifiedTime' },
    payload
  );
}

function resolveDriveComment_(fileId, commentId, resolved) {
  var nextResolved = resolved !== false;

  try {
    var patchResponse = driveApiRequest_(
      'PATCH',
      '/files/' + encodeURIComponent(fileId) + '/comments/' + encodeURIComponent(commentId),
      { fields: 'id,resolved,modifiedTime' },
      { resolved: nextResolved }
    );
    var verify = driveApiRequest_(
      'GET',
      '/files/' + encodeURIComponent(fileId) + '/comments/' + encodeURIComponent(commentId),
      { fields: 'id,resolved,modifiedTime' }
    );
    return {
      resolved: verify.resolved === true,
      verified: verify,
      patchResponse: patchResponse,
    };
  } catch (restErr) {
    var restMessage = String(restErr && restErr.message ? restErr.message : restErr);
  }

  try {
    if (typeof Drive !== 'undefined' && Drive.Comments && Drive.Comments.patch) {
      var patched = Drive.Comments.patch({ status: nextResolved ? 'resolved' : 'open' }, fileId, commentId);
      return {
        resolved: isCommentResolved_(patched),
        verified: patched,
        note: isCommentResolved_(patched) ? '' : resolveDriveCommentNote_(),
      };
    }
  } catch (minimalPatchErr) {
    var minimalMessage = String(minimalPatchErr && minimalPatchErr.message ? minimalPatchErr.message : minimalPatchErr);
  }

  try {
    if (typeof Drive !== 'undefined' && Drive.Comments && Drive.Comments.get
        && (Drive.Comments.update || Drive.Comments.patch)) {
      var comment = Drive.Comments.get(fileId, commentId);
      comment.status = nextResolved ? 'resolved' : 'open';
      comment.resolved = nextResolved;
      if (Drive.Comments.update) {
        Drive.Comments.update(comment, fileId, commentId);
      } else {
        Drive.Comments.patch(comment, fileId, commentId);
      }
      var refreshed = Drive.Comments.get(fileId, commentId);
      return {
        resolved: isCommentResolved_(refreshed),
        verified: refreshed,
      };
    }
  } catch (advancedErr) {
    throw new Error('Could not resolve comment ' + commentId + ': '
      + String(advancedErr.message || advancedErr || restMessage || 'unknown error'));
  }

  throw new Error('Could not resolve comment ' + commentId + ': Drive API unavailable');
}

function resolveDriveCommentNote_() {
  return 'Drive API may leave Google Docs anchor comments open; resolve manually in Docs UI if status stays open.';
}

function requireDocCommentField_(value, name) {
  if (value === undefined || value === null || value === '') {
    throw new Error(name + ' is required');
  }
}

function formatDocCommentReply_(text, req) {
  var message = String(text || '').trim();
  var host = inferCommentReplyHost_(req);
  var signaturePlain = '> replied from ' + host;
  if (message.indexOf(signaturePlain) !== -1) {
    return {
      content: message,
      htmlContent: toCommentHtml_(message),
    };
  }
  var plain = message + '\n\n' + signaturePlain;
  return {
    content: plain,
    htmlContent: toCommentHtml_(message) + '<br><br>&gt; replied from ' + host,
  };
}

function toCommentHtml_(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

function inferCommentReplyHost_(req) {
  var host = String(req.host || req.replyHost || req.agentHost || '').trim().toLowerCase();
  if (host === 'cursor' || host === 'claude') return host;
  throw new Error('host is required for replyDocComment — use "cursor" or "claude"');
}

function readDocComments_(doc, req) {
  var fileId = doc.getId();
  var includeResolved = req.includeResolved !== false;
  var includeReplies = req.includeReplies !== false;
  var pageSize = Math.min(Number(req.pageSize) || 100, 100);
  var maxPages = Number(req.maxPages) || 20;

  var comments = listAllDriveComments_(fileId, pageSize, maxPages);
  var normalized = comments.map(function (comment) {
    return normalizeDriveComment_(fileId, comment, includeReplies);
  });

  if (!includeResolved) {
    normalized = normalized.filter(function (comment) {
      return !comment.resolved;
    });
  }

  return {
    documentId: fileId,
    title: doc.getName(),
    count: normalized.length,
    openCount: normalized.filter(function (c) { return !c.resolved; }).length,
    comments: normalized,
  };
}

function listAllDriveComments_(fileId, pageSize, maxPages) {
  try {
    return listAllDriveCommentsRest_(fileId, pageSize, maxPages);
  } catch (restErr) {
    var restMessage = String(restErr && restErr.message ? restErr.message : restErr);
    if (restMessage.indexOf('has not been enabled') === -1 && restMessage.indexOf('Drive API') === -1) {
      throw restErr;
    }
  }

  try {
    if (typeof Drive !== 'undefined' && Drive.Comments && Drive.Comments.list) {
      return listAllDriveCommentsAdvanced_(fileId, pageSize, maxPages);
    }
  } catch (err) {
    throw err;
  }

  return [];
}

function listAllDriveCommentsAdvanced_(fileId, pageSize, maxPages) {
  var all = [];
  var pageToken = null;
  var pages = 0;

  do {
    var params = { maxResults: pageSize };
    if (pageToken) params.pageToken = pageToken;

    var response = Drive.Comments.list(fileId, params);
    var batch = response.items || response.comments || [];
    for (var i = 0; i < batch.length; i++) {
      all.push(batch[i]);
    }

    pageToken = response.nextPageToken;
    pages++;
  } while (pageToken && pages < maxPages);

  return all;
}

function listAllDriveCommentsRest_(fileId, pageSize, maxPages) {
  var all = [];
  var pageToken = null;
  var pages = 0;
  var fields = 'comments(id,content,htmlContent,author(displayName,emailAddress),createdTime,modifiedTime,resolved,deleted,anchor,quotedFileContent,replies(id,content,htmlContent,author(displayName,emailAddress),createdTime,modifiedTime)),nextPageToken';

  do {
    var query = {
      pageSize: String(pageSize),
      fields: fields,
      includeDeleted: 'false',
    };
    if (pageToken) query.pageToken = pageToken;

    var response = driveApiRequest_('GET', '/files/' + encodeURIComponent(fileId) + '/comments', query);
    var batch = response.comments || [];
    for (var i = 0; i < batch.length; i++) {
      all.push(batch[i]);
    }

    pageToken = response.nextPageToken;
    pages++;
  } while (pageToken && pages < maxPages);

  return all;
}

function normalizeDriveComment_(fileId, comment, includeReplies) {
  var author = comment.author || {};
  var context = comment.context || {};
  var quoted = comment.quotedFileContent || {};

  var commentId = comment.id || comment.commentId || '';
  var normalized = {
    id: commentId,
    content: stripHtml_(comment.content || comment.htmlContent || ''),
    htmlContent: comment.htmlContent || '',
    author: author.displayName || author.emailAddress || author.name || '',
    authorEmail: author.emailAddress || '',
    createdTime: comment.createdDate || comment.createdTime || '',
    modifiedTime: comment.modifiedDate || comment.modifiedTime || '',
    resolved: isCommentResolved_(comment),
    status: comment.status || (comment.resolved === true ? 'resolved' : 'open'),
    deleted: comment.deleted === true || comment.status === 'deleted',
    quotedText: context.value || quoted.value || '',
    anchor: parseCommentAnchor_(comment.anchor),
  };

  if (includeReplies) {
    var inlineReplies = comment.replies || comment.items;
    if (inlineReplies && inlineReplies.length) {
      normalized.replies = inlineReplies.map(normalizeDriveReply_);
      normalized.replyCount = normalized.replies.length;
    } else if (commentId) {
      normalized.replies = listDriveReplies_(fileId, commentId);
      normalized.replyCount = normalized.replies.length;
    } else {
      normalized.replies = [];
      normalized.replyCount = 0;
    }
  }

  return normalized;
}

function listDriveReplies_(fileId, commentId) {
  if (!commentId) return [];
  try {
    if (typeof Drive !== 'undefined' && Drive.Replies && Drive.Replies.list) {
      return listDriveRepliesAdvanced_(fileId, commentId);
    }
  } catch (err) {
    var message = String(err && err.message ? err.message : err);
    if (message.indexOf('Comment not found') !== -1) return [];
    if (message.indexOf('has not been enabled') === -1 && message.indexOf('Drive API') === -1) {
      throw err;
    }
  }
  try {
    return listDriveRepliesRest_(fileId, commentId);
  } catch (err) {
    var message = String(err && err.message ? err.message : err);
    if (message.indexOf('Comment not found') !== -1 || message.indexOf('404') !== -1) return [];
    throw err;
  }
}

function listDriveRepliesAdvanced_(fileId, commentId) {
  var replies = [];
  var pageToken = null;

  do {
    var params = { maxResults: 100 };
    if (pageToken) params.pageToken = pageToken;

    var response = Drive.Replies.list(fileId, commentId, params);
    var batch = response.items || response.replies || [];
    for (var i = 0; i < batch.length; i++) {
      replies.push(normalizeDriveReply_(batch[i]));
    }

    pageToken = response.nextPageToken;
  } while (pageToken);

  return replies;
}

function listDriveRepliesRest_(fileId, commentId) {
  var replies = [];
  var pageToken = null;
  var fields = 'replies(id,content,htmlContent,author(displayName,emailAddress),createdTime,modifiedTime),nextPageToken';

  do {
    var query = { pageSize: '100', fields: fields };
    if (pageToken) query.pageToken = pageToken;

    var response = driveApiRequest_(
      'GET',
      '/files/' + encodeURIComponent(fileId) + '/comments/' + encodeURIComponent(commentId) + '/replies',
      query
    );
    var batch = response.replies || [];
    for (var i = 0; i < batch.length; i++) {
      replies.push(normalizeDriveReply_(batch[i]));
    }

    pageToken = response.nextPageToken;
  } while (pageToken);

  return replies;
}

function normalizeDriveReply_(reply) {
  var author = reply.author || {};
  return {
    id: reply.id || reply.replyId || '',
    content: stripHtml_(reply.content || reply.htmlContent || ''),
    author: author.displayName || author.emailAddress || author.name || '',
    authorEmail: author.emailAddress || '',
    createdTime: reply.createdDate || reply.createdTime || '',
    modifiedTime: reply.modifiedDate || reply.modifiedTime || '',
  };
}

function driveApiRequest_(method, path, query, body) {
  var token = ScriptApp.getOAuthToken();
  var url = 'https://www.googleapis.com/drive/v3' + path;
  if (query) {
    var parts = [];
    Object.keys(query).forEach(function (key) {
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(query[key]));
    });
    if (parts.length) url += '?' + parts.join('&');
  }

  var options = {
    method: method,
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
  };
  if (body != null) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(body);
  }

  var response = UrlFetchApp.fetch(url, options);

  var code = response.getResponseCode();
  var body = response.getContentText();
  if (code >= 400) {
    throw new Error('Drive API ' + method + ' ' + path + ' failed (' + code + '): ' + body);
  }
  return body ? JSON.parse(body) : {};
}

function isCommentResolved_(comment) {
  if (comment.resolved === true) return true;
  if (comment.status === 'resolved') return true;
  return false;
}

function parseCommentAnchor_(anchor) {
  if (!anchor) return null;
  if (typeof anchor === 'object') return anchor;
  var text = String(anchor).trim();
  if (!text) return null;
  if (text.charAt(0) === '{') {
    try {
      return JSON.parse(text);
    } catch (err) {
      return { raw: text };
    }
  }
  return { raw: text };
}

function stripHtml_(value) {
  return String(value || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
