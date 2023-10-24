import * as Memory from "./memory.js"

/**
 * @readonly
 * @enum {keyof typeof Screen}
 */
export const Screen = {
	/** @type {"wav"} */
	wav: "wav",
	/** @type {"env"} */
	env: "env",
	/** @type {"mix"} */
	mix: "mix",
	/** @type {"fx"} */
	fx: "fx"
}

export const DPI = 3

/**
 * @typedef {Object} StyleMap
 * @prop {string} fill
 * @prop {string} line
 * @prop {string} [text]
 * @prop {string} [font]
 */

/** @param {string} prop */
function getStyle(prop, sel = ".screen") {
	let root = document.documentElement
	let el = /** @type {HTMLElement} */ (root.querySelector(sel))
	let vvv = "--" + prop
	console.log(
		root,
		el,
		prop,
		el.style.getPropertyValue(prop),
		el.style.getPropertyValue(vvv),
		getComputedStyle(el).getPropertyValue(vvv),
		getComputedStyle(el).getPropertyValue(prop),
		root.style.getPropertyValue(vvv),
		getComputedStyle(root).getPropertyValue(prop),
		getComputedStyle(root).getPropertyValue(vvv)
	)
	return (
		(el && el.style.getPropertyValue(vvv)) ||
		root.style.getPropertyValue(vvv) ||
		(el && getComputedStyle(el)[vvv]) ||
		getComputedStyle(root)[vvv]
	)
}

/**
 * @typedef {Record<string, StyleMap>} StyleMaps
 * @returns {StyleMaps}
 */
function getStyles() {
	let screenElement = /** @type {HTMLElement} */ (
		document.querySelector(".screen")
	)
	// todo --screen-fill
	let fill = getStyle("screen-fill")
	let line = getStyle("screen-line")
	let boxOnLine = getStyle("boxOnLine")
	let boxOffLine = getStyle("boxOffLine")
	let fontFamily = getComputedStyle(screenElement).fontFamily
	let regionFill = getStyle("region-fill")
	let drawingRegionFill = getStyle("drawing-region-fill")
	let regionLine = getStyle("region-line")
	let drawingRegionLine = getStyle("drawing-region-line")
	let fontSize = 23 * DPI
	let font = `${fontSize}px ${fontFamily}`

	return {
		normal: {
			fill,
			line,
			text: line,
			font
		},
		boxOn: {
			fill: "transparent",
			line: boxOnLine
		},
		boxOff: {
			fill: "transparent",
			line: boxOffLine
		},
		region: {
			fill: regionFill,
			line: regionLine
		},
		drawingRegion: {
			fill: drawingRegionFill,
			line: drawingRegionLine
		}
	}
}

export let IS_BASICALLY_A_PHONE =
	typeof window != "undefined" &&
	window.matchMedia("(pointer: coarse)").matches

/** @type {Memory.MemoryMap} */
let memory

/** @type {HTMLCanvasElement} */
let canvas

/** @type {Worker} */
let screenWorker

/**
 * @param {number} pageX
 * @param {DOMRectReadOnly} bounds
 */
function getX(pageX, bounds) {
	// TODO
	// let bounds = canvas.getBoundingClientRect()

	return pageX < bounds.left
		? 0
		: pageX > bounds.right
		? canvas.width
		: (pageX - bounds.left) * 3
}

// why is this in this file
// todo make this work for both TouchEvent and MouseEvent
/** @param {MouseEvent} event */
function startSelectingRegion(event) {
	// assumes nothing ever changes size while you're trying to trim a sample
	let bounds = canvas.getBoundingClientRect()
	Memory.drawingRegionStart(memory, getX(event.pageX, bounds))
	/** @param {MouseEvent} event */
	function mousemove(event) {
		if (Memory.regionIsBeingDrawn(memory)) {
			Memory.drawingRegionX(memory, getX(event.pageX, bounds))
		}
	}
	window.addEventListener("mousemove", mousemove)

	/** @param {MouseEvent} event */
	function drawingRegionComplete(event) {
		Memory.drawingRegionEnd(memory, getX(event.pageX, bounds))
		window.removeEventListener("mousemove", mousemove)
	}

	window.addEventListener("mouseup", drawingRegionComplete, {once: true})
}

