import "./extend-native-prototypes.js"
import * as graphics from "./graphics.js"
import * as Memory from "./memory.js"

let {DPI} = graphics

/** @type {graphics.StyleMaps}*/
let styles

/**
 * @type {OffscreenCanvasRenderingContext2D} context
 */
let context

/**
 * @type {Memory.MemoryMap} [memory]
 */
let memory

/**
 * Clear the canvas and reset the tools
 * @param {OffscreenCanvasRenderingContext2D} context
 */
function clear(context) {
	if (!context) return
	let canvas = context.canvas
	let {width, height} = canvas
	context.restore()
	context.clearRect(0, 0, width, height)
	context.fillStyle = styles.normal.fill
	context.strokeStyle = styles.normal.line
	context.lineWidth = DPI
}

/**
 * draw a full-height rectangle between `start` and `end`
 * @param {number} start
 * @param {number} end
 * @param {string} fill fillStyle
 */
function fillRegion(start, end, fill) {
	context.fillStyle = fill
	context.fillRect(start, 0, end - start, context.canvas.height)
}

function drawSampleLine({style, array, x, xm, height}) {
	context.beginPath()
	context.strokeStyle = style.line
	context.lineWidth = style.width || DPI
	// trying to make it inversely correlated with the size input so smaller
	// samples have more accuracy
	// cleverer than this would be to move in chunks of 10 and draw their average
	let skip = 32
	for (let index in array) {
		let idx = Number(index)
		let f32 = array.at(idx)
		// Safari's canvas is so slow when drawing big paths. So i'll drop some
		// accuracy.
		// TODO check how slow this is on low-powered devices !!
		// TODO keep accuracy high when the sample is small
		// TODO keep accurancy high when not on safari!!!
		if (idx % skip) {
			continue
		}
		x += xm * skip

		context.lineTo(
			x,
			height - (f32 * getYMultiplier(context) + getZeroPoint(context))
		)
	}

	context.stroke()
	return x
}

/**
 * @param {Memory.StepDetails | Memory.SoundDetails} one
 * @param {Memory.StepDetails | Memory.SoundDetails} two
 */
function same(one, two) {
	if (Object.is(one, two)) return true
	if (!two) {
		return false
	}
	let entries = Object.entries(one)

	for (let [key, value] of entries) {
		if (typeof value == "number" || typeof value == "boolean") {
			if (one[key] != two[key]) {
				return false
			}
		}
	}
	if ("region" in one && "region" in two) {
		if (
			one.region.start != two.region.start ||
			one.region.end != two.region.end
		) {
			return false
		}
	}
	return same
}

/**
 * @param {Memory.Region} region
 * @param {number} soundLength
 * @returns {Memory.Region}
 */
function getReversedRegion(region, soundLength) {
	return {
		start: soundLength - region.end,
		end: soundLength - region.start
	}
}
/**
 * Get the visible portion of a sound, in the right direction.
 *
 * @param {Memory.StepDetails} stepDetails
 */
function getVisibleSound(stepDetails) {
	let {sound, soundLength, reversed} = stepDetails
	let visibleSound = sound.subarray(0, soundLength)
	if (reversed) {
		let reversedVisibleSound
		// TODO replace with toReversed when support is better (february 2024)
		reversedVisibleSound = new Float32Array(visibleSound.length)
		reversedVisibleSound.set(visibleSound)
		reversedVisibleSound.reverse()
		visibleSound = reversedVisibleSound
	}
	return visibleSound
}

// todo use indexeddb for the bitmap cache:)
let bitmapCache = {}
/**
 * Create and post the bitmap for a step

 * @param {Memory.MemoryMap} memory
 * @param {OffscreenCanvasRenderingContext2D} context
 * @param {number} layer
 * @param {number} step
 */
function postBitmap(memory, context, layer, step) {
	clear(context)

	let stepDetails = Memory.getStepDetails(memory, layer, step)
	let {region, reversed, soundLength, version} = stepDetails
	let visibleSound = getVisibleSound(stepDetails)
	let hasRegion = region.start || region.end
	let reversedRegion = getReversedRegion(region, visibleSound.length)
	let length = hasRegion ? region.end - region.start : soundLength

	let r = reversed ? reversedRegion : region
	let start = hasRegion ? r.start : 0
	let end = hasRegion ? r.end : soundLength
	let array = visibleSound.subarray(start, end)
	let cachename = `s${start}e${end}r${reversed}v${version}p${layer}`

	if (!bitmapCache[cachename]) {
		let beforeheight = context.canvas.height
		let beforewidth = context.canvas.width
		let height = (context.canvas.height = 256)
		let width = (context.canvas.width = 256)
		drawSampleLine({
			style: styles.boxOnLine,
			array,
			x: 0,
			xm: width / length,
			height
		})
		let bmp = context.canvas.transferToImageBitmap()
		bitmapCache[cachename] = bmp
		context.canvas.height = beforeheight
		context.canvas.width = beforewidth
	}
	globalThis.postMessage({
		type: "waveform",
		bmp: bitmapCache[cachename],
		layer,
		step,
		cachename
	})
}

/**
 * Create and post the bitmap for a step

 * @param {Memory.MemoryMap} memory
 * @param {OffscreenCanvasRenderingContext2D} context
 */
function postAllBitmaps(memory, context) {
	let pidx = Memory.selectedLayer(memory)
	for (let sidx = 0; sidx < Memory.NUMBER_OF_STEPS; sidx++) {
		// if (Memory.stepOn(memory, pidx, sidx)) {
		postBitmap(memory, context, pidx, sidx)
		// }
	}
}

