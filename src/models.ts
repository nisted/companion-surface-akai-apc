/**
 * Every supported APC model: how to recognise its MIDI port, what to send it
 * on connect, and each control's MIDI message, LED type and place in Companion.
 *
 * Sources: Akai's published communication protocols (APC40 rev 1, APC40 mkII
 * v1.2, APC mini mk2 v1.0, APC Key 25 mk2 v1.1). The original APC mini,
 * APC20 and original APC Key 25 have no protocol document to hand: their maps
 * follow the APC40 conventions they share and are marked `verified: false`.
 */

/** button: press/release. fader/knob: absolute 0-127. encoder: relative turns */
export type ControlKind = 'button' | 'fader' | 'knob' | 'encoder'

/**
 * none: no LED. single: one colour, on/off. tri: green/red/yellow (original APC pads).
 * palette: 128-colour velocity palette. rgb: full colour by SysEx (palette fallback).
 * bicolour: yellow/orange (APC40 mkII crossfader A/B). ring: knob LED ring (follows the knob).
 */
export type LedKind = 'none' | 'single' | 'tri' | 'palette' | 'rgb' | 'bicolour' | 'ring'

export interface ControlDef {
	name: string
	row: number
	column: number
	kind: ControlKind
	msg: 'note' | 'cc'
	/** -1: accept any channel (and send on 0) */
	channel: number
	number: number
	led: LedKind
	/** knob rings: the CC that sets the ring's style */
	ringStyleCc?: number
}

export interface ModelDef {
	id: string
	name: string
	/** matches this model's MIDI port names */
	port: RegExp
	/** SysEx sent on connect, before anything else */
	intro?: number[]
	/** SysEx model ID for per-pad RGB colour (message 0x24), for `rgb` LEDs */
	rgbModelId?: number
	/** pads and buttons only count on these channels (keeps keybed notes out) */
	noteChannels?: number[]
	verified: boolean
	controls: ControlDef[]
}

// ---- helpers to lay controls out --------------------------------------------

type ControlBase = Omit<ControlDef, 'row' | 'column'>

function note(name: string, number: number, led: LedKind, channel = -1): ControlBase {
	return { name, kind: 'button', msg: 'note', channel, number, led }
}
function cc(name: string, number: number, kind: ControlKind, channel = -1, led: LedKind = 'none'): ControlBase {
	return { name, kind, msg: 'cc', channel, number, led }
}
function at(row: number, column: number, c: ControlBase): ControlDef {
	return { ...c, row, column }
}
/** A row of eight, one per track, told apart by MIDI channel 0-7 */
function trackRow(row: number, name: string, number: number, led: LedKind): ControlDef[] {
	return Array.from({ length: 8 }, (_, i) => at(row, i, note(`${name} ${i + 1}`, number, led, i)))
}
/** A row of eight with consecutive note numbers */
function noteRow(row: number, col: number, name: string, first: number, led: LedKind, count = 8): ControlDef[] {
	return Array.from({ length: count }, (_, i) => at(row, col + i, note(`${name} ${i + 1}`, first + i, led)))
}
/** Buttons with their own names and consecutive notes, left to right */
function namedRow(row: number, col: number, names: string[], first: number, led: LedKind): ControlDef[] {
	return names.map((name, i) => at(row, col + i, note(name, first + i, led)))
}
/** A column of buttons with consecutive notes, top to bottom */
function noteColumn(row: number, col: number, name: string, first: number, led: LedKind, count: number): ControlDef[] {
	return Array.from({ length: count }, (_, i) => at(row + i, col, note(`${name} ${i + 1}`, first + i, led)))
}
/** Pads numbered from the bottom-left, rows of `cols` */
function padGrid(rows: number, cols: number, led: LedKind): ControlDef[] {
	const out: ControlDef[] = []
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const n = (rows - 1 - r) * cols + c
			out.push(at(r, c, note(`Pad ${n + 1}`, n, led)))
		}
	}
	return out
}

function intro(modelId: number, appId: number): number[] {
	return [0xf0, 0x47, 0x7f, modelId, 0x60, 0x00, 0x04, appId, 0x01, 0x00, 0x00, 0xf7]
}

/** Alternate Ableton Live mode: every button momentary, every LED set by the host */
const MODE_HOST = 0x42

// ---- APC40 (original) and APC20 --------------------------------------------

/** Clip launch on the APC40/APC20: note 0x35-0x39 = rows 1-5, channel = track */
function apc40Clips(): ControlDef[] {
	const out: ControlDef[] = []
	for (let r = 0; r < 5; r++) {
		for (let t = 0; t < 8; t++) out.push(at(r, t, note(`Clip ${r + 1}/${t + 1}`, 0x35 + r, 'tri', t)))
	}
	return out
}

