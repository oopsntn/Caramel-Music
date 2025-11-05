// ==============================
// 📦 Imports & Setup
// ==============================
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import * as mm from "music-metadata";
import { XMLParser } from "fast-xml-parser";
import { classifyAudioQuality } from "./src/ultis/ClassifyAudioQuality.js";

dotenv.config();

// ==============================
// ⚙️ Config & Constants
// ==============================
const app = express();
app.use(cors());

const PORT = process.env.PORT;
const IP = process.env.IP;
const DLNA_URL = process.env.DLNA_URL;

const dbPath = path.join(process.cwd(), "database.json");
const publicDir = path.join(process.cwd(), "public");
const albumArtDir = path.join(publicDir, "album-art");

// ==============================
// 📁 Ensure Directory Exists
// ==============================
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
if (!fs.existsSync(albumArtDir)) fs.mkdirSync(albumArtDir, { recursive: true });
app.use("/public", express.static(publicDir));

// ==============================
// 💾 Database Helpers
// ==============================
export function readDatabase() {
    if (!fs.existsSync(dbPath)) {
        const defaultData = { containers: [], items: [], metadata: { lastUpdated: null } };
        writeDatabase(defaultData);
        return defaultData;
    }

    const raw = fs.readFileSync(dbPath, "utf-8");
    if (!raw.trim()) {
        console.log("Database file is empty, initializing...");
        const defaultData = { containers: [], items: [], metadata: { lastUpdated: null } };
        writeDatabase(defaultData);
        return defaultData;
    }

    const parsed = JSON.parse(raw);
    if (parsed.lastUpdated && !parsed.metadata) {
        return {
            containers: parsed.containers || [],
            items: parsed.items || [],
            metadata: { lastUpdated: parsed.lastUpdated }
        };
    }

    return parsed;
}

export function writeDatabase(data) {
    fs.writeFileSync(
        dbPath,
        JSON.stringify(
            {
                containers: data.containers || [],
                items: data.items || [],
                metadata: {
                    lastUpdated: new Date().toISOString(),
                    totalContainers: data.containers?.length || 0,
                    totalItems: data.items?.length || 0
                }
            },
            null,
            2
        )
    );
}

// ==============================
// 🧩 Utility Functions
// ==============================
const ensureArray = (val) => (Array.isArray(val) ? val : val ? [val] : []);

const formatBitrate = (bitrate) => {
    if (!bitrate) return null;
    const n = parseInt(bitrate);
    return isNaN(n) ? null : n > 1000 ? `${Math.round(n / 1000)}kbps` : `${n}kbps`;
};

const createFileName = (title, date, artist = "") => {
    let name = artist && artist !== "Unknown" ? `${artist} - ${title}` : title;
    if (date) name += ` (${date})`;
    return name.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim().substring(0, 200);
};

const fetchWithTimeout = async (url, options = {}, timeout = 5000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(id);
    }
};

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const parseXml = (xmlString) => {
    try {
        return xmlParser.parse(xmlString);
    } catch (err) {
        throw new Error(`XML parse error: ${err.message}`);
    }
};

// ==============================
// 🧠 XML Parser Setup
// ==============================
const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    allowBooleanAttributes: true,
    parseTagValue: true,
    parseAttributeValue: true,
    trimValues: true
});

const createSoapBody = (objectId) => `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" 
  s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
      <ObjectID>${objectId}</ObjectID>
      <BrowseFlag>BrowseDirectChildren</BrowseFlag>
      <Filter>*</Filter>
      <StartingIndex>0</StartingIndex>
      <RequestedCount>0</RequestedCount>
      <SortCriteria></SortCriteria>
    </u:Browse>
  </s:Body>
</s:Envelope>`;

// ==============================
// 🖼️ Album Art Utilities
// ==============================
const checkAlbumArtCache = (title, date, artist) => {
    const name = createFileName(title, date, artist);
    for (const ext of ["jpg", "jpeg", "png"]) {
        const file = path.join(albumArtDir, `${name}.${ext}`);
        if (fs.existsSync(file)) return `${IP}:${PORT}/public/album-art/${name}.${ext}`;
    }
    return null;
};

