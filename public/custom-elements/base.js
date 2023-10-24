export class BentoEvent extends CustomEvent {
	/**
	 * @param {string} name
	 * @param {any} [detail]
	 * @param {EventInit} [options]
	 */
	constructor(name, detail, options) {
		super(name, {...options, detail})
	}

	get message() {
		return this.detail
	}
}

export class BentoElement extends HTMLElement {
	/**
	 * @param {string} name
	 * @param {any} [detail]
	 * @param {EventInit} [options]
	 */
	announce(name, detail, options = {bubbles: true}) {
		this.dispatchEvent(new BentoEvent(name, detail, options))
	}

	/**
	 * @param {string} name
	 * @param {boolean} state
	 */
	toggleAttribute(name, state) {
		if (state) {
			this.setAttribute(name, name)
		} else {
			this.removeAttribute(name)
		}
		return state
	}
}