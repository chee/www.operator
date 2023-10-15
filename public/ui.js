import * as elements from "./elements.js"
elements.register()
import * as sounds from "./sounds.js"
import * as graphics from "./graphics.js"
import * as Memory from "./memory.js"
let ui = document.querySelector("po-ui")
let channelGroup = ui.querySelector("po-channels")
let channels = channelGroup.querySelectorAll("po-channel")
let stepGroup = ui.querySelector("po-steps")
let steps = stepGroup.querySelectorAll("po-step")
let speedSelector = ui.querySelector('[name="speed"] select')
let bpmInput = ui.querySelector('[name="bpm"] input')
let playButton = ui.querySelector('[name="play"]')
let recordButton = ui.querySelector('[name="record"]')
/** @type {HTMLCanvasElement} */
let canvas = ui.querySelector('[name="waveform"] canvas')
let buffer = new SharedArrayBuffer(Memory.size)
let memory = Memory.map(buffer)
graphics.init(canvas)
sounds.init()

Memory.bpm(memory, 120)
for (let channel of [0, 1, 2, 3]) {
	Memory.channelSpeed(memory, channel, 1)
}

ui.addEventListener(
	"click",
	() => {
		sounds.start(buffer)
		graphics.update(canvas, Memory.getSelectedSoundDetails(memory))
	},
	{once: true}
)

channels.forEach((channel, index) => {
	if (channel.selected) {
		Memory.selectedChannel(memory, index)
	}
})

steps.forEach((step, stepIndex) => {
	let chanIndex = Memory.selectedChannel(memory)
	if (step.on) {
		Memory.stepOn(memory, chanIndex, stepIndex, true)
	} else {
		Memory.stepOn(memory, chanIndex, stepIndex, false)
	}
})

let lastChannel = Memory.selectedChannel(memory)
let lastSelectedStep = Memory.selectedStep(memory)
function update() {
	let selectedChannel = Memory.selectedChannel(memory)
	if (lastChannel != selectedChannel) {
		setTimeout(() =>
			graphics.update(canvas, Memory.getSelectedSoundDetails(memory))
		)
		lastChannel = selectedChannel
	}
	speedSelector.value = Memory.channelSpeed(memory, selectedChannel)

	playButton.toggleAttribute("playing", Memory.playing(memory))
	if (bpmInput != document.activeElement) {
		bpmInput.value = Memory.bpm(memory)
	}

	channels.forEach((channelElement, index) => {
		if (index == selectedChannel) {
			channelElement.selected = true
		} else {
			channelElement.selected = false
		}
	})

	let selectedStep = Memory.selectedStep(memory)
	if (selectedStep != lastSelectedStep) {
		graphics.update(canvas, Memory.getSelectedSoundDetails(memory))
	}
	steps.forEach((stepElement, index) => {
		if (index == selectedStep) {
			stepElement.selected = true
		} else {
			stepElement.selected = false
		}

		let currentStep = Memory.currentStep(memory, selectedChannel)
		if (index == currentStep) {
			stepElement.playing = true
		} else {
			stepElement.playing = false
		}
		if (Memory.stepOn(memory, selectedChannel, index)) {
			stepElement.on = true
		} else {
			stepElement.on = false
		}
	})
	lastSelectedStep = selectedStep

	requestAnimationFrame(update)
}

update()

channels.forEach((channel, index) => {
	channel.addEventListener("selected", event => {
		Memory.selectedChannel(memory, index)
	})
})

steps.forEach((step, index) => {
	step.addEventListener("selected", event => {
		Memory.selectedStep(memory, index)
	})
	step.addEventListener("on", event => {
		Memory.stepOn(memory, Memory.selectedChannel(memory), index, true)
	})
	step.addEventListener("off", event => {
		Memory.stepOn(memory, Memory.selectedChannel(memory), index, false)
	})
})

playButton.addEventListener("click", () => {
	Memory.playing(memory, true)
})

ui.querySelector('[name="pause"]').addEventListener("click", () => {
	Memory.playing(memory, false)
})

ui.querySelector('[name="stop"]').addEventListener("click", () => {
	Memory.playing(memory, false)
	for (let channel of [0, 1, 2, 3]) {
		Memory.currentStep(memory, channel, 0)
	}
})

canvas.addEventListener("trim", event => {
	/**
	 * @type {import("./memory.js").Trim}
	 */
	let trim = event.detail
	let chanIndex = Memory.selectedChannel(memory)
	let stepIndex = Memory.selectedStep(memory)
	Memory.stepTrim(memory, chanIndex, stepIndex, trim)
	graphics.update(canvas, Memory.getSelectedSoundDetails(memory))
})

bpmInput.addEventListener("change", event => {
	let num = Number(event.target.value)
	if (num < event.target.min) {
		num = event.target.value = event.target.min
	}
	if (num > event.target.max) {
		num = event.target.value = event.target.max
	}
	Memory.bpm(memory, num)
})

speedSelector.addEventListener("change", event => {
	Memory.channelSpeed(
		memory,
		Memory.selectedChannel(memory),
		Number(speedSelector.value)
	)
})

recordButton.addEventListener("click", async event => {
	let audio = await sounds.recordSound()
	sounds.setSound(memory, Memory.selectedChannel(memory), audio)
	await new Promise(yay => setTimeout(yay, 100))
	graphics.update(canvas, Memory.getSelectedSoundDetails(memory))
})

globalThis.onmessage = function (event) {
	if (event.data?.type == "recording") {
		ui.toggleAttribute("recording", event.data.state)
	}
}

function getPattern() {
	let pattern = ""
	pattern += Memory.bpm(memory) + "\n\n"
	for (let cidx of [0, 1, 2, 3]) {
		pattern += Memory.channelSpeed(memory, cidx) + "\n"
		for (let sidx of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) {
			// if i use unicode chars for this, i can create a bitmask to store a huge
			// amount of data in a single character.
			// maybe it should be emoji
			pattern += Memory.stepOn(memory, cidx, sidx) ? "■ " : "□ "
			if (!((sidx + 1) % 4)) {
				pattern += "\n"
			}
		}
		pattern += "\n"
	}
	return pattern
}

function loadPattern(pattern) {
	let [master, ...channels] = pattern.trim().split(/\n\n+/)
	let [bpm] = master.split(/\s+/)
	Memory.bpm(memory, Number(bpm))
	channels.forEach((channel, cidx) => {
		let [options, ...steps] = channel.trim().split(/\s+/)
		steps = steps.filter(s => s.trim())
		let [speed] = options.split(/\s+/)
		Memory.channelSpeed(memory, cidx, Number(speed))
		steps.forEach((step, sidx) => {
			Memory.stepOn(memory, cidx, sidx, step == "■")
		})
	})
}

globalThis.getPattern = getPattern
globalThis.loadPattern = loadPattern

if (location.search == "?rabbit") {
	document.body.classList.add("chee")
}