const saveAlbumArtToFile = async (albumArt, filename) => {
    try {
        const ext = albumArt.format.split("/")[1] || "jpg";
        const fullName = `${filename}.${ext}`;
        const file = path.join(albumArtDir, fullName);

        if (fs.existsSync(file)) return `/public/album-art/${fullName}`;
        fs.writeFileSync(file, albumArt.data);
        return `/public/album-art/${fullName}`;
    } catch (err) {
        console.error("Error saving album art:", err);
        return null;
    }
};

// ==============================
// 🎵 Audio Metadata & DLNA Tools
// ==============================
const getAudioMetadata = async (url) => {
    try {
        const resp = await fetchWithTimeout(url, { headers: { Range: "bytes=0-9000" } }, 5000);
        if (!resp.ok && resp.status !== 206) throw new Error(`Failed to fetch: ${resp.status}`);
        const buffer = Buffer.from(await resp.arrayBuffer());
        const meta = await mm.parseBuffer(buffer, {
            mimeType: resp.headers.get("content-type") || "audio/flac",
            skipCovers: true,
            duration: false,
            skipPostHeaders: true
        });

        return {
            bitDepth: meta.format.bitsPerSample || null,
            sampleRate: meta.format.sampleRate || null,
            bitDepthLabel: meta.format.bitsPerSample ? `${meta.format.bitsPerSample}-bit` : null,
            sampleRateLabel: meta.format.sampleRate ? `${(meta.format.sampleRate / 1000).toFixed(1)}kHz` : null,
            date: meta.common.date || null,
            composer: meta.common.composer || null,
            lyrics: meta.common.lyrics || null
        };
    } catch (err) {
        console.warn(`Failed to get metadata for ${url}:`, err.message);
        return null;
    }
};

const getAlbumArt = async (url) => {
    try {
        const head = await fetchWithTimeout(url, { method: "HEAD" }, 5000);
        if (!head.ok) throw new Error(`HEAD failed: ${head.status}`);

        const size = parseInt(head.headers.get("content-length"), 10);
        const end = isNaN(size) ? 14505936 : Math.min(size - 1, 14505936);

        const resp = await fetchWithTimeout(url, { headers: { Range: `bytes=0-${end}` } }, 1000);
        if (!resp.ok && resp.status !== 206) throw new Error(`Failed to fetch: ${resp.status}`);

        const buffer = Buffer.from(await resp.arrayBuffer());
        const meta = await mm.parseBuffer(buffer, { skipCovers: false });
        const picture = meta.common.picture?.[0];
        return picture ? { format: picture.format, data: picture.data, description: picture.description || "Album Art" } : null;
    } catch (err) {
        console.warn(`Failed to get album art for ${url}:`, err.message);
        return null;
    }
};

// ==============================
// 🔁 Transform DIDL Data
// ==============================
const transformDIDLData = async (didl, includeMetadata = false) => {
    const containers = ensureArray(didl["DIDL-Lite"]?.container).map((c) => ({
        id: c.id,
        parentID: c.parentID,
        title: c["dc:title"],
        class: c["upnp:class"],
        childCount: c.childCount
    }));

    const rawItems = ensureArray(didl["DIDL-Lite"]?.item).map((i) => {
        const res = ensureArray(i.res)[0] || {};
        return {
            id: i.id,
            title: i["dc:title"] || "Unknown",
            artist: i["upnp:artist"] || "Unknown",
            album: i["upnp:album"] || "Unknown",
            duration: res.duration || null,
            url: res["#text"],
            genre: i["upnp:genre"],
            bitrate: res.bitrate,
            nrAudioChannels: res.nrAudioChannels
        };
    });

    if (!includeMetadata) return { containers, items: rawItems };

    const items = [];
    const LIMIT = 15;

    for (let i = 0; i < rawItems.length; i += LIMIT) {
        const batch = rawItems.slice(i, i + LIMIT);

        const batchResults = await Promise.all(
            batch.map(async (item) => {
                const meta = await getAudioMetadata(item.url);
                const dateForFile = meta?.date || null;

                let artUrl = checkAlbumArtCache(item.title, dateForFile, item.artist);
                if (!artUrl) {
                    try {
                        const art = await getAlbumArt(item.url);
                        if (art) {
                            const file = createFileName(item.title, dateForFile, item.artist);
                            const saved = await saveAlbumArtToFile(art, file);
                            if (saved) artUrl = `${IP}:${PORT}${saved}`;
                        }
                    } catch (e) {
                        console.warn(`Album art failed for ${item.title}:`, e.message);
                    }
                }

                if (!artUrl) artUrl = `${IP}:${PORT}/public/default.png`;

                const out = { ...item, albumArtUrl: artUrl };

                if (meta) {
                    const q = classifyAudioQuality(meta, item.bitrate);
                    out.quality = {
                        encoding: q.encoding,
                        label: q.label,
                        tier: q.tier,
                        bitDepth: meta.bitDepthLabel || "16-bit",
                        sampleRate: meta.sampleRateLabel || "44.1kHz",
                        bitrate: formatBitrate(item.bitrate)
                    };
                    if (meta.date) out.date = meta.date;
                    if (meta.composer) out.composer = meta.composer;
                    if (meta.lyrics) out.lyrics = meta.lyrics;
                }

                return out;
            })
        );

        items.push(...batchResults);
    }

    return { containers, items };
};