/** The part of the APC40 that the APC20 shares: grid, track strips, faders */
function apc40Strips(): ControlDef[] {
	return [
		...apc40Clips(),
		...noteColumn(0, 8, 'Scene launch', 0x52, 'single', 5),
		...trackRow(5, 'Clip stop', 0x34, 'single'),
		at(5, 8, note('Stop all clips', 0x51, 'none')),
		...trackRow(6, 'Track select', 0x33, 'single'),
		at(6, 8, note('Master select', 0x50, 'single')),
		...trackRow(7, 'Activator', 0x32, 'single'),
		...trackRow(8, 'Solo', 0x31, 'single'),
		...trackRow(9, 'Record arm', 0x30, 'single'),
		...Array.from({ length: 8 }, (_, i) => at(10, i, cc(`Fader ${i + 1}`, 0x07, 'fader', i))),
		at(10, 8, cc('Master fader', 0x0e, 'fader')),
	]
}

function knobs(row: number, col: number, name: string, firstCc: number, firstRingCc: number, channel: number): ControlDef[] {
	return Array.from({ length: 8 }, (_, i) =>
		at(row + Math.floor(i / 4), col + (i % 4), {
			...cc(`${name} ${i + 1}`, firstCc + i, 'knob', channel, 'ring'),
			ringStyleCc: firstRingCc + i,
		}),
	)
}

const APC40: ModelDef = {
	id: 'apc40',
	name: 'APC40',
	port: /apc ?40(?! ?mk)/i,
	intro: intro(0x73, MODE_HOST),
	verified: true,
	controls: [
		...apc40Strips(),
		...knobs(0, 10, 'Track knob', 0x30, 0x38, -1),
		...namedRow(2, 10, ['Pan', 'Send A', 'Send B', 'Send C'], 0x57, 'single'),
		at(3, 10, note('Shift', 0x62, 'none')),
		at(3, 11, note('Bank up', 0x5e, 'none')),
		at(3, 12, note('Tap tempo', 0x63, 'none')),
		at(4, 10, note('Bank left', 0x61, 'none')),
		at(4, 11, note('Bank down', 0x5f, 'none')),
		at(4, 12, note('Bank right', 0x60, 'none')),
		at(5, 10, note('Nudge -', 0x65, 'none')),
		at(5, 11, note('Nudge +', 0x64, 'none')),
		at(5, 12, cc('Footswitch', 0x40, 'button')),
		...knobs(6, 10, 'Device knob', 0x10, 0x18, -1),
		...namedRow(8, 10, ['Clip/Track', 'Device on/off', 'Device left', 'Device right'], 0x3a, 'single'),
		...namedRow(9, 10, ['Detail view', 'Rec quantization', 'MIDI overdub', 'Metronome'], 0x3e, 'single'),
		at(10, 10, note('Play', 0x5b, 'none')),
		at(10, 11, note('Stop', 0x5c, 'none')),
		at(10, 12, note('Record', 0x5d, 'none')),
		at(10, 13, cc('Crossfader', 0x0f, 'fader')),
		at(7, 8, cc('Cue level', 0x2f, 'encoder')),
	],
}

const APC20: ModelDef = {
	id: 'apc20',
	name: 'APC20',
	port: /apc ?20/i,
	intro: intro(0x7b, MODE_HOST),
	verified: false,
	controls: [...apc40Strips(), at(6, 9, note('Shift', 0x62, 'none'))],
}

// ---- APC40 mkII --------------------------------------------------------------

const APC40_MK2: ModelDef = {
	id: 'apc40-mk2',
	name: 'APC40 mkII',
	port: /apc ?40 ?mk ?(ii|2)/i,
	intro: intro(0x29, MODE_HOST),
	verified: false,
	controls: [
		...Array.from({ length: 8 }, (_, i) =>
			at(0, i, { ...cc(`Track knob ${i + 1}`, 0x30 + i, 'knob', -1, 'ring'), ringStyleCc: 0x38 + i }),
		),
		...padGrid(5, 8, 'palette').map((c) => ({ ...c, row: c.row + 1 })),
		...noteColumn(1, 8, 'Scene launch', 0x52, 'palette', 5),
		...trackRow(6, 'Clip stop', 0x34, 'single'),
		at(6, 8, note('Stop all clips', 0x51, 'none')),
		...trackRow(7, 'Track select', 0x33, 'single'),
		at(7, 8, note('Master select', 0x50, 'single')),
		...trackRow(8, 'Activator', 0x32, 'single'),
		...trackRow(9, 'Solo', 0x31, 'single'),
		...trackRow(10, 'Record arm', 0x30, 'single'),
		...trackRow(11, 'Crossfader A/B', 0x42, 'bicolour'),
		...Array.from({ length: 8 }, (_, i) => at(12, i, cc(`Fader ${i + 1}`, 0x07, 'fader', i))),
		at(12, 8, cc('Master fader', 0x0e, 'fader')),
		at(12, 9, cc('Crossfader', 0x0f, 'fader')),
		at(0, 10, note('Pan', 0x57, 'single')),
		at(0, 11, note('Sends', 0x58, 'single')),
		at(0, 12, note('User', 0x59, 'single')),
		at(0, 13, note('Metronome', 0x5a, 'single')),
		at(1, 10, note('Play', 0x5b, 'single')),
		at(1, 11, note('Record', 0x5d, 'single')),
		at(1, 12, note('Session record', 0x66, 'single')),
		at(1, 13, note('Tap tempo', 0x63, 'none')),
		at(2, 10, note('Nudge -', 0x64, 'none')),
		at(2, 11, note('Nudge +', 0x65, 'none')),
		at(2, 12, cc('Tempo', 0x0d, 'encoder')),
		at(2, 13, note('Shift', 0x62, 'none')),
		...knobs(3, 10, 'Device knob', 0x10, 0x18, -1),
		...namedRow(5, 10, ['Device left', 'Device right', 'Bank left', 'Bank right'], 0x3a, 'single'),
		...namedRow(6, 10, ['Device on/off', 'Device lock', 'Clip/Device view', 'Detail view'], 0x3e, 'single'),
		at(7, 10, note('Bank', 0x67, 'single')),
		at(7, 11, note('Up', 0x5e, 'none')),
		at(8, 10, note('Left', 0x61, 'none')),
		at(8, 11, note('Down', 0x5f, 'none')),
		at(8, 12, note('Right', 0x60, 'none')),
		at(9, 10, cc('Cue level', 0x2f, 'encoder')),
		at(9, 11, cc('Footswitch', 0x40, 'button')),
	],
}

