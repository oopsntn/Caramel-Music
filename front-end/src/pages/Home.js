import { useEffect, useState, useRef } from "react";
import { Container, Row, Col, Card, Spinner, Button, ListGroup, FormControl, Table, ButtonGroup } from "react-bootstrap";
import axios from "axios";
import DynamicBackground from "../components/DynamicBackgroud";

export default function Home() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentTrack, setCurrentTrack] = useState(null);
    const [filterSearch, setfilterSearch] = useState('');
    const audioRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [repeat, setRepeat] = useState(false);
    const [shuffle, setShuffle] = useState(false);
    const [currentLyricIndex, setCurrentLyricIndex] = useState(0);

    useEffect(() => {
        axios.get("http://localhost:9999/items")
            .then((res) => {
                setItems(res.data); // Load list nhạc ngay
                setLoading(false);
            });
    }, []);
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
            } else {
                playNext();
            }
        };

        audio.addEventListener("play", handlePlay);
        audio.addEventListener("pause", handlePause);
        audio.addEventListener("ended", handleEnded);

        return () => {
            audio.removeEventListener("play", handlePlay);
            audio.removeEventListener("pause", handlePause);
            audio.removeEventListener("ended", handleEnded);
        };
    }, [repeat, shuffle, items, currentTrack]);

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
        setfilterSearch(e.target.value)
    }

    const playTrack = (track) => {
        setCurrentTrack(track);
        if (audioRef.current) {
            audioRef.current.src = track.url;
            audioRef.current.load();
            audioRef.current.onloadedmetadata = () => {
                audioRef.current.play();
            };
        }
    };

    const getCurrentIndex = () => items.findIndex(i => i.id === currentTrack?.id);

    //Bài tiếp theo
    const playNext = () => {
        if (!items.length) return;
        let nextIndex;
        if (shuffle) {
            nextIndex = Math.floor(Math.random() * items.length);
        } else {
            const currentIndex = getCurrentIndex();
            nextIndex = (currentIndex + 1) % items.length;
        }
        playTrack(items[nextIndex]);
    };

    // Quay lại bài trước
    const playPrev = () => {
        if (!items.length) return;
        const currentIndex = getCurrentIndex();
        const prevIndex = (currentIndex - 1 + items.length) % items.length;
        playTrack(items[prevIndex]);
    };

    return (
        <div style={{ position: "relative", minHeight: "100vh" }}>
            <DynamicBackground track={currentTrack} />

            <Container className="mt-3">
                <Row className="mb-3">
                    <Col md={3}>
                        <FormControl onChange={handleSearchChange} value={filterSearch} type="text" placeholder="Enter search title" />
                    </Col>
                </Row>
                <Row>
                    <Table hover border={1} className="table-glass text-white">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Title</th>
                                <th>Artist</th>
                                <th>Album</th>
                                <th>Duration</th>
                                <th>Genre</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filterMusic.map((i) => (
                                <tr md={4} key={i.id} onClick={() => playTrack(i)} style={{ cursor: 'pointer' }} >
                                    <td>
                                        <Card.Img src={i.albumArtUrl} loading="lazy" width="60" height="60" style={{ borderRadius: "15px" }}/>
                                    </td>
                                    <td>{i.title}</td>
                                    <td>{i.artist}<br /></td>
                                    <td>{i.album}<br /></td>
                                    <td>{i.duration}<br /></td>
                                    <td>{i.genre}<br /></td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </Row>

                {/* Music Player */}
                {currentTrack && (
                    <Card className="mt-4 sticky-bottom shadow-lg">
                        <Card.Body>
                            <Row>
                                <Col md={2}>
                                    <img src={currentTrack.albumArtUrl} alt="Album Art" style={{ width: "100%", borderRadius: "15px" }} />
                                </Col>
                                <Col md={10}>
                                    <h5>{currentTrack.title}</h5>
                                    <p>{currentTrack.artist} — {currentTrack.album}</p>
                                    <audio ref={audioRef} controls style={{ width: "100%" }} />
                                    <ButtonGroup className="mt-2">
                                        <Button variant="secondary" onClick={playPrev}>⏮</Button>
                                        <Button variant={isPlaying ? "danger" : "success"}
                                            onClick={() => {
                                                if (isPlaying) {
                                                    audioRef.current.pause();
                                                } else {
                                                    audioRef.current.play();
                                                }
                                            }}>
                                            {isPlaying ? "⏸" : "▶"}
                                        </Button>
                                        <Button variant="secondary" onClick={playNext}>⏭</Button>
                                        <Button variant={repeat ? "warning" : "outline-warning"} onClick={() => setRepeat(!repeat)}>
                                            🔁
                                        </Button>
                                        <Button variant={shuffle ? "info" : "outline-info"} onClick={() => setShuffle(!shuffle)}>
                                            🔀
                                        </Button>
                                    </ButtonGroup><br />
                                    <strong>Composer:</strong> {currentTrack.composer?.join(", ")}<br />
                                    <strong>Channels:</strong> {currentTrack.nrAudioChannels}<br />
                                    <strong>Quality:</strong><br />
                                    - <strong>Label: </strong>{currentTrack.quality?.label}<br />
                                    - <strong>bitDepth: </strong>{currentTrack.quality?.bitDepth}<br />
                                    - <strong>bitrate: </strong>{currentTrack.quality?.bitrate}<br />
                                    - <strong>Encoding:</strong> {currentTrack.quality?.encoding} <br />
                                    - <strong>Tier: </strong> {currentTrack.quality?.tier}
                                    {currentTrack?.lyrics?.[0]?.syncText?.length > 0 && (
                                        <ListGroup id="lyrics-container" variant="flush" className="mt-3" style={{ maxHeight: "200px", overflowY: "auto" }}>
                                            {currentTrack.lyrics[0].syncText.map((line, idx) => (
                                                <ListGroup.Item
                                                    id={`lyric-${idx}`}
                                                    key={idx}
                                                    style={{ color: idx === currentLyricIndex ? "red" : "black" }}
                                                >
                                                    {line.text}
                                                </ListGroup.Item>
                                            ))}
                                        </ListGroup>
                                    )}
                                </Col>
                            </Row>
                        </Card.Body>
                    </Card>
                )}
            </Container>
        </div>
    );
}
