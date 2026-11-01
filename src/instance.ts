import {
	type CardGenerator,
	createModuleLogger,
	type ModuleLogger,
	parseColor,
	type SurfaceContext,
	type SurfaceDrawProps,
	type SurfaceInstance,
} from '@companion-surface/base'
import type { Input, Output } from '@julusian/midi/lazy'
import { type ApcControl, type ApcLayout, parseMessage } from './layout.js'
import { ledMessages, type Rgb, ringMessages, scale } from './leds.js'
import { inputNames, outputNames } from './midi-ports.js'

export class ApcSurface implements SurfaceInstance {
	readonly #logger: ModuleLogger
	readonly #surfaceId: string
	readonly #context: SurfaceContext
	readonly #input: Input
	readonly #output: Output
	readonly #inputName: string
	readonly #outputName: string
	readonly #layout: ApcLayout

	readonly #colours = new Map<string, Rgb>()
	readonly #lastAbsolute = new Map<string, number>()
	readonly #carry = new Map<string, number>()
	#brightness = 100
	#faderStep = 1
	#ringStyle = 1
	#valueIntervalMs = 60
	readonly #valueLastSent = new Map<string, number>()
	readonly #valuePending = new Map<string, { value: number; timer: NodeJS.Timeout }>()
	#checkTimer: NodeJS.Timeout | undefined

	readonly #onMessage = (_deltaTime: number, bytes: number[]) => this.#handleMessage(bytes)

	get surfaceId(): string {
		return this.#surfaceId
	}
	get productName(): string {
		return `Akai ${this.#layout.model.name}`
	}

	constructor(
		surfaceId: string,
		context: SurfaceContext,
		input: Input,
		output: Output,
		inputName: string,
		outputName: string,
		layout: ApcLayout,
	) {
		this.#logger = createModuleLogger(`APC/${surfaceId}`)
		this.#surfaceId = surfaceId
		this.#context = context
		this.#input = input
		this.#output = output
		this.#inputName = inputName
		this.#outputName = outputName
		this.#layout = layout
	}

	async init(): Promise<void> {
		this.#input.on('message', this.#onMessage)
		this.#checkTimer = setInterval(() => this.#checkPorts(), 2000)
		await this.blank()
		this.#writeRings()
	}

