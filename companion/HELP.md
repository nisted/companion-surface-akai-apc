# Akai APC

Turns an Akai APC controller into a Companion surface over USB MIDI. The model is recognised from its MIDI port name, and every pad, button, fader and knob becomes a Companion button laid out like the panel, so it follows pages like a Stream Deck.

## Supported models

| Model | Pads | Status |
| --- | --- | --- |
| APC40 | 5×8, green / red / yellow | From Akai's protocol, not yet tested |
| APC40 mkII | 5×8, colour | From Akai's protocol, not yet tested |
| APC20 | 5×8, green / red / yellow | Not yet tested |
| APC mini | 8×8, green / red / yellow | Not yet tested |
| APC mini mk2 | 8×8, full colour | From Akai's protocol, not yet tested |
| APC Key 25 | 5×8, green / red / yellow | Not yet tested (pads and controls only, not the keys) |
| APC Key 25 mk2 | 5×8, full colour | From Akai's protocol, not yet tested (pads and controls only) |

The APC64 isn't supported: Akai hasn't published how to control its pads and lights.

## What each control does

| APC control | In Companion |
| --- | --- |
| Pad / button | Press and release |
| Fader or knob | Rotate left/right as it moves, **and** its 0-127 value as a surface variable |
| Endless knob (Cue Level, Tempo, Key 25 mk2 knobs) | Rotate left/right |
| Light | Shows the button's background colour |

Rotate actions only fire if the button has **Enable rotary actions** ticked. Fader and knob values appear in the surface's settings as variables, which you can link to custom variables.

## Colours

- **Full-colour pads** (APC mini mk2, Key 25 mk2) show the exact colour. **APC40 mkII** pads show the nearest of its 128 colours.
- **Original APC pads** can only show green, red or yellow: reds, pinks and purples show red; oranges, yellows and whites show yellow; greens, cyans and blues show green.
- **Single-colour buttons** light for any colour that isn't black.
- **APC40 knob rings** follow the knob. Their style (dot, fill or from centre) is in the surface settings.

## Setting up

1. Plug the APC in. Close Ableton Live or anything else using its MIDI port (on Windows, one program at a time).
2. Remove any Generic MIDI connection in Companion that used the APC.
3. It appears in Companion's Surfaces tab.

The APC40, APC40 mkII and APC20 are switched into the mode where Companion controls every light and every button is momentary.

## Linking with a Stream Deck

To make the APC follow the same page as a Stream Deck, put both in the same **surface group** in Companion's Surfaces tab.

Requires Companion 5.0.

### Psst. This one's got mates. 🍹

Akai APC is part of a little crew of Companion modules: some brand new, some old favourites given a good tweak. Want to know who else is in the crew, or grab the freshest version of each one? It's all here: [github.com/nisted/companion-modules](https://github.com/nisted/companion-modules)
