// Checks the model maps and LED/input logic without a device. Run after 'yarn build': node scripts/test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'

const dist = process.argv[2] ?? new URL('../dist/', import.meta.url).href
const { MODELS, modelForPort } = await import(new URL('models.js', dist))
const { buildLayout, parseMessage, relativeDelta } = await import(new URL('layout.js', dist))
const { ledMessages, nearestPalette, triColour, biColour, rgbSysex, PALETTE } = await import(new URL('leds.js', dist))
const { findApcs } = await import(new URL('midi-ports.js', dist)).catch(() => ({}))

const byId = Object.fromEntries(MODELS.map((m) => [m.id, m]))

test('every model: no two controls share a place or a MIDI message, variable ids unique', () => {
	for (const m of MODELS) {
		const places = new Set()
		const msgs = new Set()
		const vars = new Set()
		const layout = buildLayout(m)
		for (const c of layout.controls) {
			assert.ok(!places.has(c.controlId), `${m.id}: two controls at ${c.controlId}`)
			places.add(c.controlId)
			const key = `${c.msg}:${c.channel}:${c.number}`
			assert.ok(!msgs.has(key), `${m.id}: ${c.name} reuses ${key}`)
			msgs.add(key)
			if (c.channel < 0) {
				const clash = layout.controls.find((o) => o !== c && o.msg === c.msg && o.number === c.number)
				assert.ok(!clash, `${m.id}: ${c.name} (any channel) clashes with ${clash?.name}`)
			}
			assert.ok(c.number >= 0 && c.number <= 127 && c.channel >= -1 && c.channel <= 15)
			if (c.variableId) {
				assert.ok(!vars.has(c.variableId), `${m.id}: variable ${c.variableId} twice`)
				vars.add(c.variableId)
			}
		}
	}
})

test('control counts match the hardware', () => {
	const count = (id, pred) => buildLayout(byId[id]).controls.filter(pred).length
	assert.equal(
		count('apc40', (c) => c.led === 'tri'),
		40,
	)
	assert.equal(
		count('apc40', (c) => c.kind === 'knob'),
		16,
	)
	assert.equal(
		count('apc40', (c) => c.kind === 'fader'),
		10,
	) // 8 + master + crossfader
	assert.equal(
		count('apc40-mk2', (c) => c.led === 'palette'),
		45,
	) // 40 pads + 5 scenes
	assert.equal(
		count('apc40-mk2', (c) => c.kind === 'knob'),
		16,
	)
	assert.equal(
		count('apc-mini', (c) => c.led === 'tri'),
		64,
	)
	assert.equal(
		count('apc-mini-mk2', (c) => c.led === 'rgb'),
		64,
	)
	assert.equal(
		count('apc-mini', (c) => c.kind === 'fader'),
		9,
	)
	assert.equal(
		count('apc-key25-mk2', (c) => c.kind === 'encoder'),
		8,
	)
	assert.equal(
		count('apc-key25', (c) => c.led === 'tri'),
		40,
	)
})

test('ports are recognised as the right model', () => {
	const cases = {
		'Akai APC40': 'apc40',
		APC40: 'apc40',
		'APC40 mkII': 'apc40-mk2',
		'Akai APC20': 'apc20',
		'APC MINI': 'apc-mini',
		'APC mini mk2': 'apc-mini-mk2',
		'APC mini mk2 Control': 'apc-mini-mk2',
		'APC Key 25': 'apc-key25',
		'APC Key 25 mk2': 'apc-key25-mk2',
	}
	for (const [port, id] of Object.entries(cases)) assert.equal(modelForPort(port)?.id, id, port)
	assert.equal(modelForPort('Launch Control XL'), undefined)
	assert.equal(modelForPort('MPK mini 3'), undefined)
})

test('second ports (notes/keys) are skipped', { skip: !findApcs }, () => {
	const found = findApcs(
		['APC mini mk2 Control', 'APC mini mk2 Notes', 'MIDIIN2 (APC Key 25 mk2)', 'APC Key 25 mk2', 'Akai APC40'],
		['APC mini mk2 Control', 'APC mini mk2 Notes', 'MIDIOUT2 (APC Key 25 mk2)', 'APC Key 25 mk2', 'Akai APC40'],
	)
	assert.deepEqual(
		found.map((f) => [f.model.id, f.inputName, f.outputName]),
		[
			['apc-mini-mk2', 'APC mini mk2 Control', 'APC mini mk2 Control'],
			['apc-key25-mk2', 'APC Key 25 mk2', 'APC Key 25 mk2'],
			['apc40', 'Akai APC40', 'Akai APC40'],
		],
	)
})