// ---- APC mini ----------------------------------------------------------------

/** Both minis: 8x8 pads, scene column, track row, shift, 9 faders on CC 48-56 */
function mini(pads: LedKind, track: number, scene: number, shift: number): ControlDef[] {
	return [
		...padGrid(8, 8, pads),
		...noteColumn(0, 8, 'Scene', scene, 'single', 8),
		...noteRow(8, 0, 'Track', track, 'single'),
		at(8, 8, note('Shift', shift, 'none')),
		...Array.from({ length: 9 }, (_, i) => at(9, i, cc(i < 8 ? `Fader ${i + 1}` : 'Master fader', 0x30 + i, 'fader'))),
	]
}

const APC_MINI: ModelDef = {
	id: 'apc-mini',
	name: 'APC mini',
	port: /apc ?mini(?! ?mk)/i,
	verified: false,
	controls: mini('tri', 0x40, 0x52, 0x62),
}

const APC_MINI_MK2: ModelDef = {
	id: 'apc-mini-mk2',
	name: 'APC mini mk2',
	port: /apc ?mini ?mk ?(ii|2)/i,
	intro: intro(0x4f, 0x00),
	rgbModelId: 0x4f,
	noteChannels: [0],
	verified: false,
	controls: mini('rgb', 0x64, 0x70, 0x7a),
}

// ---- APC Key 25 --------------------------------------------------------------

function key25(pads: LedKind, knob: ControlKind): ControlDef[] {
	return [
		...padGrid(5, 8, pads),
		...noteColumn(0, 8, 'Scene', 0x52, 'single', 5),
		...noteRow(5, 0, 'Track', 0x40, 'single'),
		at(5, 8, note('Stop all clips', 0x51, 'none')),
		...Array.from({ length: 8 }, (_, i) => at(6, i, cc(`Knob ${i + 1}`, 0x30 + i, knob))),
		at(7, 0, note('Play', 0x5b, 'single')),
		at(7, 1, note('Record', 0x5d, 'single')),
		at(7, 2, note('Shift', 0x62, 'none')),
		at(7, 3, cc('Sustain', 0x40, 'button')),
	]
}

const APC_KEY25: ModelDef = {
	id: 'apc-key25',
	name: 'APC Key 25',
	port: /apc ?key ?25(?! ?mk)/i,
	noteChannels: [0],
	verified: false,
	controls: key25('tri', 'knob'),
}

const APC_KEY25_MK2: ModelDef = {
	id: 'apc-key25-mk2',
	name: 'APC Key 25 mk2',
	port: /apc ?key ?25 ?mk ?(ii|2)/i,
	intro: intro(0x4e, 0x00),
	rgbModelId: 0x4e,
	noteChannels: [0],
	verified: false,
	controls: key25('rgb', 'encoder'),
}

/** Most specific first: 'APC40 mkII' must not be taken for 'APC40' */
export const MODELS: ModelDef[] = [APC40_MK2, APC40, APC20, APC_MINI_MK2, APC_MINI, APC_KEY25_MK2, APC_KEY25]

export function modelForPort(name: string): ModelDef | undefined {
	return MODELS.find((m) => m.port.test(name))
}

/** Second ports carry keys/notes, not controls (macOS 'Keys'/'Notes', Windows 'MIDIIN2 (...)') */
const SECONDARY_PORT = /midi(in|out)\d|keys|notes/i

export function isSecondaryPort(name: string): boolean {
	return SECONDARY_PORT.test(name)
}

export function controlKey(msg: 'note' | 'cc', channel: number, number: number): string {
	return `${msg}:${channel}:${number}`
}
