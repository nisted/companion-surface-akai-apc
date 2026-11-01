import { Input, Output } from '@julusian/midi/lazy'
import { isSecondaryPort, type ModelDef, modelForPort } from './models.js'

let _input: Input | undefined
let _output: Output | undefined

/** Port names, with ' 1', ' 2'... added when several ports share a name (several of one model) */
export function numbered(names: string[]): string[] {
	const out: string[] = []
	for (const name of names) {
		let n = name
		let i = 0
		while (out.includes(n)) n = `${name} ${++i}`
		out.push(n)
	}
	return out
}

export function inputNames(): string[] {
	try {
		_input ??= new Input()
		const input = _input
		return numbered(Array.from({ length: input.getPortCount() }, (_, i) => input.getPortName(i)))
	} catch {
		return []
	}
}

export function outputNames(): string[] {
	try {
		_output ??= new Output()
		const output = _output
		return numbered(Array.from({ length: output.getPortCount() }, (_, i) => output.getPortName(i)))
	} catch {
		return []
	}
}

export interface FoundApc {
	model: ModelDef
	inputName: string
	outputName: string
}

/**
 * Every APC plugged in, by its control port. Models with a second port
 * (keys / notes) are matched on the first one only.
 */
export function findApcs(inputs: string[], outputs: string[]): FoundApc[] {
	const found: FoundApc[] = []
	const controlInputs = inputs.filter((n) => modelForPort(n) && !isSecondaryPort(n))
	const controlOutputs = outputs.filter((n) => modelForPort(n) && !isSecondaryPort(n))
	for (const inputName of controlInputs) {
		const model = modelForPort(inputName)!
		// same name, else the same-model output in the same position (Windows names can differ slightly)
		const sameModelIns = controlInputs.filter((n) => modelForPort(n) === model)
		const sameModelOuts = controlOutputs.filter((n) => modelForPort(n) === model)
		const outputName = outputs.includes(inputName)
			? inputName
			: (sameModelOuts[sameModelIns.indexOf(inputName)] ?? sameModelOuts[0])
		if (outputName) found.push({ model, inputName, outputName })
	}
	return found
}
