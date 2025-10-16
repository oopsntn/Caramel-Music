import express from "express";
import fetch from "node-fetch";
import * as mm from 'music-metadata';
import dotenv from "dotenv";
import { XMLParser } from "fast-xml-parser";
import { classifyAudioQuality } from "./src/ultis/ClassifyAudioQuality.js";
import cors from "cors";
import fs from "fs";
import path from "path";

dotenv.config();

const app = express();
app.use(cors());

const PORT = process.env.PORT
const DLNA_URL = process.env.DLNA_URL
const IP = process.env.IP;
const dbPath = path.join(process.cwd(), "database.json");
const publicDir = path.join(process.cwd(), "public"); // Thêm folder public
const albumArtDir = path.join(publicDir, "album-art");

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}
if (!fs.existsSync(albumArtDir)) {
  fs.mkdirSync(albumArtDir, { recursive: true });
}

app.use('/public', express.static(publicDir));
export function readDatabase() {
  if (!fs.existsSync(dbPath)) {
    const defaultData = {
      containers: [],
      items: [],
      metadata: { lastUpdated: null }
    };
    writeDatabase(defaultData);
    return defaultData;
  }
  const raw = fs.readFileSync(dbPath, "utf-8");

  if (!raw || raw.trim() === "") {
    console.log("Database file is empty, initializing...");
    const defaultData = {
      containers: [],
      items: [],
      metadata: { lastUpdated: null }
    };
    writeDatabase(defaultData);
    return defaultData;
  }

  const parsed = JSON.parse(raw);

  // Backward compatibility: nếu có lastUpdated ở root level
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
  fs.writeFileSync(dbPath, JSON.stringify({
    containers: data.containers || [],
    items: data.items || [],
    metadata: {
      lastUpdated: new Date().toISOString(),
      totalContainers: data.containers?.length || 0,
      totalItems: data.items?.length || 0
    }
  }, null, 2));
}
function mergeDatabase(cachedData, newItems, containers) {
    const oldItems = cachedData.items || [];
    // Map id -> object
    const oldMap = new Map(oldItems.map(i => [i.id, i]));
    const newMap = new Map(newItems.map(i => [i.id, i]));

    const mergedItems = [];
    // Cập nhật/bổ sung bài hát mới
    for (const [id, newItem] of newMap.entries()) {
        const oldItem = oldMap.get(id);
        if (!oldItem) {
            // Bài mới
            mergedItems.push(newItem);
        } else {
            // Nếu dữ liệu có thay đổi → cập nhật
            const changed = JSON.stringify(newItem) !== JSON.stringify(oldItem);
            mergedItems.push(changed ? newItem : oldItem);
        }
    }
    // Optional: Xóa bài cũ không còn trong DLNA
    // Nếu muốn giữ lại thì bỏ đoạn này
    for (const [id, oldItem] of oldMap.entries()) {
      if (!newMap.has(id)) mergedItems.push(oldItem);
    }

    return {
        containers,
        items: mergedItems,
        metadata: {
            lastUpdated: new Date().toISOString(),
            totalContainers: containers.length || 0,
            totalItems: mergedItems.length || 0
        }
    };
}
function hasChanges(didl, cachedData) {
  const rawItems = ensureArray(didl["DIDL-Lite"]?.item);
  const idsFromDLNA = rawItems.map(i => i.id);
  const idsFromCache = cachedData.items.map(i => i.id);

  if (idsFromDLNA.length !== idsFromCache.length) return true;

  const diff = idsFromDLNA.filter(id => !idsFromCache.includes(id));
  return diff.length > 0;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  allowBooleanAttributes: true,
  parseTagValue: true,
  parseAttributeValue: true,
  trimValues: true,
});

