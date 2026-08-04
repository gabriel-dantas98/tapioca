/**
 * Upload local files (base64) to My Drive, optional domain share, append images to Docs.
 * Requires drive scope on the deployer account.
 */

function uploadDriveFile_(req) {
  var encoded = req.base64 || req.contentBase64 || req.dataBase64;
  requireDriveUploadField_(encoded, 'base64');
  var mimeType = req.mimeType || 'application/octet-stream';
  var fileName = req.fileName || req.name || ('upload-' + Date.now());

  var bytes = Utilities.base64Decode(String(encoded));
  var blob = Utilities.newBlob(bytes, mimeType, fileName);
  var file = createDriveFile_(blob, req.folderId);

  var share = null;
  if (req.shareDomain) {
    share = shareDriveFileWithDomain_(file, req);
  }

  return {
    fileId: file.getId(),
    fileName: file.getName(),
    mimeType: file.getMimeType(),
    url: file.getUrl(),
    share: share,
  };
}

function shareDriveFile_(req) {
  requireDriveUploadField_(req.fileId || req.driveFileId, 'fileId');
  var file = DriveApp.getFileById(String(req.fileId || req.driveFileId));
  return {
    fileId: file.getId(),
    share: shareDriveFileWithDomain_(file, req),
  };
}

function uploadAndAppendImage_(doc, req) {
  if (!isImageMimeType_(req.mimeType)) {
    throw new Error('uploadAndAppendImage requires an image mimeType (png, jpeg, gif, webp)');
  }

  var upload = uploadDriveFile_(req);
  var append = appendImage_(doc, {
    driveFileId: upload.fileId,
    alt: req.alt,
    width: req.width,
    height: req.height,
    maxWidth: req.maxWidth,
    tabId: req.tabId,
    index: req.index,
  });

  return {
    upload: upload,
    image: append,
  };
}

function createDriveFile_(blob, folderId) {
  if (folderId) {
    return DriveApp.getFolderById(String(folderId)).createFile(blob);
  }
  return DriveApp.createFile(blob);
}

function shareDriveFileWithDomain_(file, req) {
  var domain = String(req.shareDomain).trim().toLowerCase();
  var role = String(req.shareRole || 'reader').trim().toLowerCase();
  var withLink = req.shareWithLink !== false;

  try {
    var access = withLink ? DriveApp.Access.DOMAIN_WITH_LINK : DriveApp.Access.DOMAIN;
    var permission = role === 'writer' || role === 'commenter'
      ? DriveApp.Permission.EDIT
      : DriveApp.Permission.VIEW;
    file.setSharing(access, permission);
    return { domain: domain, role: role, withLink: withLink, method: 'driveapp' };
  } catch (driveAppErr) {
    var driveAppMessage = String(driveAppErr && driveAppErr.message ? driveAppErr.message : driveAppErr);
  }

  try {
    if (typeof Drive !== 'undefined' && Drive.Permissions && Drive.Permissions.insert) {
      Drive.Permissions.insert({
        role: role,
        type: 'domain',
        domain: domain,
        withLink: withLink,
      }, file.getId(), { sendNotificationEmails: false });
      return { domain: domain, role: role, withLink: withLink, method: 'drive-api' };
    }
  } catch (err) {
    throw new Error('Could not share file with domain ' + domain + ': '
      + String(err.message || err || driveAppMessage || 'unknown error'));
  }

  throw new Error('Could not share file with domain ' + domain + ': Drive sharing unavailable');
}

function isImageMimeType_(mimeType) {
  return /^image\//i.test(String(mimeType || ''));
}

function requireDriveUploadField_(value, name) {
  if (value === undefined || value === null || value === '') {
    throw new Error(name + ' is required');
  }
}

function isDriveUploadAction_(action) {
  return action === 'uploadDriveFile' || action === 'shareDriveFile';
}
