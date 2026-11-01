/**
 * Turning a Companion button colour into what each kind of APC LED can show.
 * Pure functions, so they can be tested without a device.
 */
import { type ControlDef, type ModelDef } from './models.js'

export interface Rgb {
	r: number
	g: number
	b: number
}

/**
 * The 128-colour velocity palette shared by the APC40 mkII, APC mini mk2 and
 * APC Key 25 mk2 (APC40 mkII protocol v1.2, 'RGB LEDs' table).
 */
// prettier-ignore
export const PALETTE: number[] = [
	0x000000, 0x1e1e1e, 0x7f7f7f, 0xffffff, 0xff4c4c, 0xff0000, 0x590000, 0x190000,
	0xffbd6c, 0xff5400, 0x591d00, 0x271b00, 0xffff4c, 0xffff00, 0x595900, 0x191900,
	0x88ff4c, 0x54ff00, 0x1d5900, 0x142b00, 0x4cff4c, 0x00ff00, 0x005900, 0x001900,
	0x4cff5e, 0x00ff19, 0x00590d, 0x001902, 0x4cff88, 0x00ff55, 0x00591d, 0x001f12,
	0x4cffb7, 0x00ff99, 0x005935, 0x001912, 0x4cc3ff, 0x00a9ff, 0x004152, 0x001019,
	0x4c88ff, 0x0055ff, 0x001d59, 0x000819, 0x4c4cff, 0x0000ff, 0x000059, 0x000019,
	0x874cff, 0x5400ff, 0x190064, 0x0f0030, 0xff4cff, 0xff00ff, 0x590059, 0x190019,
	0xff4c87, 0xff0054, 0x59001d, 0x220013, 0xff1500, 0x993500, 0x795100, 0x436400,
	0x033900, 0x005735, 0x00547f, 0x0000ff, 0x00454f, 0x2500cc, 0x7f7f7f, 0x202020,
	0xff0000, 0xbdff2d, 0xafed06, 0x64ff09, 0x108b00, 0x00ff87, 0x00a9ff, 0x002aff,
	0x3f00ff, 0x7a00ff, 0xb21a7d, 0x402100, 0xff4a00, 0x88e106, 0x72ff15, 0x00ff00,
	0x3bff26, 0x59ff71, 0x38ffcc, 0x5b8aff, 0x3151c6, 0x877fe9, 0xd31dff, 0xff005d,
	0xff7f00, 0xb9b000, 0x90ff00, 0x835d07, 0x392b00, 0x144c10, 0x0d5038, 0x15152a,
	0x16205a, 0x693c1c, 0xa8000a, 0xde513d, 0xd86a1c, 0xffe126, 0x9ee12f, 0x67b50f,
	0x1e1e30, 0xdcff6b, 0x80ffbd, 0x9a99ff, 0x8e66ff, 0x404040, 0x757575, 0xe0ffff,
	0xa00000, 0x350000, 0x1ad000, 0x074200, 0xb9b000, 0x3f3100, 0xb35f00, 0x4b1502,
]

/** Below this (0-255, brightest channel) a colour counts as off */
export const OFF_LEVEL = 24

export function scale(c: Rgb, brightness: number): Rgb {
	const s = Math.max(0, Math.min(100, brightness)) / 100
	return { r: Math.round(c.r * s), g: Math.round(c.g * s), b: Math.round(c.b * s) }
}

export function isOff(c: Rgb): boolean {
	return Math.max(c.r, c.g, c.b) < OFF_LEVEL
}

/** Nearest palette entry (velocity 0-127) */
export function nearestPalette(c: Rgb): number {
	if (isOff(c)) return 0
	let best = 0
	let bestDist = Infinity
	for (let v = 0; v < PALETTE.length; v++) {
		const p = PALETTE[v]
		const dr = ((p >> 16) & 0xff) - c.r
		const dg = ((p >> 8) & 0xff) - c.g
		const db = (p & 0xff) - c.b
		// weighted for how the eye sees it
		const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db
		if (d < bestDist) {
			bestDist = d
			best = v
		}
	}
	return best
}

function hue(c: Rgb): { h: number; sat: number } {
	const max = Math.max(c.r, c.g, c.b)
	const min = Math.min(c.r, c.g, c.b)
	const d = max - min
	if (d === 0) return { h: 0, sat: 0 }
	let h: number
	if (max === c.r) h = ((c.g - c.b) / d) % 6
	else if (max === c.g) h = (c.b - c.r) / d + 2
	else h = (c.r - c.g) / d + 4
	return { h: (h * 60 + 360) % 360, sat: d / max }
}

/**
 * Original APC pads: 0 off, 1 green, 3 red, 5 yellow.
 * Reds, pinks and purples show red; oranges and yellows (and whites/greys)
 * show yellow; greens, cyans and blues show green.
 */
export function triColour(c: Rgb): number {
	if (isOff(c)) return 0
	const { h, sat } = hue(c)
	if (sat < 0.35) return 5
	if (h >= 290 || h < 22) return 3
	if (h < 80) return 5
	return 1
}

/** APC40 mkII crossfader A/B: 0 off, 1 yellow, 2 orange */
export function biColour(c: Rgb): number {
	if (isOff(c)) return 0
	const { h, sat } = hue(c)
	return sat >= 0.35 && (h >= 290 || h < 40) ? 2 : 1
}

/** Single-colour buttons: lit for any colour that isn't (near) black */
export function single(c: Rgb): number {
	return isOff(c) ? 0 : 1
}

/** Per-pad RGB SysEx (APC mini mk2 / Key 25 mk2, message 0x24). Each 0-255 value is sent as two 7-bit bytes. */
export function rgbSysex(modelId: number, pad: number, c: Rgb): number[] {
	const split = (v: number) => [(v >> 7) & 0x01, v & 0x7f]
	return [0xf0, 0x47, 0x7f, modelId, 0x24, 0x00, 0x08, pad, pad, ...split(c.r), ...split(c.g), ...split(c.b), 0xf7]
}

/** The MIDI message(s) that show colour `c` on a control's LED, or [] for none */
export function ledMessages(model: ModelDef, ctl: ControlDef, c: Rgb): number[][] {
	if (ctl.msg !== 'note') return []
	const ch = Math.max(0, ctl.channel)
	const noteMsg = (v: number) => (v === 0 ? [0x80 | ch, ctl.number, 0] : [0x90 | ch, ctl.number, v])
	switch (ctl.led) {
		case 'single':
			return [noteMsg(single(c))]
		case 'tri':
			return [noteMsg(triColour(c))]
		case 'bicolour':
			return [noteMsg(biColour(c))]
		case 'palette':
			return [noteMsg(nearestPalette(c))]
		case 'rgb':
			if (model.rgbModelId === undefined) return [noteMsg(nearestPalette(c))]
			return [rgbSysex(model.rgbModelId, ctl.number, isOff(c) ? { r: 0, g: 0, b: 0 } : c)]
		default:
			return []
	}
}

/** Knob ring: value on the knob's own CC; ring style on its style CC (0 off, 1 single, 2 volume, 3 pan) */
export function ringMessages(ctl: ControlDef, value: number | undefined, style: number): number[][] {
	if (ctl.led !== 'ring' || ctl.ringStyleCc === undefined) return []
	const ch = Math.max(0, ctl.channel)
	const out = [[0xb0 | ch, ctl.ringStyleCc, style]]
	if (value !== undefined) out.push([0xb0 | ch, ctl.number, value])
	return out
}
