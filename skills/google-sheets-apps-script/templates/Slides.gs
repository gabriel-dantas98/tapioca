/**
 * Google Slides actions. All coordinates and dimensions are points.
 * SlidesApp handles cross-deck copy including layouts, masters, and assets.
 */

function isSlidesRequest_(req) {
  var action = req.action || '';
  if (action === 'batch') {
    return (req.ops || []).some(function (op) { return isSlidesAction_(op.action); });
  }
  return isSlidesAction_(action);
}

function isSlidesAction_(action) {
  return [
    'listSlides', 'getSlide', 'createSlide', 'duplicateSlide', 'deleteSlide',
    'moveSlide', 'replaceText', 'appendTextBox', 'insertShape', 'insertImage',
    'setBackground', 'copySlide'
  ].indexOf(action) !== -1;
}

function runSlidesApi_(req) {
  var presentation = SlidesApp.openById(req.presentationId);
  if (req.action === 'batch') {
    return (req.ops || []).map(function (op) {
      return {
        success: true,
        action: op.action,
        data: dispatchSlides_(presentation, Object.assign({}, req, op))
      };
    });
  }
  return dispatchSlides_(presentation, req);
}

function dispatchSlides_(presentation, req) {
  switch (req.action) {
    case 'listSlides': return listSlides_(presentation);
    case 'getSlide': return getSlide_(presentation, req);
    case 'createSlide': return createSlide_(presentation, req);
    case 'duplicateSlide': return duplicateSlide_(presentation, req);
    case 'deleteSlide': return deleteSlide_(presentation, req);
    case 'moveSlide': return moveSlide_(presentation, req);
    case 'replaceText': return replaceText_(presentation, req);
    case 'appendTextBox': return appendTextBox_(presentation, req);
    case 'insertShape': return insertShape_(presentation, req);
    case 'insertImage': return insertImage_(presentation, req);
    case 'setBackground': return setBackground_(presentation, req);
    case 'copySlide': return copySlide_(presentation, req);
    default: throw new Error('Unknown Slides action: ' + req.action);
  }
}

function slideAt_(presentation, req) {
  var slides = presentation.getSlides();
  if (req.slideId) {
    for (var i = 0; i < slides.length; i++) {
      if (slides[i].getObjectId() === req.slideId) return slides[i];
    }
    throw new Error('Slide not found: ' + req.slideId);
  }
  var index = req.slideIndex;
  if (index === undefined || index === null) throw new Error('slideIndex or slideId is required');
  if (!slides[index]) throw new Error('Slide index out of range: ' + index);
  return slides[index];
}

function slideIndex_(presentation, slide) {
  var slideId = slide.getObjectId();
  var slides = presentation.getSlides();
  for (var i = 0; i < slides.length; i++) {
    if (slides[i].getObjectId() === slideId) return i;
  }
  throw new Error('Slide not found after mutation: ' + slideId);
}

function slideSummary_(slide, index) {
  return {
    index: index,
    slideId: slide.getObjectId(),
    pageElementCount: slide.getPageElements().length
  };
}

function listSlides_(presentation) {
  return {
    presentationId: presentation.getId(),
    name: presentation.getName(),
    slides: presentation.getSlides().map(slideSummary_)
  };
}

function getSlide_(presentation, req) {
  var slide = slideAt_(presentation, req);
  var index = slideIndex_(presentation, slide);
  return {
    slide: slideSummary_(slide, index),
    elements: slide.getPageElements().map(function (element) {
      var result = {
        objectId: element.getObjectId(),
        type: String(element.getPageElementType()),
        left: element.getLeft(),
        top: element.getTop(),
        width: element.getWidth(),
        height: element.getHeight(),
        title: element.getTitle(),
        description: element.getDescription()
      };
      if (element.getPageElementType() === SlidesApp.PageElementType.SHAPE) {
        result.text = element.asShape().getText().asString();
      }
      return result;
    })
  };
}

function createSlide_(presentation, req) {
  var slide;
  var index = req.index;
  if (req.layout && req.layout !== 'BLANK') {
    throw new Error('Only BLANK layout is supported; copySlide preserves template layouts');
  }
  if (index === undefined || index === null) slide = presentation.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  else slide = presentation.insertSlide(index, SlidesApp.PredefinedLayout.BLANK);
  return slideSummary_(slide, slideIndex_(presentation, slide));
}

function duplicateSlide_(presentation, req) {
  var original = slideAt_(presentation, req);
  var duplicate = original.duplicate();
  return slideSummary_(duplicate, slideIndex_(presentation, duplicate));
}