	async close(): Promise<void> {
		if (this.#checkTimer) clearInterval(this.#checkTimer)
		for (const pending of this.#valuePending.values()) clearTimeout(pending.timer)
		this.#valuePending.clear()
		this.#input.off('message', this.#onMessage)
		await this.blank().catch(() => null)
		for (const port of [this.#input, this.#output]) {
			try {
				port.closePort()
				port.destroy()
			} catch {
				/* already gone */
			}
		}
	}

	async updateConfig(config: Record<string, any>): Promise<void> {
		const step = Number(config?.faderStep)
		this.#faderStep = Number.isFinite(step) && step >= 1 ? Math.round(step) : 1
		const interval = Number(config?.valueIntervalMs)
		this.#valueIntervalMs = Number.isFinite(interval) && interval >= 0 ? Math.round(interval) : 60
		const ring = Number(config?.ringStyle)
		const newRing = Number.isFinite(ring) && ring >= 0 && ring <= 3 ? Math.round(ring) : 1
		if (newRing !== this.#ringStyle) {
			this.#ringStyle = newRing
			this.#writeRings()
		}
	}

	async ready(): Promise<void> {}

	async setBrightness(percent: number): Promise<void> {
		this.#brightness = Math.max(0, Math.min(100, percent))
		for (const ctl of this.#layout.controls) this.#writeLed(ctl)
	}

	async blank(): Promise<void> {
		this.#colours.clear()
		for (const ctl of this.#layout.controls) this.#writeLed(ctl)
	}

	async draw(_signal: AbortSignal, drawProps: SurfaceDrawProps): Promise<void> {
		const ctl = this.#layout.byControl.get(drawProps.controlId)
		if (!ctl) return
		this.#colours.set(ctl.controlId, parseColor(drawProps.color))
		this.#writeLed(ctl)
	}

	async showStatus(_signal: AbortSignal, _cards: CardGenerator, _message: string): Promise<void> {
		// No screen to show it on
	}

	#send(bytes: number[]): void {
		if (!this.#output.isPortOpen()) return
		try {
			this.#output.sendMessage(bytes)
		} catch (e) {
			this.#logger.warn(`MIDI send failed: ${e}`)
		}
	}

	#writeLed(ctl: ApcControl): void {
		const c = scale(this.#colours.get(ctl.controlId) ?? { r: 0, g: 0, b: 0 }, this.#brightness)
		for (const m of ledMessages(this.#layout.model, ctl, c)) this.#send(m)
	}

	#writeRings(): void {
		for (const ctl of this.#layout.controls) {
			for (const m of ringMessages(ctl, this.#lastAbsolute.get(ctl.controlId), this.#ringStyle)) this.#send(m)
		}
	}

	#handleMessage(bytes: number[]): void {
		const ev = parseMessage(this.#layout, bytes)
		if (!ev) return
		switch (ev.type) {
			case 'press':
				this.#context.keyDownById(ev.control.controlId)
				break
			case 'release':
				this.#context.keyUpById(ev.control.controlId)
				break
			case 'relative':
				this.#rotate(ev.control, ev.delta)
				break
			case 'absolute':
				this.#absolute(ev.control, ev.value)
				break
		}
	}

	#absolute(ctl: ApcControl, value: number): void {
		if (ctl.variableId) this.#sendValue(ctl.variableId, value)
		const last = this.#lastAbsolute.get(ctl.controlId)
		this.#lastAbsolute.set(ctl.controlId, value)
		// the host drives knob rings (APC40s): keep the ring on the knob's position
		if (ctl.led === 'ring') for (const m of ringMessages(ctl, value, this.#ringStyle).slice(1)) this.#send(m)
		if (last === undefined) return // first reading, nothing to compare with

		// faders and knobs turn into rotate steps, so they follow the page like encoders do
		const total = (this.#carry.get(ctl.controlId) ?? 0) + (value - last)
		const steps = Math.trunc(total / this.#faderStep)
		this.#carry.set(ctl.controlId, total - steps * this.#faderStep)
		this.#rotate(ctl, steps)
	}

	#rotate(ctl: ApcControl, steps: number): void {
		for (let i = 0; i < Math.abs(steps); i++) {
			if (steps > 0) this.#context.rotateRightById(ctl.controlId)
			else this.#context.rotateLeftById(ctl.controlId)
		}
	}

	/**
	 * Send a fader/knob value variable, at most once per #valueIntervalMs, always
	 * finishing with the latest value, so triggers on it stay under Companion's rate limit.
	 */
	#sendValue(variableId: string, value: number): void {
		const pending = this.#valuePending.get(variableId)
		if (pending) {
			pending.value = value
			return
		}
		const wait = (this.#valueLastSent.get(variableId) ?? 0) + this.#valueIntervalMs - Date.now()
		if (wait <= 0) {
			this.#valueLastSent.set(variableId, Date.now())
			this.#context.sendVariableValue(variableId, value)
			return
		}
		const entry = {
			value,
			timer: setTimeout(() => {
				this.#valuePending.delete(variableId)
				this.#valueLastSent.set(variableId, Date.now())
				this.#context.sendVariableValue(variableId, entry.value)
			}, wait),
		}
		this.#valuePending.set(variableId, entry)
	}

	#checkPorts(): void {
		let reason: string | null = null
		if (!this.#input.isPortOpen() || !this.#output.isPortOpen()) reason = 'MIDI port closed'
		else if (!inputNames().includes(this.#inputName) || !outputNames().includes(this.#outputName))
			reason = `${this.#layout.model.name} unplugged`
		if (!reason) return
		if (this.#checkTimer) clearInterval(this.#checkTimer)
		this.#checkTimer = undefined
		this.#context.disconnect(new Error(reason))
	}
}
