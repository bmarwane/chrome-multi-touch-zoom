/**
EDITED FOR THE PURPOSE OF USING WITH CHROME ON LINUX
ONLY SHIFT+SCROLL FUNCTIONALITY IMPLEMENTED

Multi-touch zoom extension for Firefox
Enables smooth pinch to zoom on desktop

Requires Firefox 55 or greater

@Author: George Corney / haxiomic
@Website: http://github.com/haxiomic
@Email: haxiomic@gmail.com

Please report issues to the github repository
	https://github.com/haxiomic/firefox-multi-touch-zoom

Feel free to get in touch via email if you have any questions

**/

// view scaling parameters and other options
const scaleMode = 1; // 0 = always high quality, 1 = low-quality while zooming
const minScale = 1.0;
const maxScale = 10;
const zoomSpeedMultiplier = 0.03 / 5;
const overflowTimeout_ms = 400;
const highQualityWait_ms = 40;
const alwaysHighQuality = false;

let horizontalOriginShift = 0; // > 0 to the right,  < 0 to the left
let verticalOriginShift = 0; // > 0 down, < 0 up
let originMoveRate = 10;

// settings
let shiftKeyZoom = true; // enable zoom with shift + scroll by default
let pinchZoomSpeed = 0.7;
let disableScrollbarsWhenZooming = false;

// state
let pageScale = 1;
let translationX = 0;
let translationY = 0;
let overflowTranslationX = 0;
let overflowTranslationY = 0;

// elements
let pageElement = document.documentElement;
let scrollBoxElement = document.documentElement; // this is the scroll-box
let wheelEventElement = document.documentElement;
let scrollEventElement = window;

const quirksMode = document.compatMode === 'BackCompat';

