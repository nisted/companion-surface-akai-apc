# Akai APC

Plug an Akai APC in over USB MIDI and it becomes a Companion surface. I work out which model it is from its MIDI port name, then every pad, button, fader and knob turns into a Companion button, laid out just like the panel. It follows pages like a Stream Deck does. Same idea, more faders.

## Which APCs?

| Model | Pads | Status |
| --- | --- | --- |
| APC40 | 5×8, green / red / yellow | From Akai's protocol, not yet tested |
| APC40 mkII | 5×8, colour | From Akai's protocol, not yet tested |
| APC20 | 5×8, green / red / yellow | Not yet tested |
| APC mini | 8×8, green / red / yellow | Not yet tested |
| APC mini mk2 | 8×8, full colour | From Akai's protocol, not yet tested |
| APC Key 25 | 5×8, green / red / yellow | Not yet tested (pads and controls only, not the keys) |
| APC Key 25 mk2 | 5×8, full colour | From Akai's protocol, not yet tested (pads and controls only) |

Sorry, APC64 owners: Akai hasn't published how to drive its pads and lights, so it's not on the list.

## What each control does

| APC control | In Companion |
| --- | --- |
| Pad / button | Press and release |
| Fader or knob | Rotate left/right as it moves, **and** its 0-127 value as a surface variable |
| Endless knob (Cue Level, Tempo, Key 25 mk2 knobs) | Rotate left/right |
| Light | Shows the button's background colour |

Rotate actions only fire if the button has **Enable rotary actions** ticked. Easy one to miss. Fader and knob values show up as variables in the surface's settings, and you can link them to custom variables from there.

## Colours

- **Full-colour pads** (APC mini mk2, Key 25 mk2) show the exact colour. **APC40 mkII** pads show the nearest of their 128 colours.
- **Original APC pads** only do green, red or yellow, so I pick the closest: reds, pinks and purples go red; oranges, yellows and whites go yellow; greens, cyans and blues go green.
- **Single-colour buttons** light up for any colour that isn't black.
- **APC40 knob rings** follow the knob. Pick the style (dot, fill or from centre) in the surface settings.

## Getting going

1. Plug the APC in. Close Ableton Live or anything else using its MIDI port (on Windows, only one program can have it at a time).
2. Remove any Generic MIDI connection in Companion that was using the APC.
3. That's it. It turns up in Companion's Surfaces tab.

On the APC40, APC40 mkII and APC20, I switch the unit into the mode where Companion controls every light and every button is momentary.

## Pairing up with a Stream Deck

Want the APC to follow the same page as a Stream Deck? Put them both in the same **surface group** in Companion's Surfaces tab.

Needs Companion 5.0.

### Psst. This one's got mates. 🍹

Akai APC is part of a little crew of Companion modules: some brand new, some old favourites given a good tweak. Want to know who else is in the crew, or grab the freshest version of each one? It's all here: [github.com/nisted/companion-modules](https://github.com/nisted/companion-modules)