// ==============================
// 🌐 API Endpoints
// ==============================
app.get(
    "/api/browse/:id",
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const includeMetadata = req.query.metadata === "true";
        const cached = readDatabase();

        const response = await fetch(`${DLNA_URL}/ctl/ContentDir`, {
            method: "POST",
            headers: {
                "Content-Type": 'text/xml; charset="utf-8"',
                SOAPACTION: '"urn:schemas-upnp-org:service:ContentDirectory:1#Browse"'
            },
            body: createSoapBody(id)
        });

        const xmlText = await response.text();
        const didl = parseXml(parseXml(xmlText)["s:Envelope"]["s:Body"]["u:BrowseResponse"].Result);
        const rawItems = ensureArray(didl["DIDL-Lite"]?.item);

        const cachedMap = new Map(cached.items.map((i) => [i.id, i]));
        const itemsToScan = rawItems.filter((i) => {
            const c = cachedMap.get(i.id);
            if (!c) return true;
            const newUrl = ensureArray(i.res)[0]?.["#text"];
            return i["dc:title"] !== c.title || newUrl !== c.url;
        });

        const dlnaIds = new Set(rawItems.map((i) => i.id));
        const toRemove = cached.items.filter((i) => !dlnaIds.has(i.id));

        if (!itemsToScan.length && !toRemove.length) return res.json(cached);

        const filtered = {
            "DIDL-Lite": {
                container: didl["DIDL-Lite"].container || [],
                item: itemsToScan
            }
        };

        const newData = await transformDIDLData(filtered, includeMetadata);

        const mergedMap = new Map(
            cached.items.filter((i) => !toRemove.some((r) => r.id === i.id)).map((i) => [i.id, i])
        );

        for (const item of newData.items) mergedMap.set(item.id, item);

        const merged = {
            containers: didl["DIDL-Lite"].container || cached.containers,
            items: [...mergedMap.values()],
            metadata: {
                lastUpdated: new Date().toISOString(),
                totalContainers: (didl["DIDL-Lite"].container || cached.containers).length,
                totalItems: mergedMap.size
            }
        };

        writeDatabase(merged);
        res.json(merged);
    })
);

app.get(
    "/api/album-art/:fileUrl",
    asyncHandler(async (req, res) => {
        const fileUrl = decodeURIComponent(req.params.fileUrl);
        const db = readDatabase();
        const item = db.items.find((i) => i.url === fileUrl);

        if (!item || !item.albumArtUrl)
            return res.status(404).json({ error: "Album art not found", fileUrl });

        const file = path.join(albumArtDir, path.basename(item.albumArtUrl));
        if (!fs.existsSync(file)) return res.status(404).json({ error: "Album art file not found" });

        const ext = path.extname(file).slice(1);
        const mime = ext === "png" ? "image/png" : "image/jpeg";

        res.set({ "Content-Type": mime, "Cache-Control": "public, max-age=31536000" });
        res.sendFile(file);
    })
);

// ==============================
// ⚠️ Error Handler
// ==============================
app.use((err, req, res, next) => {
    console.error("Error:", err);
    res.status(500).json({ error: err.message });
});

// ==============================
// 🚀 Start Server
// ==============================
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
