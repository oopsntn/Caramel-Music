export default function DynamicBackground({ track }) {
    return (
        <div
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                background: track
                    ? `url(${track.albumArtUrl}) center/cover no-repeat`
                    : "#3399FF",
                filter: track ? "blur(20px)" : "none",
                opacity: 0.6,
                zIndex: -1,
                transition: "background 0.5s ease-in-out"
            }}
        ></div>
    );
}
