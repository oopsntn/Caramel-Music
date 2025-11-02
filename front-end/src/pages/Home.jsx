import { useEffect, useState, useRef, useCallback } from "react";
import { Container, Row, Col, Card, Spinner, Button, ListGroup, FormControl, Table, Navbar, Badge } from "react-bootstrap";
import axios from "axios";
import { FaPlay, FaPause, FaStepBackward, FaStepForward, FaRedo, FaRandom, FaSortDown, FaVolumeUp, FaVolumeMute, FaHome, FaSearch, FaBell, FaUsers, FaSync } from 'react-icons/fa';
import DynamicBackground from "../components/DynamicBackgroud";

export default function Home() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [scanning, setScanning] = useState(false);
    const [currentTrack, setCurrentTrack] = useState(null);
    const [filterSearch, setFilterSearch] = useState('');
    const audioRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [repeat, setRepeat] = useState(false);
    const [shuffle, setShuffle] = useState(false);
    const [currentLyricIndex, setCurrentLyricIndex] = useState(0);
    const [isFullPlayer, setIsFullPlayer] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(0.6);
    const [isMuted, setIsMuted] = useState(false);
    const [lastVolume, setLastVolume] = useState(1);

    useEffect(() => {
        axios.get("/api/items")
            .then((res) => {
                setItems(res.data); // Load list nhạc ngay
                setLoading(false);
            });
    }, []);

    const handleScanMusic = async () => {
        setScanning(true);
        try {
            await axios.get("/1$4?metadata=true");
            const res = await axios.get("/api/items");
            setItems(res.data);
            alert("Quét nhạc thành công");
        } catch (error) {
            console.error("Lỗi khi quét nhạc:", error);
            alert("Có lỗi xảy ra khi quét nhạc!");
        } finally {
            setScanning(false);
        }
    }

    const getTotalDuration = () => {
        let totalSeconds = 0;
        items.forEach(item => {
            if (item.duration) {
                const parts = item.duration.split(':');
                if (parts.length === 2) {
                    totalSeconds += parseInt(parts[0]) * 60 + parseInt(parts[1]);
                } else if (parts.length === 3) {
                    totalSeconds += parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
                }
            }
        });
        
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m ${seconds}s`;
    };

    const playTrack = useCallback((track) => {
        setCurrentTrack(track);

    }, [])

    const getCurrentIndex = useCallback(() => {
        return items.findIndex(i => i.id === currentTrack?.id)
    }, [items, currentTrack]);

    //Bài tiếp theo
    const playNext = useCallback(() => {
        if (!items.length) return;
        let nextIndex;
        if (shuffle) {
            nextIndex = Math.floor(Math.random() * items.length);
        } else {
            const currentIndex = getCurrentIndex();
            nextIndex = (currentIndex + 1) % items.length;
        }
        playTrack(items[nextIndex]);
    }, [items, shuffle, getCurrentIndex, playTrack]);

    // Quay lại bài trước
    const playPrev = useCallback(() => {
        if (!items.length) return;
        const currentIndex = getCurrentIndex();
        const prevIndex = (currentIndex - 1 + items.length) % items.length;
        playTrack(items[prevIndex]);
    }, [items, getCurrentIndex, playTrack]);

    const togglePlayPause = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;

        if (audio.paused) {
            audio.play();
        } else {
            audio.pause();
        }
    }, []);
    useEffect(() => {
        if (currentTrack && audioRef.current) {
            const audio = audioRef.current;
            audio.src = currentTrack.url;
            audio.load();
            audio.onloadedmetadata = () => {
                audio.play().catch(console.error);
            };
            setCurrentLyricIndex(0);
            setCurrentTime(0);
            const container = document.getElementById("lyrics-container");
            if (container) container.scrollTop = 0;
        }
    }, [currentTrack]);
    // Lắng nghe sự kiện audio
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);
        const handleEnded = () => {
            if (repeat) {
                audio.currentTime = 0;
                audio.play();
                // 🔹 Reset lyric khi replay
                setCurrentLyricIndex(0);
                const container = document.getElementById("lyrics-container");
                if (container) container.scrollTop = 0;
            } else {
                playNext();
            }
        };

        const updateTime = () => setCurrentTime(audio.currentTime);
        const setAudioData = () => setDuration(audio.duration);

        audio.addEventListener("play", handlePlay);
        audio.addEventListener("pause", handlePause);
        audio.addEventListener("ended", handleEnded);
        audio.addEventListener("timeupdate", updateTime);
        audio.addEventListener("loadedmetadata", setAudioData);
        return () => {
            audio.removeEventListener("play", handlePlay);
            audio.removeEventListener("pause", handlePause);
            audio.removeEventListener("ended", handleEnded);
            audio.removeEventListener("timeupdate", updateTime);
            audio.removeEventListener("loadedmetadata", setAudioData);
        };
    }, [repeat, shuffle, items, currentTrack, playNext]);
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !currentTrack?.lyrics?.[0]?.syncText) return;

        const checkLyric = () => {
            const timeMs = audio.currentTime * 1000; // audio.currentTime là giây, dữ liệu timestamp là ms
            const idx = currentTrack.lyrics[0].syncText.findIndex(
                (line, i) =>
                    timeMs >= line.timestamp &&
                    timeMs < (currentTrack.lyrics[0].syncText[i + 1]?.timestamp || Infinity)
            );
            if (idx !== -1 && idx !== currentLyricIndex) setCurrentLyricIndex(idx);
        };

        audio.addEventListener("timeupdate", checkLyric);
        const container = document.getElementById("lyrics-container");
        const element = document.getElementById(`lyric-${currentLyricIndex}`);
        if (container && element) {
            container.scrollTop = element.offsetTop - container.offsetTop - container.clientHeight / 2 + element.clientHeight / 2;
        }
        return () => audio.removeEventListener("timeupdate", checkLyric);
    }, [currentTrack, currentLyricIndex]);
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Nếu đang gõ trong input/textarea thì bỏ qua
            if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
                return;
            }

            if (e.code === "Space") {
                e.preventDefault(); // ngăn scroll khi bấm space
                togglePlayPause();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [togglePlayPause]);

    if (loading) {
        return (
            <Container className="text-center mt-5">
                <Spinner animation="border" />
                <p>Đang tải dữ liệu nhạc...</p>
            </Container>
        );
    }

    // useEffect(() => {
    //     if (localData?.items) {
    //         setItems(localData.items);
    //     }
    //     setLoading(false);
    // }, []);

    //Loại bỏ dấu ở phiu tơ
    const removeVietnameseTones = (str) => {
        return String(str)
            .normalize("NFD") // tách dấu
            .replace(/[\u0300-\u036f]/g, "") // xóa dấu
            .replace(/đ/g, "d").replace(/Đ/g, "D")
            .toLowerCase(); // về lowercase cho dễ so sánh
    };

    //phiu tơ này
    const filterMusic = items.filter(i => {
        const keywords = (removeVietnameseTones(filterSearch) || "").split(" ").filter(Boolean);
        const text = removeVietnameseTones(`${i.title ?? ""} ${i.artist ?? ""} ${i.genre}`);
        return keywords.every(keyword => text.includes(keyword));
    })

    const handleSearchChange = (e) => {
        setFilterSearch(e.target.value)
    }
    // Hàm format mm:ss
    const formatTime = (seconds) => {
        if (!seconds) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60).toString().padStart(2, "0");
        return `${m}:${s}`;
    };

    // const toggleMute = () => {
    //     if (isMuted) {
    //         setVolume(lastVolume); // khôi phục volume trước khi mute
    //     } else {
    //         setLastVolume(volume); // lưu lại volume hiện tại
    //         setVolume(0);
    //     }
    //     setIsMuted(!isMuted);
    // };

    const encodeImageUrl = (url) => {
        return url
            ?.replace(/\s/g, '%20')
            .replace(/\(/g, '%28')
            .replace(/\)/g, '%29')
            .replace(/#/g, '%23');
    };

    return (
        <div>
            <DynamicBackground track={currentTrack} isFullPlayer={isFullPlayer} />
            <Navbar
                expand="lg"
                className="px-3"
                style={{ height: "64px", backgroundColor: "#000000", backdropFilter: "blur(10px)" }}
            >
                <Container fluid className="d-flex align-items-center justify-content-between">
                    {/* Logo + text */}
                    <div className="d-flex align-items-center gap-2 flex-shrink-0">
                        <img src="/logo.png" style={{ height: "32px", cursor: "pointer" }} alt="logo"/>
                        <span className="text-white d-none d-md-inline">fangnhip</span>
                    </div>

                    {/* Middle: Home + Search */}
                    <div className="d-flex align-items-center flex-grow-1 justify-content-center px-3">
                        {/* Home */}
                        <Button
                            className="d-flex align-items-center justify-content-center rounded-circle p-2 me-2 flex-shrink-0"
                            style={{ backgroundColor: "#2a2a2a", border: "none", width: "40px", height: "40px" }}
                        >
                            <FaHome size={18} />
                        </Button>

                        {/* Search bar */}
                        <div
                            className="d-flex align-items-center px-3 rounded-pill flex-grow-1 flex-shrink-1"
                            style={{
                                backgroundColor: "#2a2a2a",
                                height: "40px",
                                minWidth: "120px", // co tối đa nhưng không biến mất
                                maxWidth: "400px",
                            }}
                        >
                            <FaSearch size={16} className="me-2 text-secondary" />
                            <FormControl
                                type="text"
                                placeholder="Search"
                                value={filterSearch}
                                onChange={handleSearchChange}
                                className="bg-transparent border-0 text-white"
                                style={{ boxShadow: "none" }}
                            />
                        </div>

                        <Button
                            className="d-flex align-items-center justify-content-center rounded-circle p-2 ms-2 flex-shrink-0"
                            style={{ backgroundColor: "#1DB954", border: "none", width: "40px", height: "40px" }}
                            onClick={handleScanMusic}
                            disabled={scanning}
                            title="Quét nhạc"
                        >
                            <FaSync size={18} className={scanning ? "fa-spin" : ""} />
                        </Button>
                    </div>

                    {/* Right section */}
                    <div className="d-flex align-items-center gap-2 flex-shrink-0">
                        <Button
                            variant="light"
                            className="fw-bold rounded-pill px-3 py-1 d-none d-xl-inline"
                        >
                            Explore Premium
                        </Button>
                        <Button
                            style={{ backgroundColor: "#2a2a2a", border: "none" }}
                            className="d-none d-lg-inline"
                        >
                            Install App
                        </Button>
                        <FaUsers size={18} style={{ color: "white", cursor: "pointer" }} className="d-none d-md-inline" />
                        <FaBell size={18} style={{ color: "white", cursor: "pointer" }} className="d-none d-md-inline" />
                        <div
                            className="rounded-circle d-flex align-items-center justify-content-center"
                            style={{
                                backgroundColor: "#333",
                                color: "white",
                                width: "32px",
                                height: "32px",
                                fontSize: "0.9rem",
                                fontWeight: "bold",
                                cursor: "pointer",
                            }}
                        >
                            N
                        </div>
                    </div>
                </Container>
            </Navbar>

            <Container className="mt-3">
                <Row className="mb-3 d-flex justify-content-center">
                    <Col md={10} lg={8}>
                        <div className="d-flex gap-3 align-items-center justify-content-center">
                            <Badge bg="secondary" className="px-3 py-2">
                                Tổng: {items.length} bài hát
                            </Badge>
                            <Badge bg="info" className="px-3 py-2">
                                Thời lượng: {getTotalDuration()}
                            </Badge>
                        </div>
                    </Col>
                </Row>
                <Row className="d-flex justify-content-center">
                    <Col md={10} lg={8}>
                        <div style={{ maxHeight: "85vh", overflowY: "auto" }} className="custom-scroll">
                            <Table hover bordered className="table-glass text-white align-self-center mb-0">
                                <thead className="bg-dark sticky-top">
                                    <tr>
                                        <th style={{ width: "72px" }}>#</th>
                                        <th>Title</th>
                                        <th>Artist</th>
                                        <th className="d-none d-md-table-cell">Album</th>
                                        <th className="d-none d-lg-table-cell">Duration</th>
                                        <th className="d-none d-xl-table-cell">Genre</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filterMusic.map((i) => (
                                        <tr key={i.id} onClick={() => playTrack(i)} style={{ cursor: "pointer" }}>
                                            <td>
                                                <img
                                                    src={encodeImageUrl(i.albumArtUrl)}
                                                    // loading="lazy"
                                                    width="50"
                                                    height="50"
                                                    className="album-art"
                                                    alt={`${i.title} album art`}
                                                />
                                            </td>
                                            <td>{i.title}</td>
                                            <td>{i.artist}</td>
                                            <td className="d-none d-md-table-cell">{i.album}</td>
                                            <td className="d-none d-lg-table-cell">{i.duration}</td>
                                            <td className="d-none d-xl-table-cell">{i.genre}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </Table>
                        </div>
                    </Col>
                </Row>
            </Container>

            <div className="sticky-bottom ">
                {!isFullPlayer && (
                    <Card
                        style={{
                            position: "fixed",
                            bottom: 0,
                            left: 0,
                            right: 0,
                            backgroundColor: "#000000ff",
                            border: "none",
                            cursor: currentTrack ? "pointer" : "default",
                            height: "72px",
                        }}
                        onClick={() => currentTrack && setIsFullPlayer(true)}
                    >
                        <Card.Body className="py-2 px-3">
                            <Row
                                className="align-items-center text-white justify-content-center"
                                style={{
                                    opacity: currentTrack ? 1 : 0.5,
                                    pointerEvents: currentTrack ? "auto" : "none",
                                }}
                            >
                                {/* LEFT: Thông tin bài hát */}
                                <Col
                                    md={4}
                                    className="d-flex align-items-center flex-shrink-1 overflow-hidden d-none d-sm-flex"
                                >
                                    {currentTrack && (
                                        <>
                                            <img
                                                src={encodeImageUrl(currentTrack.albumArtUrl)}
                                                alt="Album Art"
                                                width="48"
                                                height="48"
                                                className="album-art me-2"
                                            />
                                            <div className="d-none d-md-flex flex-column overflow-hidden">
                                                <div className="fw-bold text-truncate" style={{ fontSize: "0.9rem" }}>
                                                    {currentTrack.title}
                                                </div>
                                                <div className="small text-truncate" style={{ fontSize: "0.75rem" }}>
                                                    {currentTrack.artist} - {currentTrack.quality?.label}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </Col>

                                {/* CENTER: Controls */}
                                <Col
                                    md={4}
                                    className="d-flex flex-column align-items-center justify-content-center"
                                    style={{ minWidth: "200px" }}
                                >
                                    <div className="d-flex justify-content-center align-items-center gap-4 mb-2">
                                        <FaRandom
                                            size={14}
                                            style={{ color: shuffle ? "#1DB954" : "white" }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setShuffle(!shuffle);
                                            }}
                                        />
                                        <FaStepBackward
                                            size={18}
                                            style={{ cursor: "pointer" }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                playPrev();
                                            }}
                                        />
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                togglePlayPause();
                                            }}
                                            style={{
                                                borderRadius: "50%",
                                                width: "36px",
                                                height: "36px",
                                                background: currentTrack ? "white" : "#555",
                                                border: "none",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                            }}
                                        >
                                            {isPlaying ? <FaPause size={16} color="black" /> : <FaPlay size={16} color="black" />}
                                        </button>
                                        <FaStepForward
                                            size={18}
                                            style={{ cursor: "pointer" }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                playNext();
                                            }}
                                        />
                                        <FaRedo
                                            size={14}
                                            style={{ color: repeat ? "#1DB954" : "white" }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setRepeat(!repeat);
                                            }}
                                        />
                                    </div>

                                    {/* Progress bar */}
                                    <div className="d-flex align-items-center gap-2 w-100">
                                        <small style={{ fontSize: "0.7rem", width: "32px", textAlign: "right" }}>
                                            {currentTrack ? formatTime(currentTime) : "--:--"}
                                        </small>
                                        <input
                                            type="range"
                                            min={0}
                                            max={currentTrack ? duration : 0}
                                            step={0.1}
                                            value={currentTrack ? currentTime : 0}
                                            disabled={!currentTrack}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => {
                                                audioRef.current.currentTime = e.target.value;
                                                setCurrentTime(e.target.value);
                                            }}
                                            style={{
                                                "--progress": currentTrack
                                                    ? `${(currentTime / (duration || 1)) * 100}%`
                                                    : "0%",
                                                height: "3px",
                                            }}
                                            className="progress-bar-custom flex-grow-1"
                                        />
                                        <small style={{ fontSize: "0.7rem", width: "32px" }}>
                                            {currentTrack ? formatTime(duration) : "--:--"}
                                        </small>
                                    </div>
                                </Col>

                                {/* RIGHT: Volume */}
                                <Col
                                    md={4}
                                    className="d-flex justify-content-end align-items-center d-none d-lg-flex"
                                >
                                    {(isMuted || volume === 0) ? (
                                        <FaVolumeMute
                                            size={16}
                                            style={{ cursor: "pointer", marginRight: "6px" }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setIsMuted(false);
                                                setVolume(lastVolume || 1);
                                                audioRef.current.volume = lastVolume || 1;
                                            }}
                                        />
                                    ) : (
                                        <FaVolumeUp
                                            size={16}
                                            style={{ cursor: "pointer", marginRight: "6px" }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setIsMuted(true);
                                                setLastVolume(volume);
                                                setVolume(0);
                                                audioRef.current.volume = 0;
                                            }}
                                        />
                                    )}
                                    <input
                                        type="range"
                                        min={0}
                                        max={1}
                                        step={0.01}
                                        value={currentTrack ? volume : 0}
                                        disabled={!currentTrack}
                                        className="progress-bar-custom"
                                        style={{ "--progress": `${volume * 100}%`, width: "90px" }}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => {
                                            const newVolume = parseFloat(e.target.value);
                                            setVolume(newVolume);
                                            audioRef.current.volume = newVolume;
                                            if (newVolume > 0) setIsMuted(false);
                                        }}
                                    />
                                </Col>
                            </Row>
                        </Card.Body>
                    </Card>
                )}

                {currentTrack && isFullPlayer && (

                    <div className="fullscreen-overlay">
                        <Container >
                            <Row className="d-flex justify-content-center mb-3">
                                <Button variant="link" style={{ color: "white" }} onClick={() => setIsFullPlayer(false)}><FaSortDown size={100} /></Button>
                            </Row>
                            <Row className="mb-3">
                                {/* Album art bên trái */}
                                <Col md={5} className="text-center">
                                    <img src={encodeImageUrl(currentTrack.albumArtUrl)} alt="Album Art"
                                        style={{ height: "300px", width: "300px", maxWidth: "100%", borderRadius: "20px", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }} />

                                    <Card.Title className="mt-4 mb-3 fw-bold ">{currentTrack.title}</Card.Title>
                                    <Card.Text>{currentTrack.artist} — {currentTrack.album}</Card.Text>
                                    <Card.Text>{currentTrack.quality?.bitDepth} - {currentTrack.quality?.sampleRate} - {currentTrack.quality?.bitrate}</Card.Text>
                                    <div className="d-flex justify-content-center align-items-center gap-4 mb-2">
                                        <Button
                                            variant="link"
                                            onClick={() => setShuffle(!shuffle)}
                                            style={{ color: shuffle ? "#1DB954" : "white" }}
                                        >
                                            <FaRandom size={20} />
                                        </Button>
                                        <Button variant="link" onClick={playPrev} style={{ color: "white" }}>
                                            <FaStepBackward size={24} />
                                        </Button>
                                        <Button
                                            variant="light"
                                            onClick={togglePlayPause}
                                            style={{ borderRadius: "50%", width: "60px", height: "60px" }}
                                        >
                                            {isPlaying ? <FaPause size={28} /> : <FaPlay size={28} />}
                                        </Button>
                                        <Button variant="link" onClick={playNext} style={{ color: "white" }}>
                                            <FaStepForward size={24} />
                                        </Button>
                                        <Button
                                            variant="link"
                                            onClick={() => setRepeat(!repeat)}
                                            style={{ color: repeat ? "#1DB954" : "white" }}
                                        >
                                            <FaRedo size={20} />
                                        </Button>
                                    </div>
                                </Col>

                                {/* Lyric bên phải */}
                                <Col md={7}>
                                    {currentTrack?.lyrics?.[0]?.syncText?.length > 0 ? (
                                        <ListGroup
                                            id="lyrics-container"
                                            variant="flush"
                                            style={{
                                                maxHeight: "70vh",
                                                overflowY: "auto",
                                                scrollbarWidth: "none"
                                            }}>
                                            {currentTrack.lyrics[0].syncText.map((line, idx) => (
                                                <ListGroup.Item
                                                    id={`lyric-${idx}`}
                                                    key={idx}
                                                    style={{
                                                        background: "transparent",
                                                        border: "none",
                                                        textAlign: "center",
                                                        fontSize: idx === currentLyricIndex ? "1.3em" : "1em",
                                                        color: idx === currentLyricIndex ? "#ff4081" : "#ccc",
                                                        fontWeight: idx === currentLyricIndex ? "bold" : "normal",
                                                        transition: "all 0.3s ease"
                                                    }}
                                                >
                                                    {line.text}
                                                </ListGroup.Item>
                                            ))}
                                        </ListGroup>
                                    ) : (
                                        <div
                                            id="lyrics-container"
                                            variant="flush"
                                            className="d-flex flex-column justify-content-center align-items-center"
                                            style={{
                                                height: "70vh",
                                                textAlign: "center",
                                                color: "#999",
                                                fontStyle: "italic"
                                            }}>
                                            Không có lời bài hát
                                        </div>
                                    )}
                                </Col>
                            </Row>
                            <div className="d-flex align-items-center gap-2 w-100 mb-3" >
                                {/* Thời gian hiện tại */}
                                <small style={{ width: "40px", textAlign: "right", color: "white" }}>
                                    {formatTime(currentTime)}
                                </small>
                                {/* Thanh progress */}
                                <input type="range"
                                    min={0}
                                    max={duration || 0}
                                    step={0.1}
                                    value={currentTime}
                                    onChange={(e) => {
                                        audioRef.current.currentTime = e.target.value;
                                        setCurrentTime(e.target.value);
                                    }}
                                    style={{
                                        "--progress": `${(currentTime / (duration || 1)) * 100}%`
                                    }}
                                    className="progress-bar-custom flex-grow-1"
                                />
                                {/* Thời lượng tổng */}
                                <small style={{ width: "40px", color: "white" }}>{formatTime(duration)}</small>
                            </div>
                        </Container>
                    </div>
                )}
            </div>
            {/* Music Player */}
            <audio ref={audioRef} style={{ display: "none" }} />
        </div >

    );
}
