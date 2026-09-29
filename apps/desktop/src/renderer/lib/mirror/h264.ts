/**
 * Minimal H.264 Annex-B helpers for WebCodecs. Pure, no imports, so the
 * main-process test runner can exercise them.
 *
 * scrcpy sends the codec configuration (SPS + PPS, Annex-B start codes) as a
 * separate "config" packet at the start of every capture session. We decode
 * in Annex-B mode (VideoDecoder without a `description`), which requires the
 * parameter sets to be in-band: the config packet is prepended to the next
 * key frame, like the scrcpy client's packet merger does.
 */

/** Byte offsets of each NAL unit payload (after its start code). */
export function findNalUnits(data: Uint8Array): Array<{ offset: number; end: number; type: number }> {
  const starts: number[] = [];
  for (let i = 0; i + 2 < data.length; i++) {
    if (data[i] === 0 && data[i + 1] === 0) {
      if (data[i + 2] === 1) {
        starts.push(i + 3);
        i += 2;
      } else if (data[i + 2] === 0 && i + 3 < data.length && data[i + 3] === 1) {
        starts.push(i + 4);
        i += 3;
      }
    }
  }
  return starts.map((offset, index) => {
    let end = index + 1 < starts.length ? starts[index + 1] - 3 : data.length;
    // A 4-byte start code leaves one extra zero before the next payload.
    if (index + 1 < starts.length && end > offset && data[end - 1] === 0) end -= 1;
    return { offset, end, type: data[offset] & 0x1f };
  });
}

const hex2 = (value: number) => value.toString(16).padStart(2, '0');

/**
 * RFC 6381 codec string from the SPS in an Annex-B config packet:
 * avc1.<profile_idc><constraint_flags><level_idc>. Null when no SPS is found.
 */
export function avcCodecStringFromConfig(config: Uint8Array): string | null {
  const sps = findNalUnits(config).find((nal) => nal.type === 7);
  if (!sps || sps.end - sps.offset < 4) return null;
  const profile = config[sps.offset + 1];
  const constraints = config[sps.offset + 2];
  const level = config[sps.offset + 3];
  return `avc1.${hex2(profile)}${hex2(constraints)}${hex2(level)}`;
}

/** Concatenate the config packet and a frame (scrcpy's packet merger). */
export function mergeConfigAndFrame(config: Uint8Array, frame: Uint8Array): Uint8Array {
  const merged = new Uint8Array(config.length + frame.length);
  merged.set(config, 0);
  merged.set(frame, config.length);
  return merged;
}
