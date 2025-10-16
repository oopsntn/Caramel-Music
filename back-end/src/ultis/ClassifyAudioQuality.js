const classifyAudioQuality = (metadata, bitrate) => {
  const bitDepth = metadata.bitDepth || 0;
  const sampleRate = metadata.sampleRate || 0;
  const bitrateNum = parseInt(bitrate) || 0;

  // console.log("🎵 classifyAudioQuality debug:", {
  //   bitDepth,
  //   sampleRate,
  //   bitrateNum
  // });

  let encoding, label, tier;

  // Determine encoding based on audio specs
  if (bitDepth === 1) {
    encoding = "DSD";
  } else if (bitDepth === 24 || bitDepth === 32) {
    encoding = "Hi-Res";
  } else if (bitDepth === 16 && sampleRate === 48000) {
    encoding = "EHQ";
  } else if (bitDepth === 16 && sampleRate === 44100) {
    encoding = "HQ";
  } else if (bitrateNum >= 128 && bitrateNum <= 320) {
    encoding = "SQ";
  } else {
    encoding = "SQ"; // Default fallback
  }

  // Determine label based on encoding and specs
  switch (encoding) {
    case "DSD":
      if (sampleRate >= 11289600) {
        label = "DSD256";
      } else if (sampleRate >= 5644800) {
        label = "DSD128";
      } else {
        label = "DSD64";
      }
      break;
    case "Hi-Res":
      if ((bitDepth === 24 || bitDepth === 32) && sampleRate === 48000) {
        label = "Hi-Res 48kHz";
      } else if ((bitDepth === 24 || bitDepth === 32) && sampleRate === 88200) {
        label = "Hi-Res 88.2kHz";
      } else if ((bitDepth === 24 || bitDepth === 32) && sampleRate === 96000) {
        label = "Hi-Res 96kHz";
      } else if ((bitDepth === 24 || bitDepth === 32) && sampleRate === 176400) {
        label = "Hi-Res 176.4kHz";
      } else if ((bitDepth === 24 || bitDepth === 32) && sampleRate === 192000) {
        label = "Hi-Res 192kHz";
      } else {
        label = `Hi-Res ${(sampleRate / 1000).toFixed(1)}kHz`;
      }
      break;
    case "EHQ":
      label = "Enhanced High Quality (CD)";
      break;
    case "HQ":
      label = "High Quality (CD)";
      break;
    case "SQ":
      if (bitrateNum < 128 || bitrateNum === 0) {
        label = `Low ${bitrateNum || 'Unknown'}kbps`;
      } else if (bitrateNum === 128000) {
        label = "Standard 128kbps";
      } else if (bitrateNum === 192000) {
        label = "Medium 192kbps";
      } else if (bitrateNum === 256000) {
        label = "High 256kbps";
      } else if (bitrateNum === 320000) {
        label = "High 320kbps";
      } else {
        label = `${bitrateNum}kbps`;
      }
      break;
    default:
      label = "Unknown Quality";
  }

  // Determine tier based on encoding
  switch (encoding) {
    case "DSD":
      tier = "Ultimate";
      break;
    case "Hi-Res":
      tier = "Premium";
      break;
    case "EHQ":
    case "HQ":
      tier = "High";
      break;
    case "SQ":
    default:
      tier = "Standard";
  }

  return { encoding, label, tier };
};
export { classifyAudioQuality };
