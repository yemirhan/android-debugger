# App icon

`icon.png` is the opaque 1024 × 1024 square source. `icon.icns` contains the
macOS icon sizes, including Retina representations up to 1024 pixels.
The artwork fills the square for the system's rounded-square mask on macOS 26.
See [Apple's icon guidance](https://developer.apple.com/design/human-interface-guidelines/app-icons).
This is a static ICNS asset, not a layered Icon Composer asset with dynamic
Liquid Glass appearances.

The packaged macOS app uses `icon.icns` through the Electron Builder config.
The development app uses `icon.png` for its Dock icon.

Regenerate the ICNS on macOS with:

```sh
bash apps/desktop/scripts/generate-icon.sh
```

Generated with the built-in image generation tool, with transparency disabled.

## Generation prompt

Edit this Android Debugger icon into a full-bleed square icon source for macOS 26, which applies its own rounded-square system mask. Preserve exactly the green robot and graphite magnifying glass design. Replace the entire surrounding background and rounded tile with a continuous fully opaque pale cool silver-blue softly shaded background extending to ALL FOUR canvas edges and corners. No transparency anywhere. No inset tile, no outer border, no outer rim, no rounded rectangle drawn inside the image, no visible tile boundary, no exterior margins. Background fills the entire 1024x1024 square. Keep the robot and magnifying glass centered and contained within the middle 75 percent of the image with comfortable safety padding for OS corner masking. Polished subtle glass-like materials, same identity and colors, no text or extra symbols. The output must have four fully filled square corners; the OS provides the final rounded-square silhouette.