// if the pageElement is missing a doctype or the doctype is set to < HTML 4.01 then Firefox renders in quirks mode
// we cannot use the scroll fields on the <html> element, instead we must use the body
// "(quirks mode bug 211030) The scrollLeft, scrollTop, scrollWidth, and scrollHeight properties are relative to BODY in quirks mode (instead of HTML)."
if (quirksMode) {
	scrollBoxElement = document.body;
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

// browser-hint optimization - I found this causes issues with some sites like maps.google.com
// pageElement.style.willChange = 'transform';


let mouseX, mouseY;
let shoudFollowMouse = false;
let canFollowMouse = false;


document.onmousemove = (e) => {
  if(!canFollowMouse) return;
  if (shoudFollowMouse && mouseX && mouseY) {
    //window.scrollBy(e.clientX - mouseX, e.clientY - mouseY);
    horizontalOriginShift+= e.clientX - mouseX;
    verticalOriginShift+= e.clientY - mouseY;

    pageElement.style.setProperty('transform-origin', `${horizontalOriginShift}px ${verticalOriginShift}px`, 'important');
  }

  // Store current position
  mouseX = e.clientX;
  mouseY = e.clientY;
};


// cmd + 0 or ctrl + 0 to restore zoom
window.addEventListener('keydown', (e) => {
	if (e.key == '0' && e.ctrlKey) {
		resetScale();
    return;
	}

  shoudFollowMouse = !!e.shiftKey;
});

window.addEventListener('keyup', (e) => {
  shoudFollowMouse = !!e.shiftKey;
});

// because scroll top/left are handled as integers only, we only read the translation from scroll once scroll has changed
// if we didn't, our translation would have ugly precision issues => setTranslationX(4.5) -> translationX = 4
let ignoredScrollLeft = null;
let ignoredScrollTop = null;
function updateTranslationFromScroll(){
	if (scrollBoxElement.scrollLeft !== ignoredScrollLeft) {
		translationX = -scrollBoxElement.scrollLeft;
		ignoredScrollLeft = null;
	}
	if (scrollBoxElement.scrollTop !== ignoredScrollTop) {
		translationY = -scrollBoxElement.scrollTop;
		ignoredScrollTop = null;
	}
}
// https://github.com/rochal/jQuery-slimScroll/issues/316
scrollEventElement.addEventListener(`scroll`, updateTranslationFromScroll, { capture: false, passive: false });

wheelEventElement.addEventListener(`wheel`, (e) => {
	if (e.shiftKey && shiftKeyZoom) {
		if (e.defaultPrevented) return;

		let x = e.clientX - scrollBoxElement.offsetLeft;
		let y = e.clientY - scrollBoxElement.offsetTop;
		// x in non-scrolling, non-transformed coordinates relative to the scrollBoxElement
		// 0 is always the left side and <width> is always the right side

		let deltaMultiplier = pinchZoomSpeed * zoomSpeedMultiplier;

		let newScale = pageScale + e.deltaY * deltaMultiplier;
		let scaleBy = pageScale/newScale;

		applyScale(scaleBy, x, y, false);

		e.preventDefault();
		e.stopPropagation();
	} else {
		// e.preventDefault();
		restoreControl();
	}
}, { capture: false, passive: false });

scrollBoxElement.addEventListener(`mousemove`, restoreControl);
scrollBoxElement.addEventListener(`mousedown`, restoreControl);

let controlDisabled = false;
function disableControl() {
	if (controlDisabled) return;

	if (disableScrollbarsWhenZooming) {
		let verticalScrollBarWidth = window.innerWidth - pageElement.clientWidth;
		let horizontalScrollBarWidth = window.innerHeight - pageElement.clientHeight;

		// disable scrolling for performance
		pageElement.style.setProperty('overflow', 'hidden', 'important');

		// since we're disabling a scrollbar we need to apply a margin to replicate the offset (if any) it introduced
		// this prevent the page from being shifted about as the scrollbar is hidden and shown
		pageElement.style.setProperty('margin-right', verticalScrollBarWidth + 'px', 'important');
		pageElement.style.setProperty('margin-bottom', horizontalScrollBarWidth + 'px', 'important');
	}

	// document.body.style.pointerEvents = 'none';
	controlDisabled = true;
}

function restoreControl() {
	if (!controlDisabled) return;
	// scrolling must be enabled for panning
	pageElement.style.overflow = 'auto';
	pageElement.style.marginRight = '';
	pageElement.style.marginBottom = '';
	// document.body.style.pointerEvents = '';
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
		// scaleX/scaleY
		pageElement.style.setProperty('transform', `scaleX(${pageScale}) scaleY(${pageScale})`, 'important');
	} else {
		// perspective (reduced quality but faster)
		let p = 1; // what's the best value here?
		let z = p - p/pageScale;

		pageElement.style.setProperty('transform', `perspective(${p}px) translateZ(${z}px)`, 'important');

		// wait a short period before restoring the quality
		// we use a timeout for trackpad because we can't detect when the user has finished the gesture on the hardware
		// we can only detect gesture update events ('wheel' + ctrl)
        window.clearTimeout(qualityTimeoutHandle);
        qualityTimeoutHandle = setTimeout(function(){
        pageElement.style.setProperty('transform', `scaleX(${pageScale}) scaleY(${pageScale})`, 'important');
        }, highQualityWait_ms);
	}

	pageElement.style.setProperty('transform-origin', `${horizontalOriginShift}px ${verticalOriginShift}px`, 'important');

	// hack to restore normal behavior that's upset after applying the transform
	pageElement.style.position = `relative`;
	pageElement.style.height = `100%`;

	// when translation is positive, the offset is applied via left/top positioning
	// negative translation is applied via scroll
	if (minScale < 1) {
		pageElement.style.setProperty('left', `${Math.max(translationX, 0) - overflowTranslationX}px`, 'important');
		pageElement.style.setProperty('top', `${Math.max(translationY, 0) - overflowTranslationY}px`, 'important');
	}

	// weird performance hack - is it batching the changes?
	pageElement.style.transitionProperty = `transform, left, top`;
	pageElement.style.transitionDuration = `0s`;

	if (shouldDisableControl) {
		disableControl();
		clearTimeout(overflowTimeoutHandle);
		overflowTimeoutHandle = setTimeout(function(){
			restoreControl();
		}, overflowTimeout_ms);
	}
}

