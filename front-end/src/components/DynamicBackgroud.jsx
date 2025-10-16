export default function DynamicBackground({ track, isFullPlayer }) {
  const imageUrl =
    track?.albumArtUrl
      ? track.albumArtUrl
          .replace(/\s/g, "%20")
          .replace(/\(/g, "%28")
          .replace(/\)/g, "%29")
          .replace(/#/g, "%23")
      : null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background:
          isFullPlayer && imageUrl
            ? `url(${imageUrl}) center/cover no-repeat`
            : "#222222",
        filter: isFullPlayer && track ? "blur(20px)" : "none",
        opacity: isFullPlayer && track ? 0.6 : 1,
        zIndex: -1,
        transition: "background 0.5s ease-in-out",
      }}
    ></div>
  );
}