test('APC40: clip row 1 track 3 is note 0x35 on channel 2, at the top of column 2', () => {
	const layout = buildLayout(byId.apc40)
	const ev = parseMessage(layout, [0x92, 0x35, 0x7f])
	assert.equal(ev.type, 'press')
	assert.equal(ev.control.controlId, '0/2')
	assert.equal(parseMessage(layout, [0x82, 0x35, 0x7f]).type, 'release')
	assert.equal(parseMessage(layout, [0x92, 0x35, 0x00]).type, 'release')
	// LED: red on channel 2
	assert.deepEqual(ledMessages(byId.apc40, ev.control, { r: 255, g: 0, b: 0 }), [[0x92, 0x35, 3]])
	assert.deepEqual(ledMessages(byId.apc40, ev.control, { r: 0, g: 0, b: 0 }), [[0x82, 0x35, 0]])
})

test('APC40: faders by channel, device knobs on any channel, cue level relative', () => {
	const layout = buildLayout(byId.apc40)
	const f = parseMessage(layout, [0xb4, 0x07, 100])
	assert.equal(f.control.name, 'Fader 5')
	assert.equal(f.value, 100)
	assert.equal(parseMessage(layout, [0xb3, 0x12, 5]).control.name, 'Device knob 3')
	assert.equal(parseMessage(layout, [0xb0, 0x12, 5]).control.name, 'Device knob 3')
	assert.equal(parseMessage(layout, [0xb0, 0x2f, 0x7f]).delta, -1)
	assert.equal(parseMessage(layout, [0xb0, 0x2f, 0x02]).delta, 2)
	assert.equal(parseMessage(layout, [0xb0, 0x40, 0x7f]).type, 'press') // footswitch
})

test('pads number from the bottom-left', () => {
	const mini = buildLayout(byId['apc-mini-mk2'])
	assert.equal(parseMessage(mini, [0x90, 0, 127]).control.controlId, '7/0')
	assert.equal(parseMessage(mini, [0x90, 63, 127]).control.controlId, '0/7')
	assert.equal(parseMessage(mini, [0x99, 0, 127]), undefined) // drum mode channel ignored
	const mk2 = buildLayout(byId['apc40-mk2'])
	assert.equal(parseMessage(mk2, [0x90, 0, 127]).control.controlId, '5/0')
	assert.equal(parseMessage(mk2, [0x90, 39, 127]).control.controlId, '1/7')
})

test('colour mapping', () => {
	assert.equal(PALETTE.length, 128)
	assert.equal(nearestPalette({ r: 255, g: 0, b: 0 }), 5)
	assert.equal(nearestPalette({ r: 0, g: 255, b: 0 }), 21)
	assert.equal(nearestPalette({ r: 0, g: 0, b: 255 }), 45)
	assert.equal(nearestPalette({ r: 255, g: 255, b: 255 }), 3)
	assert.equal(nearestPalette({ r: 5, g: 5, b: 5 }), 0)
	assert.equal(triColour({ r: 255, g: 0, b: 0 }), 3)
	assert.equal(triColour({ r: 255, g: 160, b: 0 }), 5)
	assert.equal(triColour({ r: 0, g: 200, b: 0 }), 1)
	assert.equal(triColour({ r: 0, g: 0, b: 255 }), 1)
	assert.equal(triColour({ r: 200, g: 200, b: 200 }), 5)
	assert.equal(biColour({ r: 255, g: 80, b: 0 }), 2)
	assert.equal(biColour({ r: 255, g: 255, b: 0 }), 1)
	assert.deepEqual(
		rgbSysex(0x4f, 10, { r: 255, g: 128, b: 0 }),
		[0xf0, 0x47, 0x7f, 0x4f, 0x24, 0x00, 0x08, 10, 10, 1, 0x7f, 1, 0x00, 0, 0, 0xf7],
	)
	assert.equal(relativeDelta(64), -64)
})