/**
 * @param {OffscreenCanvasRenderingContext2D} context
 */
function getZeroPoint(context) {
	return context.canvas.height / 2
}

/**
 * @param {OffscreenCanvasRenderingContext2D} context
 */
function getYMultiplier(context) {
	let verticalDistance = 2
	return context.canvas.height * (1 / verticalDistance)
}

/**
 * @param {OffscreenCanvasRenderingContext2D} context
 * @param {number} soundLength
 */
function getXMultiplier(context, soundLength) {
	return context.canvas.width / soundLength
}

let lastStepDetails
let lastSoundDetails
function update(_frame = 0, force = false) {
	if (!context || !memory) return
	let stepDetails = Memory.getSelectedStepDetails(memory)
	let soundDetails = Memory.getSoundDetails(
		memory,
		Memory.selectedLayer(memory)
	)

	let {canvas} = context
	let regionIsBeingDrawn = Memory.regionIsBeingDrawn(memory)

	if (!force && !regionIsBeingDrawn && same(stepDetails, lastStepDetails)) {
		return requestAnimationFrame(update)
	}

	clear(context)

	lastStepDetails = stepDetails
	// Send the current line to the window so it can be used as the step button's
	// background colour. Don't update while the region is being drawn, that's
	// silly and would be v slow
	// This'll clear the current canvas, so needs to be done before anything else
	// that means it has be be done synchronously too

	if (!same(soundDetails, lastSoundDetails)) {
		if (!regionIsBeingDrawn) {
			postAllBitmaps(memory, context)
		}
	}
	if (!regionIsBeingDrawn) {
		postBitmap(memory, context, stepDetails.layer, stepDetails.step)
	}
	lastSoundDetails = soundDetails

	let {region, reversed} = stepDetails

	let visibleSound = getVisibleSound(stepDetails)
	let width = canvas.width
	let height = canvas.height

	// the horizontal distance between each point
	let xm = getXMultiplier(context, visibleSound.length)
	Memory.drawingRegionXMultiplier(memory, xm)

	let drawingRegion = {
		start: Memory.drawingRegionStart(memory),
		// regionX because end will be -1 while region is being drawn
		end: Memory.drawingRegionX(memory)
	}

	if (drawingRegion.start > drawingRegion.end) {
		;[drawingRegion.start, drawingRegion.end] = [
			drawingRegion.end,
			drawingRegion.start
		]
	}

	let pixelRegion = {
		start: region.start * xm,
		end: region.end * xm
	}
	let hasRegion = pixelRegion.start || pixelRegion.end

	let reversedRegion = getReversedRegion(region, visibleSound.length)

	// this is more draws than the previous version, so it is slower.
	// but the logic is a lot simpler, so i am forgiven.
	// i am so bad at math lol
	// will experiment again if it's too slow on lower-powered devices
	drawSampleLine({
		style: styles.normal,
		array: visibleSound,
		x: 0,
		xm,
		height
	})

	if (hasRegion) {
		let fillStart = pixelRegion.start
		let fillEnd = pixelRegion.end
		if (reversed) {
			fillStart = width - pixelRegion.end
			fillEnd = width - pixelRegion.start
		}
		fillRegion(fillStart, fillEnd, styles.region.fill)
		let r = reversed ? reversedRegion : region
		let array = visibleSound.subarray(r.start, r.end)
		drawSampleLine({
			style: styles.region,
			array,
			x: fillStart,
			xm,
			height
		})
	}

	if (regionIsBeingDrawn) {
		fillRegion(
			drawingRegion.start,
			drawingRegion.end,
			styles.drawingRegion.fill
		)
		let s = (drawingRegion.start / xm) | 0
		let e = (drawingRegion.end / xm) | 0

		let array = visibleSound.subarray(s, e)

		drawSampleLine({
			style: styles.drawingRegion,
			array,
			x: drawingRegion.start,
			xm,
			height
		})
	}

	context.stroke()

	requestAnimationFrame(update)
}

let f = new FontFace("qp", 'url("/fonts/iosevka-qp-regular.ttf")')
f.load()

onmessage = async event => {
	let message = event.data

	if (message.type == "init") {
		let {canvas, styles: newStyles} = message
		styles = newStyles
		context = canvas.getContext("2d")
		context.save()
		context.fillStyle = styles.normal.fill
		context.fillRect(0, 0, canvas.width, canvas.height)
		context.lineWidth = DPI
		context.moveTo(0, canvas.height / 2)
		for (
			let x = (Math.random() / 5) * canvas.width, i = 1;
			x < canvas.width;
			x += (Math.random() / 5) * canvas.width, i++
		) {
			context.lineTo(
				x,
				Math.clamp(
					0,
					(canvas.height / 2) *
						(Math.random() + (Math.random() > 0.99 ? Math.random() : 0.5)) -
						(canvas.height / 2) * (1 / i),
					canvas.height
				)
			)
		}
		context.lineTo(canvas.width, canvas.height)
		context.strokeStyle = styles.normal.line
		context.stroke()

		let action = "click"
		if (graphics.IS_BASICALLY_A_PHONE) {
			action = "tap"
		}

		context.font = styles.normal.font
		context.fillStyle = styles.normal.text
		context.textAlign = "center"
		context.textBaseline = "bottom"
		let text = `${action} ▶ to start`

		// TODO this is inaccessible. where should this go for a screenreader?
		f.load().finally(() => {
			context.fillText(text, canvas.width / 2, canvas.height - 5)
		})
	}

	if (message.type == "start") {
		let {buffer} = message
		memory = Memory.map(buffer)
		requestAnimationFrame(update)
	}
}