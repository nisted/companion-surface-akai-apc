# companion-surface-akai-apc

A Bitfocus Companion 5 surface module for Akai APC controllers: APC40, APC40 mkII, APC20, APC mini, APC mini mk2, APC Key 25 and APC Key 25 mk2, over USB MIDI. One module covers them all; the model is recognised from its MIDI port name.

See [companion/HELP.md](companion/HELP.md) for what it does and how to set it up.

## Building

```
corepack enable
yarn install
yarn package   # makes akai-apc-<version>.tgz to import into Companion
yarn test      # checks the model maps and LED logic, no device needed
```

On Windows, run `set PSExecutionPolicyPreference=Bypass` in the same Command Prompt first, or the code is left out of the .tgz.

## Code

- `src/models.ts`: every model's controls (MIDI message, LED type, place in Companion). Adding a model is one entry here.
- `src/leds.ts`: Companion colours to each kind of APC light.
- `src/layout.ts`: incoming MIDI to button presses, rotations and values.
- `src/instance.ts`, `src/main.ts`: the Companion surface itself.