/**
 * @param {Touch} finger
 * @param {TouchList} touches
 * @returns {Touch?}
 */
function findFinger(finger, touches) {
	return [].find.call(
		touches,
		/** @param {Touch} touch */
		touch => touch.identifier == finger.identifier
	)
}

/** @param {TouchEvent} event */
function startSelectingRegionWithFinger(event) {
	// assumes nothing ever changes size while you're trying to drawingRegion a sample
	let bounds = canvas.getBoundingClientRect()
	let finger = event.touches.item(0)
	Memory.drawingRegionStart(memory, getX(finger.pageX, bounds))
	/** @param {TouchEvent} event */
	function move(event) {
		if (Memory.regionIsBeingDrawn(memory)) {
			/** @type {Touch} */
			let moved = findFinger(finger, event.changedTouches)
			if (moved) {
				Memory.drawingRegionX(memory, getX(moved.pageX, bounds))
			}
		}
	}
	window.addEventListener("touchmove", move)
	window.addEventListener(
		"touchend",
		/** @param {TouchEvent} event */
		function (event) {
			let lost = findFinger(finger, event.changedTouches)
			if (lost) {
				Memory.drawingRegionEnd(memory, getX(lost.pageX, bounds))
				window.removeEventListener("touchmove", move)
			}
		},
		{once: true}
	)
}

export let alreadyFancy = false

export function fancy() {
	return alreadyFancy
}

/**
 * @param {Screen} mode
 */
export function switchScreen(mode) {
	/** @type {HTMLElement} */
	let screen = document.querySelector(".screen")
	let currentMode = screen.dataset.mode
	if (mode == currentMode) return
	screen.dataset.mode = mode
	let currentModeElement = screen.getElementsByClassName(currentMode)[0]
	let modeElement = screen.getElementsByClassName(mode)[0]

	if (modeElement) {
		modeElement.removeAttribute("hidden")
		screenWorker.postMessage({
			type: "mode",
			mode
		})
		currentModeElement.setAttribute("hidden", "hidden")
	} else {
		console.error(`tried to switch to bad screen: ${mode}`)
	}
}

export function theme(/**@type string*/ _name) {
	// todo load theme
	screenWorker.postMessage({
		type: "styles",
		styles: getStyles()
	})
}

let alreadyInit = false
/**
 * @param {HTMLCanvasElement} c
 */
export async function init(c) {
	if (alreadyInit) return
	alreadyInit = true
	screenWorker = new Worker("/screen.work.js", {type: "module"})
	canvas = c
	// starring lindsey lohan
	let parentBounds = canvas.parentElement.getBoundingClientRect()

	canvas.height = parentBounds.height * DPI
	canvas.width = parentBounds.width * DPI

	let offscreen = canvas.transferControlToOffscreen()
	screenWorker.postMessage(
		{
			type: "init",
			canvas: offscreen,
			styles: getStyles()
		},
		[offscreen]
	)

	let tapeElement = document.querySelector(".tape .svg")
	try {
		let svgresponse = await fetch("graphics/cassette.svg")
		let svg = await svgresponse.text()
		tapeElement.innerHTML = svg
	} catch (error) {
		console.error("didn't get svg, recording will be confusing :(", error)
	}
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {SharedArrayBuffer} buffer
 */
export function start(canvas, buffer) {
	screenWorker.postMessage({type: "start", buffer})
	screenWorker.onmessage = onWorkerMessage
	memory = Memory.map(buffer)

	if (IS_BASICALLY_A_PHONE) {
		canvas.addEventListener("touchstart", startSelectingRegionWithFinger, {
			passive: true
		})
	} else {
		canvas.addEventListener("mousedown", startSelectingRegion, {
			passive: true
		})
	}

	alreadyFancy = true
}

/**
 * Handle messages from the waveform worker
 * @param {MessageEvent} event
 */

function onWorkerMessage(event) {
	let {type, ...message} = event.data
	if (type == "waveform") {
		document.dispatchEvent(
			new CustomEvent("waveform", {
				detail: message
			})
		)
	}
}
