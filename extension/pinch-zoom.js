// view scaling parameters and other options
const scaleMode = 1; // 0 = always high quality, 1 = low-quality while zooming
const minScale = 1.0;
const maxScale = 10;
const zoomSpeedMultiplier = 0.03 / 5;
const overflowTimeout_ms = 400;
const highQualityWait_ms = 40;
const alwaysHighQuality = false;
const KeyboardZoomMultiplier = 100;

let horizontalOriginShift = 0; // > 0 to the right,  < 0 to the left
let verticalOriginShift = 0; // > 0 down, < 0 up
let originMoveRate = 10;

// settings
let shiftKeyZoom = true; // enable zoom with shift + scroll by default
let pinchZoomSpeed = 0.5;
let disableScrollbarsWhenZooming = false;

// state
let pageScale = 1;
let translationX = 0;
let translationY = 0;
let overflowTranslationX = 0;
let overflowTranslationY = 0;

// elements
let pageElement = document.documentElement;
let wheelEventElement = document.documentElement;
let scrollEventElement = window;

const quirksMode = document.compatMode === 'BackCompat';

function getScrollBoxElement() {
    return document.documentElement || document.body;
}

// apply user settings
chrome.storage.local.get([
    'mtzoom_shiftkey',
    'mtzoom_speed',
    'mtzoom_disableScrollbarsWhenZooming',
], function (res) {
    if (res.mtzoom_shiftkey != null) {
        shiftKeyZoom = res.mtzoom_shiftkey;
    }
    if (res.mtzoom_speed != null) {
        pinchZoomSpeed = res.mtzoom_speed;
    }
    if (res.mtzoom_disableScrollbarsWhenZooming != null) {
        disableScrollbarsWhenZooming = res.mtzoom_disableScrollbarsWhenZooming;
    }
});

let mouseX, mouseY;
let shouldFollowMouse = false;
let canFollowMouse = false;

document.onmousemove = (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
};

window.addEventListener('keydown', (e) => {
    if (e.shiftKey && e.keyCode === 107) {
        // Handle zoom in
        e.preventDefault();
        zoomIn(KeyboardZoomMultiplier);
    } else if (e.shiftKey && e.keyCode === 109) {
        // Handle zoom out
        e.preventDefault();
        zoomOut(KeyboardZoomMultiplier);
    } else {
        shouldFollowMouse = !!e.shiftKey;
    }
});

window.addEventListener('keyup', (e) => {
    shouldFollowMouse = !!e.shiftKey;
});

wheelEventElement.addEventListener('wheel', (e) => {
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

getScrollBoxElement().addEventListener('mousemove', restoreControl);
getScrollBoxElement().addEventListener('mousedown', restoreControl);

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

    // Calculate the relative position of the cursor within the viewport
    let relativeX = mouseX - window.scrollX;
    let relativeY = mouseY - window.scrollY;

    // Update the origin shift based on the cursor position
    horizontalOriginShift = relativeX;
    verticalOriginShift = relativeY;

    pageElement.style.setProperty('transform-origin', `${horizontalOriginShift}px ${verticalOriginShift}px`, 'important');

    pageElement.style.position = `relative`;
    pageElement.style.height = `100%`;

    if (shouldDisableControl) {
        disableControl();
        clearTimeout(overflowTimeoutHandle);
        overflowTimeoutHandle = setTimeout(function () {
            restoreControl();
        }, overflowTimeout_ms);
    }
}

function applyScale(scaleBy, x, y) {
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

    let zx = x;
    let zy = y;

    let tx = translationX;
    tx = (tx - zx) * effectiveScale + zx;

    let ty = translationY;
    ty = (ty - zy) * effectiveScale + zy;

    translationX = tx;
    translationY = ty;

    updateTransform(null, null);
}

function zoomIn(speedMultiplier) {
    let deltaMultiplier = pinchZoomSpeed * zoomSpeedMultiplier * speedMultiplier;
    let x = mouseX;
    let y = mouseY;
    let newScale = pageScale - deltaMultiplier;
    let scaleBy = pageScale / newScale;
    applyScale(scaleBy, x, y);
}

function zoomOut(speedMultiplier) {
    let deltaMultiplier = pinchZoomSpeed * zoomSpeedMultiplier * speedMultiplier;
    let x = mouseX;
    let y = mouseY;
    let newScale = pageScale + deltaMultiplier;
    let scaleBy = pageScale / newScale;
    applyScale(scaleBy, x, y);
}