function deleteSlide_(presentation, req) {
  if (presentation.getSlides().length <= 1) throw new Error('Cannot delete the only slide in a presentation');
  var slide = slideAt_(presentation, req);
  var slideId = slide.getObjectId();
  slide.remove();
  return { deletedSlideId: slideId };
}

function moveSlide_(presentation, req) {
  require_(req.toIndex, 'toIndex');
  var slide = slideAt_(presentation, req);
  slide.move(req.toIndex);
  return slideSummary_(slide, slideIndex_(presentation, slide));
}

function replaceText_(presentation, req) {
  require_(req.find, 'find');
  require_(req.replace, 'replace');
  var slide = (req.slideIndex !== undefined || req.slideId) ? slideAt_(presentation, req) : null;
  var replaced = slide ? slide.replaceAllText(req.find, req.replace) : presentation.replaceAllText(req.find, req.replace);
  return { replaced: replaced, scope: slide ? 'slide' : 'presentation' };
}

function appendTextBox_(presentation, req) {
  require_(req.text, 'text');
  var slide = slideAt_(presentation, req);
  var shape = slide.insertTextBox(
    String(req.text),
    req.x === undefined ? 72 : req.x,
    req.y === undefined ? 72 : req.y,
    req.width === undefined ? 576 : req.width,
    req.height === undefined ? 48 : req.height
  );
  var style = req.style || {};
  var textStyle = shape.getText().getTextStyle();
  if (style.fontSize !== undefined) textStyle.setFontSize(style.fontSize);
  if (style.fontFamily) textStyle.setFontFamily(style.fontFamily);
  if (style.foregroundColor) textStyle.setForegroundColor(style.foregroundColor);
  if (style.bold !== undefined) textStyle.setBold(style.bold);
  if (style.italic !== undefined) textStyle.setItalic(style.italic);
  return { objectId: shape.getObjectId(), slideId: slide.getObjectId() };
}

function insertShape_(presentation, req) {
  var slide = slideAt_(presentation, req);
  var type = req.shapeType === 'ROUND_RECTANGLE'
    ? SlidesApp.ShapeType.ROUND_RECTANGLE
    : SlidesApp.ShapeType.RECTANGLE;
  var shape = slide.insertShape(
    type,
    req.x === undefined ? 72 : req.x,
    req.y === undefined ? 72 : req.y,
    req.width === undefined ? 240 : req.width,
    req.height === undefined ? 120 : req.height
  );
  if (req.fill) shape.getFill().setSolidFill(req.fill);
  if (req.text) {
    shape.getText().setText(String(req.text));
    var style = req.style || {};
    var textStyle = shape.getText().getTextStyle();
    if (style.fontSize !== undefined) textStyle.setFontSize(style.fontSize);
    if (style.fontFamily) textStyle.setFontFamily(style.fontFamily);
    if (style.foregroundColor) textStyle.setForegroundColor(style.foregroundColor);
    if (style.bold !== undefined) textStyle.setBold(style.bold);
  }
  return { objectId: shape.getObjectId(), slideId: slide.getObjectId() };
}

function insertImage_(presentation, req) {
  require_(req.url, 'url');
  var slide = slideAt_(presentation, req);
  var image = slide.insertImage(
    req.url,
    req.x === undefined ? 72 : req.x,
    req.y === undefined ? 72 : req.y,
    req.width === undefined ? 240 : req.width,
    req.height === undefined ? 160 : req.height
  );
  return { objectId: image.getObjectId(), slideId: slide.getObjectId() };
}

function setBackground_(presentation, req) {
  require_(req.color, 'color');
  var slide = slideAt_(presentation, req);
  slide.getBackground().setSolidFill(req.color);
  return { slideId: slide.getObjectId(), color: req.color };
}

function copySlide_(presentation, req) {
  require_(req.sourcePresentationId, 'sourcePresentationId');
  var source = SlidesApp.openById(req.sourcePresentationId);
  var sourceSlide = slideAt_(source, {
    slideId: req.sourceSlideId,
    slideIndex: req.sourceSlideIndex
  });
  var copied = req.insertionIndex === undefined || req.insertionIndex === null
    ? presentation.appendSlide(sourceSlide)
    : presentation.insertSlide(req.insertionIndex, sourceSlide);
  return {
    slideId: copied.getObjectId(),
    index: slideIndex_(presentation, copied),
    sourcePresentationId: source.getId()
  };
}
