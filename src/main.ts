import type { DetectionSurfaceInfo, OpenSurfaceResult, SurfaceContext, SurfacePlugin } from '@companion-surface/base'
import { Input, Output } from '@julusian/midi/lazy'
import { ApcSurface } from './instance.js'
import { buildLayout } from './layout.js'
import { findApcs, inputNames, outputNames } from './midi-ports.js'
import { MODELS } from './models.js'

/** Time for the APC to take the introduction message before LEDs are sent */
const INTRO_SETTLE_MS = 150

export interface ApcPortInfo {
	modelId: string
	inputName: string
	outputName: string
}

function closeQuietly(...ports: Array<Input | Output>): void {
	for (const port of ports) {
		try {
			port.closePort()
			port.destroy()
		} catch {
			/* empty */
		}
	}
}

const ApcPlugin: SurfacePlugin<ApcPortInfo> = {
	init: async (): Promise<void> => {},
	destroy: async (): Promise<void> => {},

	scanForSurfaces: async (): Promise<DetectionSurfaceInfo<ApcPortInfo>[]> => {
		return findApcs(inputNames(), outputNames()).map(({ model, inputName, outputName }) => ({
			deviceHandle: `apc:${inputName}`,
			surfaceId: `akai-apc:${model.id}:${inputName}`,
			description: `Akai ${model.name} (${inputName})`,
			pluginInfo: { modelId: model.id, inputName, outputName },
		}))
	},

	openSurface: async (surfaceId: string, info: ApcPortInfo, context: SurfaceContext): Promise<OpenSurfaceResult> => {
		const model = MODELS.find((m) => m.id === info.modelId)
		if (!model) throw new Error(`Unknown APC model ${info.modelId}`)
		const input = new Input()
		const output = new Output()
		try {
			const inIndex = inputNames().indexOf(info.inputName)
			const outIndex = outputNames().indexOf(info.outputName)
			if (inIndex < 0 || outIndex < 0) throw new Error(`${model.name} MIDI port not found`)
			input.openPort(inIndex)
			output.openPort(outIndex)
			if (model.intro) {
				output.sendMessage(model.intro)
				await new Promise((r) => setTimeout(r, INTRO_SETTLE_MS))
			}

			const layout = buildLayout(model)
			const hasRing = layout.controls.some((c) => c.led === 'ring')
			return {
				surface: new ApcSurface(surfaceId, context, input, output, info.inputName, info.outputName, layout),
				registerProps: {
					brightness: true,
					surfaceLayout: {
						stylePresets: { default: { colors: 'hex' } },
						controls: Object.fromEntries(layout.controls.map((c) => [c.controlId, { row: c.row, column: c.column }])),
					},
					transferVariables: layout.controls
						.filter((c) => c.variableId)
						.map((c) => ({ id: c.variableId!, type: 'input' as const, name: `${c.name} value`, description: '0-127' })),
					pincodeMap: null,
					location: info.inputName,
					configFields: [
						{
							id: 'faderStep',
							type: 'number',
							label: 'Fader/knob movement per rotate step',
							description:
								'As a fader or knob moves, it fires rotate left/right on its button (0-127 over full travel). ' +
								'1 = every single step. Higher = fewer, chunkier steps.',
							default: 1,
							min: 1,
							max: 32,
						},
						{
							id: 'valueIntervalMs',
							type: 'number',
							label: 'Fader/knob value update interval (ms)',
							description:
								'Value variables update no more often than this. Wherever you stop, that final position always gets sent. ' +
								"Keep it above 50 and Companion won't grumble 'Rate limited' at your variable triggers. 0 = every change.",
							default: 60,
							min: 0,
							max: 1000,
						},
						...(hasRing
							? [
									{
										id: 'ringStyle',
										type: 'number' as const,
										label: 'Knob ring style',
										description:
											'How the LED ring round each knob shows its position. 0 off, 1 single dot, 2 fill (volume), 3 from centre (pan)',
										default: 1,
										min: 0,
										max: 3,
									},
								]
							: []),
						{
							id: 'crew',
							type: 'static-text',
							label: "Psst. This one's got mates. 🍹",
							value:
								"Akai APC is part of a little crew of Companion modules: some brand new, some old favourites given a good tweak. Want to know who else is in the crew, or grab the freshest version of each one? It's all here: " +
								'https://github.com/nisted/companion-modules',
						},
					],
				},
			}
		} catch (e) {
			closeQuietly(input, output)
			throw e
		}
	},
}

export default ApcPlugin
