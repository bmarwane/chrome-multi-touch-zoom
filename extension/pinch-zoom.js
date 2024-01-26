const scaleMode = 1;
const minScale = 1.0;
const maxScale = 10;
const zoomSpeedMultiplier = 0.03 / 5;
const overflowTimeout_ms = 400;
const highQualityWait_ms = 40;
const alwaysHighQuality = false;

let horizontalOriginShift = 0;
let verticalOriginShift = 0;
let originMoveRate = 10;

let shiftKeyZoom = true;
let pinchZoomSpeed = 0.7;
let disableScrollbarsWhenZooming = true;

let pageScale = 1;
let translationX = 0;
let translationY = 0;
let overflowTranslationX = 0;
let overflowTranslationY = 0;

let pageElement = document.documentElement;
let wheelEventElement = document.documentElement;
let scrollEventElement = window;

const quirksMode = document.compatMode === 'BackCompat';

function getScrollBoxElement() {
  return document.documentElement || document.body;
}

let mouseX, mouseY;
let shouldFollowMouse = false;
let canFollowMouse = false;

document.onmousemove = (e) => {
  if (!canFollowMouse) return;
  if (shouldFollowMouse && mouseX && mouseY) {
    horizontalOriginShift += e.clientX - mouseX;
    verticalOriginShift += e.clientY - mouseY;
    pageElement.style.setProperty('transform-origin', `${horizontalOriginShift}px ${verticalOriginShift}px`, 'important');
  }

  mouseX = e.clientX;
  mouseY = e.clientY;
};

window.addEventListener('keydown', (e) => {
  if (e.key == '0' && e.ctrlKey) {
    resetScale();
    return;
  }

  shouldFollowMouse = !!e.shiftKey;

  // Zoom in with Numpad Plus
  if (e.shiftKey && e.keyCode === 109) {
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let deltaMultiplier = pinchZoomSpeed * zoomSpeedMultiplier;
    let newScale = pageScale + deltaMultiplier;
    let scaleBy = pageScale / newScale;
    applyScale(scaleBy, x, y);
    e.preventDefault();
    e.stopPropagation();
  }

  // Zoom out with Numpad Minus
  if (e.shiftKey && e.keyCode === 107) {
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let deltaMultiplier = pinchZoomSpeed * zoomSpeedMultiplier;
    let newScale = pageScale - deltaMultiplier;
    let scaleBy = pageScale / newScale;
    applyScale(scaleBy, x, y);
    e.preventDefault();
    e.stopPropagation();
  }
});

window.addEventListener('keyup', (e) => {
  shouldFollowMouse = !!e.shiftKey;
});

let ignoredScrollLeft = null;
let ignoredScrollTop = null;

function updateTranslationFromScroll() {
  if (getScrollBoxElement().scrollLeft !== ignoredScrollLeft) {
    translationX = -getScrollBoxElement().scrollLeft;
    ignoredScrollLeft = null;
  }
  if (getScrollBoxElement().scrollTop !== ignoredScrollTop) {
    translationY = -getScrollBoxElement().scrollTop;
    ignoredScrollTop = null;
  }
}

scrollEventElement.addEventListener(`scroll`, updateTranslationFromScroll, { capture: false, passive: false });

wheelEventElement.addEventListener(`wheel`, (e) => {
  if (e.shiftKey && shiftKeyZoom) {
    if (e.defaultPrevented) return;
    let x = e.clientX - getScrollBoxElement().offsetLeft;
    let y = e.clientY - getScrollBoxElement().offsetTop;
    let deltaMultiplier = pinchZoomSpeed * zoomSpeedMultiplier;
    let newScale = pageScale + e.deltaY * deltaMultiplier;
    let scaleBy = pageScale / newScale;
    applyScale(scaleBy, x, y);
    e.preventDefault();
    e.stopPropagation();
  } else {
    restoreControl();
  }
}, { capture: false, passive: false });

getScrollBoxElement().addEventListener(`mousemove`, restoreControl);
getScrollBoxElement().addEventListener(`mousedown`, restoreControl);

let controlDisabled = false;

function disableControl() {
  if (controlDisabled) return;

  if (disableScrollbarsWhenZooming) {
    let verticalScrollBarWidth = window.innerWidth - pageElement.clientWidth;
    let horizontalScrollBarWidth = window.innerHeight - pageElement.clientHeight;
    pageElement.style.setProperty('overflow', 'hidden', 'important');
    pageElement.style.setProperty('margin-right', verticalScrollBarWidth + 'px', 'important');
    pageElement.style.setProperty('margin-bottom', horizontalScrollBarWidth + 'px', 'important');
  }

  controlDisabled = true;
}

function restoreControl() {
  if (!controlDisabled) return;
  pageElement.style.overflow = 'auto';
  pageElement.style.marginRight = '';
  pageElement.style.marginBottom = '';
  controlDisabled = false;
}