async function fetchWithTimeout(url, options = {}, timeout = 5000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}
// ✅ Tách riêng các utility functions
const createSoapBody = (objectId) => `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
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

// ✅ Async error handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ✅ XML parser helper
const parseXml = (xmlString) => {
  try {
    return xmlParser.parse(xmlString);
  } catch (err) {
    throw new Error(`XML parse error: ${err.message}`);
  }
};
// ✅ Tạo tên file từ title và date thay vì hash
const createFileName = (title, date, artist = '') => {
  // Kết hợp title, artist, date
  let filename = title;

  if (artist && artist !== 'Unknown') {
    filename = `${artist} - ${title}`;
  }

  if (date) {
    filename = `${filename} (${date})`;
  }

  // Làm sạch tên file: loại bỏ ký tự đặc biệt
  filename = filename
    .replace(/[<>:"/\\|?*]/g, '') // Loại bỏ ký tự không hợp lệ trong tên file
    .replace(/\s+/g, ' ') // Thay nhiều space thành 1 space
    .trim()
    .substring(0, 200); // Giới hạn độ dài tên file

  return filename;
};

// ✅ Lưu album art vào file tĩnh
const saveAlbumArtToFile = async (albumArt, filename) => {
  try {
    const extension = albumArt.format.split('/')[1] || 'jpg';
    const fullFilename = `${filename}.${extension}`;
    const filepath = path.join(albumArtDir, fullFilename);

    // Kiểm tra file đã tồn tại chưa
    if (fs.existsSync(filepath)) {
      console.log(`Album art already exists: ${fullFilename}`);
      return `/public/album-art/${fullFilename}`;
    }

    // Lưu file
    fs.writeFileSync(filepath, albumArt.data);
    console.log(`Saved album art: ${fullFilename}`);

    return `/public/album-art/${fullFilename}`;
  } catch (error) {
    console.error('Error saving album art:', error);
    return null;
  }
};
const checkAlbumArtCache = (title, date, artist) => {
    const filename = createFileName(title, date, artist);
    // Bạn có thể thử với một số đuôi phổ biến
    const extensions = ['jpg', 'jpeg', 'png'];
    for (const ext of extensions) {
        const filepath = path.join(albumArtDir, `${filename}.${ext}`);
        if (fs.existsSync(filepath)) {
            return `${IP}:${PORT}/public/album-art/${filename}.${ext}`;
        }
    }
    return null;
};
// ✅ Get metadata from audio file (chỉ lấy 10KB đầu cho metadata cơ bản)
const getAudioMetadata = async (url) => {
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        'Range': 'bytes=0-900095' // 400KB đầu file
      },
      timeout: 5000
    });

    if (!response.ok && response.status !== 206) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    const metadata = await mm.parseBuffer(buffer, {
      mimeType: response.headers.get('content-type') || 'audio/flac',
      skipCovers: true, // Skip cover cho metadata nhanh
      duration: false,
      skipPostHeaders: true
    });

    // const filename = url.split('/').pop() || '';

    return {
      bitDepth: metadata.format.bitsPerSample || null, // number
      sampleRate: metadata.format.sampleRate || null,
      bitDepthLabel: metadata.format.bitsPerSample ? `${metadata.format.bitsPerSample}-bit` : null,
      sampleRateLabel: metadata.format.sampleRate ? `${(metadata.format.sampleRate / 1000).toFixed(1)}kHz` : null,

      // fileExtension: filename.split('.').pop()?.toUpperCase() || null,
      date: metadata.common.date || null,
      composer: metadata.common.composer || null,
      lyrics: metadata.common.lyrics || null
    };
  } catch (error) {
    console.warn(`Failed to get metadata for ${url}:`, error.message);
    return null;
  }
};
// Helper function để format bitrate
const formatBitrate = (bitrate) => {
  if (!bitrate) return null;
  const bitrateNum = parseInt(bitrate);
  if (isNaN(bitrateNum)) return null;

  if (bitrateNum > 1000) {
    return `${Math.round(bitrateNum / 1000)}kbps`;
  }
  return `${bitrateNum}kbps`;
};
const ensureArray = (val) => {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
};
// ✅ Transform DIDL data with metadata
const transformDIDLData = async (didl, includeMetadata = false) => {
  const containers = ensureArray(didl["DIDL-Lite"]?.container).map((c) => ({
    id: c.id,
    parentID: c.parentID,
    title: c["dc:title"],
    class: c["upnp:class"],
    childCount: c.childCount,
  }));

  const rawItems = ensureArray(didl["DIDL-Lite"]?.item).map((i) => {
    const resArr = ensureArray(i.res);
    const res = resArr[0] || {};

    return {
      id: i.id,
      title: i["dc:title"] || "Unknown",
      artist: i["upnp:artist"] || "Unknown",
      album: i["upnp:album"] || "Unknown",
      duration: res.duration || null,
      url: res["#text"],
      genre: i["upnp:genre"],
      // year: i["dc:date"] || i["upnp:originalTrackNumber"] || null,
      // trackNumber: i["upnp:originalTrackNumber"] || null,
      // protocolInfo: res.protocolInfo,
      bitrate: res.bitrate,
      // size: res.size,
      // sampleFrequency: res.sampleFrequency,
      nrAudioChannels: res.nrAudioChannels,
    };
  });

  // Nếu không cần metadata, trả về ngay
  if (!includeMetadata) {
    return { containers, items: rawItems };
  }

  // Fetch metadata cho tất cả items song song
  const CONCURRENT_LIMIT = 15;
  const items = [];
  for (let i = 0; i < rawItems.length; i += CONCURRENT_LIMIT) {
    const batch = rawItems.slice(i, i + CONCURRENT_LIMIT);
      const batchResults = await Promise.all(
          batch.map(async (item) => {
              const metadata = await getAudioMetadata(item.url);
              const dateForFilename = metadata?.date || null;

              // Ảnh cache
              let albumArtUrl = checkAlbumArtCache(item.title, dateForFilename, item.artist);
              if (!albumArtUrl) {
                  // Nếu không có ảnh cache → fetch album art
                  try {
                      const albumArt = await getAlbumArt(item.url);
                      if (albumArt) {
                          const filename = createFileName(item.title, dateForFilename, item.artist);
                          const savedPath = await saveAlbumArtToFile(albumArt, filename);
                          if (savedPath) {
                              albumArtUrl = `${IP}:${PORT}${savedPath}`;
                          }
                      }
                  } catch (error) {
                      console.warn(`Failed to process album art for ${item.title}:`, error.message);
                  }
              }
              if (!albumArtUrl) {
                  albumArtUrl = `${IP}:${PORT}/public/default.png`;
              }

              const out = {
                  id: item.id,
                  title: item.title,
                  artist: item.artist,
                  album: item.album,
                  duration: item.duration,
                  url: item.url,
                  genre: item.genre,
                  nrAudioChannels: item.nrAudioChannels,
                  albumArtUrl,
              };

              if (metadata) {
                  const qualityInfo = classifyAudioQuality(metadata, item.bitrate);
                  out.quality = {
                      encoding: qualityInfo.encoding,
                      label: qualityInfo.label,
                      tier: qualityInfo.tier,
                      bitDepth: metadata.bitDepthLabel || "16-bit",
                      sampleRate: metadata.sampleRateLabel || "44.1kHz",
                      bitrate: formatBitrate(item.bitrate),
                  };

                  if (metadata.date) out.date = metadata.date;
                  if (metadata.composer) out.composer = metadata.composer;
                  if (metadata.lyrics) out.lyrics = metadata.lyrics;
              }

              return out;
          })
      );

      items.push(...batchResults);
  }

  return { containers, items };
};
// ✅ Get album art from audio file (lấy 8MB đầu cho album art)
const getAlbumArt = async (url) => {
  try {
    const headResp = await fetchWithTimeout(url, { method: "HEAD", timeout: 5000 });
    if (!headResp.ok) {
      throw new Error(`HEAD failed: ${headResp.status}`);
    }
    const contentLength = parseInt(headResp.headers.get("content-length"), 10);
    if (isNaN(contentLength)) {
      throw new Error("Content-Length not available");
    }

    // 2. Xác định range
    const maxBytes = 14505936; // ~9MB
    const endByte = contentLength < maxBytes ? contentLength - 1 : maxBytes;
    const response = await fetchWithTimeout(url, {
      headers: {
        'Range': `bytes=0-${endByte}` // 9MB đầu file
      },
      timeout: 1000
    });

    if (!response.ok && response.status !== 206) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    const metadata = await mm.parseBuffer(buffer, {
      skipCovers: false
    });

    const picture = metadata.common.picture?.[0];
    if (!picture) {
      return null;
    }

    return {
      format: picture.format,
      data: picture.data,
      description: picture.description || 'Album Art'
    };
  } catch (error) {
    console.warn(`Failed to get album art for ${url}:`, error.message);
    return null;
  }
};
// ✅ Get album art from DSD file (lấy 2MB cuối cho album art)
// const getAlbumArtForDSD = async (url) => {
//   try {
//     // 1. HEAD để lấy file size
//     const headResp = await fetchWithTimeout(url, { method: "HEAD" }, 5000);
//     const fileSize = parseInt(headResp.headers.get("content-length"), 10);
//     const chunkSize = 150;
//     const start = Math.max(0, fileSize - chunkSize);
//     const end = fileSize - 1;
//
//     // 2. Fetch chunk cuối
//     const response = await fetchWithTimeout(url, {
//       headers: { Range: `bytes=${start}-${end}` },
//     });
//     if (!response.ok && response.status !== 206) {
//       throw new Error(`Failed to fetch: ${response.status}`);
//     }
//     const buffer = Buffer.from(await response.arrayBuffer());
//
//     // 3. Tìm "ID3"
//     const id3Index = buffer.indexOf(Buffer.from("ID3"));
//     if (id3Index === -1) return null;
//
//     // 4. Đọc frame header "APIC"
//     const apicIndex = buffer.indexOf(Buffer.from("APIC"), id3Index);
//     if (apicIndex === -1) return null;
//
//     let offset = apicIndex + 4;
//
//     // Frame size (4 bytes big-endian)
//     const size = buffer.readUInt32BE(offset);
//     offset += 6; // skip size + flags
//
//     // Text encoding (1 byte)
//     const encoding = buffer[offset];
//     offset += 1;
//
//     // MIME type (null-terminated)
//     const mimeEnd = buffer.indexOf(0x00, offset);
//     const mimeType = buffer.toString("utf8", offset, mimeEnd);
//     offset = mimeEnd + 1;
//
//     // Picture type (1 byte)
//     const picType = buffer[offset];
//     offset += 1;
//
//     // Description (null-terminated)
//     const descEnd = buffer.indexOf(0x00, offset);
//     offset = descEnd + 1;
//
//     // 5. Data binary (the rest of frame)
//     const imageBuffer = buffer.slice(offset, apicIndex + size);
//
//     return {
//       format: mimeType || "image/jpeg",
//       data: imageBuffer,
//       description: "Scanned Album Art",
//     };
//   } catch (err) {
//     console.warn(`Failed to scan album art for ${url}:`, err.message);
//     return null;
//   }
// };
// // ✅ Xử lý 2 trường hợp getAlbumArt
// const getAlbumArtUnified = async (url) => {
//   // Method 1: Standard (metadata ở đầu file)
//   const standardResult = await getAlbumArt(url);
//
//   if (standardResult) {
//     // console.log(`Trying FLAC method for ${url}`);
//     return standardResult;
//   }
//
//   // Method 2: DSD (metadata ở cuối file)
//   // console.log(`Trying DSD method for ${url}`);
//   const dsdResult = await getAlbumArtForDSD(url);
//   return dsdResult;
// };
// ✅ API endpoint để browse DLNA
app.get("/api/browse/:id", asyncHandler(async (req, res) => {
    const { id: objectId } = req.params;
    const includeMetadata = req.query.metadata === "true";

    const cachedData = readDatabase();

    const response = await fetch(`${DLNA_URL}/ctl/ContentDir`, {
        method: "POST",
        headers: {
            "Content-Type": 'text/xml; charset="utf-8"',
            SOAPACTION: '"urn:schemas-upnp-org:service:ContentDirectory:1#Browse"'
        },
        body: createSoapBody(objectId),
    });

    const xmlText = await response.text();
    const didlResult = parseXml(parseXml(xmlText)["s:Envelope"]["s:Body"]["u:BrowseResponse"].Result);

    const rawItems = ensureArray(didlResult["DIDL-Lite"]?.item);
    const cachedItemsMap = new Map(cachedData.items.map(i => [i.id, i]));

    // Lọc ra bài mới hoặc bài thay đổi
    const itemsToScan = rawItems.filter(item => {
        const cachedItem = cachedItemsMap.get(item.id);
        if (!cachedItem) return true; // Bài mới
        const newUrl = ensureArray(item.res)[0]?.["#text"];
        return (
            item["dc:title"] !== cachedItem.title ||
            newUrl !== cachedItem.url
        );
    });

    // Kiểm tra bài cũ bị xóa (có trong cache nhưng không còn trong DLNA)
    const dlnaIds = new Set(rawItems.map(i => i.id));
    const itemsToRemove = cachedData.items.filter(i => !dlnaIds.has(i.id));

    // Nếu không có thay đổi nào để quét và xóa, trả cache luôn
    if (itemsToScan.length === 0 && itemsToRemove.length === 0) {
        return res.json(cachedData);
    }

    // Tạo filtered DIDL cho bài cần quét
    const filteredDIDL = {
        "DIDL-Lite": {
            container: didlResult["DIDL-Lite"].container || [],
            item: itemsToScan
        }
    };

    // Chỉ fetch metadata cho bài mới hoặc thay đổi
    const newData = await transformDIDLData(filteredDIDL, includeMetadata);

    // Merge bài cũ, bài mới, loại bỏ bài bị xóa
    const updatedItemsMap = new Map(
        cachedData.items
            .filter(i => !itemsToRemove.some(r => r.id === i.id)) // Loại bỏ bài bị xóa
            .map(i => [i.id, i])
    );
    for (const item of newData.items) {
        updatedItemsMap.set(item.id, item); // Cập nhật hoặc thêm bài mới
    }
    const mergedItems = Array.from(updatedItemsMap.values());

    const mergedData = {
        containers: didlResult["DIDL-Lite"].container || cachedData.containers,
        items: mergedItems,
        metadata: {
            lastUpdated: new Date().toISOString(),
            totalContainers: (didlResult["DIDL-Lite"].container || cachedData.containers).length,
            totalItems: mergedItems.length
        }
    };

    // Ghi lại database
    writeDatabase(mergedData);

    res.json(mergedData);
}));


// ✅ API endpoint để lấy album art (tìm theo tên file)
app.get("/api/album-art/:fileUrl", asyncHandler(async (req, res) => {
  const fileUrl = decodeURIComponent(req.params.fileUrl);

  // Tìm file trong database trước
  const cachedData = readDatabase();
  const item = cachedData.items.find(i => i.url === fileUrl);

  if (!item || !item.albumArtUrl) {
    return res.status(404).json({
      error: "Album art not found in database",
      fileUrl
    });
  }

  // Lấy tên file từ albumArtUrl
  const filename = item.albumArtUrl.split('/').pop();
  const filepath = path.join(albumArtDir, filename);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({
      error: "Album art file not found",
      filename
    });
  }

  const extension = path.extname(filename).slice(1);
  const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';

  res.set({
    'Content-Type': mimeType,
    'Cache-Control': 'public, max-age=31536000',
  });

  res.sendFile(filepath);
}));

// Error handler
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(500).json({ error: error.message });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