function applyScale(scaleBy, x_scrollBoxElement, y_scrollBoxElement) {
	// x/y coordinates in untransformed coordinates relative to the scroll container
	// if the container is the window, then the coordinates are relative to the window
	// ignoring any scroll offset. The coordinates do not change as the page is transformed

	function getTranslationX(){ return translationX; }
	function getTranslationY(){ return translationY; }
	function setTranslationX(v) {
		// clamp v to scroll range
		// this limits minScale to 1
		v = Math.min(v, 0);
		v = Math.max(v, -(scrollBoxElement.scrollWidth - scrollBoxElement.clientWidth));

		translationX = v;

		scrollBoxElement.scrollLeft = Math.max(-v, 0);
		ignoredScrollLeft = scrollBoxElement.scrollLeft;

		// scroll-transform what we're unable to apply
		// either there is no scroll-bar or we want to scroll past the end
		overflowTranslationX = v < 0 ? Math.max((-v) - (scrollBoxElement.scrollWidth - scrollBoxElement.clientWidth), 0) : 0;
	}
	function setTranslationY(v) {
		// clamp v to scroll range
		// this limits minScale to 1
		v = Math.min(v, 0);
		v = Math.max(v, -(scrollBoxElement.scrollHeight - scrollBoxElement.clientHeight));

		translationY = v;

		scrollBoxElement.scrollTop = Math.max(-v, 0);
		ignoredScrollTop = scrollBoxElement.scrollTop;

		overflowTranslationY = v < 0 ? Math.max((-v) - (scrollBoxElement.scrollHeight - scrollBoxElement.clientHeight), 0) : 0;
	}

	// resize pageElement
	let pageScaleBefore = pageScale;
	pageScale *= scaleBy;
	pageScale = Math.min(Math.max(pageScale, minScale), maxScale);
	let effectiveScale = pageScale/pageScaleBefore;

  if(pageScale === 1) {
    canFollowMouse = false;
  } else {
    canFollowMouse = true;
  }

  if(pageScale === 1 && (horizontalOriginShift || verticalOriginShift)) {
    horizontalOriginShift = 0;
    verticalOriginShift = 0;
  }

	// when we hit min/max scale we can early exit
	if (effectiveScale === 1) return;

	updateTransform(null, null);

    //zx and zy are the absolute coordinates of the mouse on the screen
	let zx = x_scrollBoxElement;
	let zy = y_scrollBoxElement;

	// calculate new xy-translation
	let tx = getTranslationX();
	tx = (tx - zx) * (effectiveScale) + zx;

	let ty = getTranslationY();
	ty = (ty - zy) * (effectiveScale) + zy;

	// apply new xy-translation
	setTranslationX(tx);
	setTranslationY(ty);

	updateTransform(null, null);
}

function resetScale() {
	// reset state
	pageScale = 1;
	translationX = 0;
	translationY = 0;
	overflowTranslationX = 0;
	overflowTranslationY = 0;
  horizontalOriginShift = 0;
  verticalOriginShift = 0;

	let scrollLeftBefore = scrollBoxElement.scrollLeft;
	let scrollLeftMaxBefore = scrollBoxElement.scrollMax;
	let scrollTopBefore = scrollBoxElement.scrollTop;
	let scrollTopMaxBefore = (scrollBoxElement.scrollHeight - scrollBoxElement.clientHeight);
	updateTransform(0, false, false);

	// restore scroll
	scrollBoxElement.scrollLeft = (scrollLeftBefore/scrollLeftMaxBefore) * (scrollBoxElement.scrollWidth - scrollBoxElement.clientWidth);
	scrollBoxElement.scrollTop = (scrollTopBefore/scrollTopMaxBefore) * (scrollBoxElement.scrollHeight - scrollBoxElement.clientHeight);

	updateTranslationFromScroll();

	// undo other css changes
	pageElement.style.overflow = '';
	// document.body.style.pointerEvents = '';
}