let qualityTimeoutHandle = null;
let overflowTimeoutHandle = null;

function updateTransform(scaleModeOverride, shouldDisableControl) {
  if (shouldDisableControl == null) {
    shouldDisableControl = true;
  }

  let sm = scaleModeOverride == null ? scaleMode : scaleModeOverride;

  if (sm === 0 || alwaysHighQuality) {
    pageElement.style.setProperty('transform', `scaleX(${pageScale}) scaleY(${pageScale})`, 'important');
  } else {
    let p = 1;
    let z = p - p / pageScale;
    pageElement.style.setProperty('transform', `perspective(${p}px) translateZ(${z}px)`, 'important');
    window.clearTimeout(qualityTimeoutHandle);
    qualityTimeoutHandle = setTimeout(function () {
      pageElement.style.setProperty('transform', `scaleX(${pageScale}) scaleY(${pageScale})`, 'important');
    }, highQualityWait_ms);
  }

  pageElement.style.setProperty('transform-origin', `${horizontalOriginShift}px ${verticalOriginShift}px`, 'important');
  pageElement.style.position = `relative`;
  pageElement.style.height = `100%`;
  pageElement.style.transitionProperty = `transform, left, top`;
  pageElement.style.transitionDuration = `0s`;

  if (shouldDisableControl) {
    disableControl();
    clearTimeout(overflowTimeoutHandle);
    overflowTimeoutHandle = setTimeout(function () {
      restoreControl();
    }, overflowTimeout_ms);
  }
}

function applyScale(scaleBy, x_scrollBoxElement, y_scrollBoxElement) {
  function getTranslationX() { return translationX; }
  function getTranslationY() { return translationY; }
  function setTranslationX(v) {
    v = Math.min(v, 0);
    v = Math.max(v, -(getScrollBoxElement().scrollWidth - getScrollBoxElement().clientWidth));
    translationX = v;
    getScrollBoxElement().scrollLeft = Math.max(-v, 0);
    ignoredScrollLeft = getScrollBoxElement().scrollLeft;
    overflowTranslationX = v < 0 ? Math.max((-v) - (getScrollBoxElement().scrollWidth - getScrollBoxElement().clientWidth), 0) : 0;
  }
  function setTranslationY(v) {
    v = Math.min(v, 0);
    v = Math.max(v, -(getScrollBoxElement().scrollHeight - getScrollBoxElement().clientHeight));
    translationY = v;
    getScrollBoxElement().scrollTop = Math.max(-v, 0);
    ignoredScrollTop = getScrollBoxElement().scrollTop;
    overflowTranslationY = v < 0 ? Math.max((-v) - (getScrollBoxElement().scrollHeight - getScrollBoxElement().clientHeight), 0) : 0;
  }

  let pageScaleBefore = pageScale;
  pageScale *= scaleBy;
  pageScale = Math.min(Math.max(pageScale, minScale), maxScale);
  let effectiveScale = pageScale / pageScaleBefore;

  if (pageScale === 1) {
    canFollowMouse = false;
  } else {
    canFollowMouse = true;
  }

  if (pageScale === 1 && (horizontalOriginShift || verticalOriginShift)) {
    horizontalOriginShift = 0;
    verticalOriginShift = 0;
  }

  if (effectiveScale === 1) return;

  updateTransform(null, null);

  let zx = x_scrollBoxElement;
  let zy = y_scrollBoxElement;

  let tx = getTranslationX();
  tx = (tx - zx) * (effectiveScale) + zx;

  let ty = getTranslationY();
  ty = (ty - zy) * (effectiveScale) + zy;

  setTranslationX(tx);
  setTranslationY(ty);

  updateTransform(null, null);
}

function resetScale() {
  pageScale = 1;
  translationX = 0;
  translationY = 0;
  overflowTranslationX = 0;
  overflowTranslationY = 0;
  horizontalOriginShift = 0;
  verticalOriginShift = 0;

  let scrollLeftBefore = getScrollBoxElement().scrollLeft;
  let scrollLeftMaxBefore = getScrollBoxElement().scrollMax;
  let scrollTopBefore = getScrollBoxElement().scrollTop;
  let scrollTopMaxBefore = (getScrollBoxElement().scrollHeight - getScrollBoxElement().clientHeight);
  updateTransform(0, false, false);

  getScrollBoxElement().scrollLeft = (scrollLeftBefore / scrollLeftMaxBefore) * (getScrollBoxElement().scrollWidth - getScrollBoxElement().clientWidth);
  getScrollBoxElement().scrollTop = (scrollTopBefore / scrollTopMaxBefore) * (getScrollBoxElement().scrollHeight - getScrollBoxElement().clientHeight);

  updateTranslationFromScroll();

  pageElement.style.overflow = '';
}
