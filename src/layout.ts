/**
 * A model's controls as Companion sees them, and incoming MIDI turned into
 * control events. No Companion or MIDI library imports, so it can be tested alone.
 */
import { type ControlDef, controlKey, type ModelDef } from './models.js'

export interface ApcControl extends ControlDef {
	controlId: string
	/** faders and absolute knobs: the surface variable carrying 0-127 */
	variableId?: string
}

export interface ApcLayout {
	model: ModelDef
	controls: ApcControl[]
	byControl: Map<string, ApcControl>
	/** exact channel match */
	byMessage: Map<string, ApcControl>
	/** controls that accept any channel, by message type and number */
	byMessageAnyChannel: Map<string, ApcControl>
}

function slug(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_|_$/g, '')
}

export function buildLayout(model: ModelDef): ApcLayout {
	const controls: ApcControl[] = model.controls.map((c) => {
		const ctl: ApcControl = { ...c, controlId: `${c.row}/${c.column}` }
		if (c.kind === 'fader' || c.kind === 'knob') ctl.variableId = slug(c.name)
		return ctl
	})
	const byControl = new Map(controls.map((c) => [c.controlId, c]))
	const byMessage = new Map<string, ApcControl>()
	const byMessageAnyChannel = new Map<string, ApcControl>()
	for (const c of controls) {
		if (c.channel < 0) byMessageAnyChannel.set(controlKey(c.msg, -1, c.number), c)
		else byMessage.set(controlKey(c.msg, c.channel, c.number), c)
	}
	return { model, controls, byControl, byMessage, byMessageAnyChannel }
}

export type ApcEvent =
	| { type: 'press'; control: ApcControl }
	| { type: 'release'; control: ApcControl }
	| { type: 'absolute'; control: ApcControl; value: number }
	| { type: 'relative'; control: ApcControl; delta: number }

/** Relative encoders: 1-63 up, 127 down to 64 = -1 to -64 */
export function relativeDelta(value: number): number {
	return value < 64 ? value : value - 128
}

/** One incoming MIDI message (not SysEx) to a control event, or undefined if it isn't ours */
export function parseMessage(layout: ApcLayout, bytes: number[]): ApcEvent | undefined {
	if (bytes.length < 3) return undefined
	const status = bytes[0] & 0xf0
	const channel = bytes[0] & 0x0f
	const number = bytes[1]
	const value = bytes[2]
	const msg = status === 0x90 || status === 0x80 ? 'note' : status === 0xb0 ? 'cc' : undefined
	if (!msg) return undefined
	if (msg === 'note' && layout.model.noteChannels && !layout.model.noteChannels.includes(channel)) return undefined
	const control =
		layout.byMessage.get(controlKey(msg, channel, number)) ?? layout.byMessageAnyChannel.get(controlKey(msg, -1, number))
	if (!control) return undefined

	if (msg === 'note') {
		return status === 0x90 && value > 0 ? { type: 'press', control } : { type: 'release', control }
	}
	switch (control.kind) {
		case 'button':
			return value >= 64 ? { type: 'press', control } : { type: 'release', control }
		case 'encoder': {
			const delta = relativeDelta(value)
			return delta === 0 ? undefined : { type: 'relative', control, delta }
		}
		default:
			return { type: 'absolute', control, value }
	}
}
