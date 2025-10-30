import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import config from "../../config";
import VideoPanel from "../components/VideoPanel";
import LogsPanel from "../components/LogsPanel";
import CamsPanel from "../components/CamsPanel";
import "./MainPage.css";

function MainPage() {
    const wsRef = useRef(null);
    const reconnectTimerRef = useRef(null);

    // Реестр всех камер (по numericId), приходит из CamsPanel
    // { [numericId]: { id, name, type: 'usb'|'ip', deviceId?, url?, numericId } }
    const [cameraRegistry, setCameraRegistry] = useState({});
    const [selectedCameraId, setSelectedCameraId] = useState(null);

    // Состояние отображения выбранной камеры в правой панели
    const [stream, setStream] = useState(null);   // USB
    const [ipUrl, setIpUrl]   = useState(null);   // IP

    // Детекции для выбранной камеры
    const [boxes, setBoxes] = useState([]);

    // Логи предупреждений
    const [logs, setLogs] = useState([]);

    // Offscreen холст для кодирования base64
    const encodeCanvasRef = useRef(document.createElement("canvas"));

    // Пер-кам (numericId) → sender (таймер и оффскрин элементы)
    const sendersRef = useRef(new Map());

    const TEN_HZ = 100;   // 10 раз/сек
    const ONE_HZ = 1000;  // 1 раз/сек

    /* =========================
       WebSocket
    ========================= */
    const cleanupWebSocket = useCallback(() => {
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }
        if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
            try { wsRef.current.close(); } catch {}
        }
        wsRef.current = null;
    }, []);

    const connectWS = useCallback(() => {
        cleanupWebSocket();
        const ws = new WebSocket(config.videoWS); // wss:///websocket/connect_user
        wsRef.current = ws;

        ws.onopen = () => {
            console.log("WS open");
        };

        ws.onmessage = ({ data }) => {
            try {
                const msg = JSON.parse(data);

                // labels — рисуем только если это выбранная камера
                if (msg?.type === "labels" && Number.isInteger(msg.camera_id)) {
                    if (msg.camera_id === selectedCameraId) {
                        const mapped = Array.isArray(msg.labels)
                            ? msg.labels.map(l => ({ name: l.name, x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2 }))
                            : [];
                        setBoxes(mapped);
                    }
                    return;
                }

                // warning — добавляем в логи и удаляем через 3 сек
                if (msg?.type === "warning" && Number.isInteger(msg.camera_id)) {
                    const id = `${msg.camera_id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                    const entry = {
                        id,
                        ts: Date.now(),
                        cameraId: msg.camera_id,
                        device: `Camera #${msg.camera_id}`,
                        name: msg.object_name,
                        attention: msg.warning_type, // "error" | "warning"
                    };
                    setLogs(prev => [entry, ...prev]);
                    setTimeout(() => {
                        setLogs(prev => prev.filter(x => x.id !== id));
                    }, 3000);
                    return;
                }
            } catch {
                // non-JSON — игнор
            }
        };

        ws.onerror = (e) => console.error("WS error:", e);

        ws.onclose = () => {
            console.log("WS closed, reconnect…");
            reconnectTimerRef.current = setTimeout(connectWS, 1500);
        };
    }, [cleanupWebSocket, selectedCameraId]);

    useEffect(() => {
        connectWS();
        return () => cleanupWebSocket();
    }, [connectWS, cleanupWebSocket]);

    /* =========================
       Helpers: отправка кадров
    ========================= */
    const sendImageBase64 = useCallback((camera_id, base64) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ camera_id: camera_id, image: base64 }));
    }, []);

    // Кодирование DOM media -> base64 JPEG (качество 0.7)
    const encodeElementToBase64 = useCallback((el) => {
        const canvas = encodeCanvasRef.current;
        const ctx = canvas.getContext("2d", { willReadFrequently: false });

        const srcW = el.tagName === "VIDEO" ? el.videoWidth : el.naturalWidth;
        const srcH = el.tagName === "VIDEO" ? el.videoHeight : el.naturalHeight;
        if (!srcW || !srcH) return null;

        canvas.width = srcW;
        canvas.height = srcH;
        ctx.drawImage(el, 0, 0, srcW, srcH);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        return dataUrl.split(",")[1]; // чистый base64
    }, []);

    // Создаёт или перезапускает sender для камеры
    const startSender = useCallback((cam, rateMs) => {
        // Для выбранной USB будем брать кадр из видимого <video>
        // Для IP — создаём offscreen <img> и периодически тянем кадр
        const map = sendersRef.current;
        // Остановим, если уже был
        if (map.has(cam.numericId)) {
            const old = map.get(cam.numericId);
            clearInterval(old.timer);
            map.delete(cam.numericId);
        }

        // Если USB и НЕ выбрана — пропустим (обычно USB одна; держим активной только выбранную)
        if (cam.type === "usb" && cam.numericId !== selectedCameraId) return;

        const sender = { timer: null, img: null };

        const tick = async () => {
            try {
                let base64 = null;

                if (cam.type === "usb") {
                    const mediaEl = document.querySelector(".VideoPanel .video-element:not([style*='display: none'])");
                    if (mediaEl) {
                        base64 = encodeElementToBase64(mediaEl);
                    }
                } else if (cam.type === "ip" && cam.url) {
                    // оффскрин картинка
                    if (!sender.img) {
                        sender.img = new Image();
                        sender.img.crossOrigin = "anonymous"; // нужен CORS на камере/прокси
                    }
                    // cache-bust, если нужно
                    sender.img.src = cam.url.includes("?") ? `${cam.url}&_=${Date.now()}` : `${cam.url}?_=${Date.now()}`;

                    // ждём загрузку кадра
                    await sender.img.decode().catch(() => {});
                    if (sender.img.naturalWidth && sender.img.naturalHeight) {
                        base64 = encodeElementToBase64(sender.img);
                    }
                }

                if (base64) sendImageBase64(cam.numericId, base64);
            } catch (e) {
                // если таинт/CORS — просто пропускаем кадр
                // console.warn("send frame error", e);
            }
        };

        sender.timer = setInterval(tick, rateMs);
        sendersRef.current.set(cam.numericId, sender);
    }, [encodeElementToBase64, selectedCameraId, sendImageBase64]);

    const stopAllSenders = useCallback(() => {
        const map = sendersRef.current;
        for (const [, s] of map) {
            if (s.timer) clearInterval(s.timer);
        }
        map.clear();
    }, []);

    // Перезапускаем отправители при изменении реестра/выбранной
    useEffect(() => {
        stopAllSenders();
        const cams = Object.values(cameraRegistry);

        for (const cam of cams) {
            const rate = cam.numericId === selectedCameraId ? TEN_HZ : ONE_HZ;
            startSender(cam, rate);
        }
        return () => stopAllSenders();
    }, [cameraRegistry, selectedCameraId, startSender, stopAllSenders]);

    /* =========================
       Выбор камеры (для правой панели)
    ========================= */
    const handleCameraSelection = useCallback((cam) => {
        setBoxes([]);
        setSelectedCameraId(Number(cam.numericId));

        // остановим прошлый USB stream
        if (stream) {
            try { stream.getTracks().forEach(t => t.stop()); } catch {}
        }
        setStream(null);
        setIpUrl(null);

        if (cam?.type === "usb" && cam.deviceId) {
            navigator.mediaDevices
                .getUserMedia({ video: { deviceId: { exact: cam.deviceId } } })
                .then(setStream)
                .catch(e => console.error("USB getUserMedia error:", e));
        } else if (cam?.type === "ip" && cam.url) {
            setIpUrl(cam.url);
        }
    }, [stream]);

    // Чистка stream на размонтировании
    useEffect(() => () => {
        if (stream) {
            try { stream.getTracks().forEach(t => t.stop()); } catch {}
        }
    }, [stream]);

    /* =========================
       Рендер
    ========================= */
    return (
        <div className="MainPage">
            <div className="top-section">
                <CamsPanel
                    onSelectCamera={handleCameraSelection}
                    onRegistryChange={(list) => {
                        // list: массив камер, собираем в словарь по numericId
                        const dict = {};
                        for (const c of list) {
                            if (Number.isInteger(c.numericId)) dict[c.numericId] = c;
                        }
                        setCameraRegistry(dict);
                        // если нет выбранной — выберем первую
                        if (!selectedCameraId && list[0]) {
                            handleCameraSelection(list[0]);
                        }
                    }}
                />
                <div className="VideoWrap">
                    <VideoPanel stream={stream} ipUrl={ipUrl} boxes={boxes} />
                </div>
            </div>
            <div className="bottom-section">
                <LogsPanel objects={logs} />
            </div>
        </div>
    );
}

export default MainPage;
