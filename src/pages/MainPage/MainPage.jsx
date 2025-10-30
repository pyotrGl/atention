import React, { useCallback, useEffect, useRef, useState } from "react";
import config from "../../config";
import VideoPanel from "../components/VideoPanel";
import LogsPanel from "../components/LogsPanel";
import CamsPanel from "../components/CamsPanel";
import "./MainPage.css";

function MainPage() {
    // ===== UI state =====
    const [cameraRegistry, setCameraRegistry] = useState({}); // { [numericId]: cam }
    const [selectedCameraId, setSelectedCameraId] = useState(null);
    const [stream, setStream] = useState(null);   // USB stream выбранной
    const [ipUrl, setIpUrl] = useState(null);     // IP URL выбранной
    const [boxes, setBoxes] = useState([]);       // детекции выбранной
    const [logs, setLogs] = useState([]);         // warnings со всех

    // ===== refs =====
    const selectedIdRef = useRef(null);
    useEffect(() => { selectedIdRef.current = selectedCameraId; }, [selectedCameraId]);

    const encodeCanvasRef = useRef(document.createElement("canvas"));
    const sendersRef = useRef(new Map());           // numericId -> { timer, img? }
    const lastBoxesByCameraRef = useRef(new Map()); // numericId -> boxes[]

    // ===== WS refs & timers =====
    const wsRef = useRef(null);
    const wsLockRef = useRef(false);
    const manualCloseRef = useRef(false);
    const heartbeatRef = useRef(null);
    const reconnectTimerRef = useRef(null);
    const backoffRef = useRef(1000); // 1s..5s

    // ===== constants =====
    const TEN_HZ = 100;    // выбранная камера
    const ONE_HZ = 1000;   // невыбранные IP (USB вне выбранной не шлём)

    /* ============ helpers ============ */
    const parseMaybeNestedJSON = (raw) => {
        let v;
        try { v = JSON.parse(raw); } catch { return null; }
        if (typeof v === "string") {
            try { v = JSON.parse(v); } catch {}
        }
        return v;
    };

    /* =========================
       WebSocket
    ========================= */
    const clearHeartbeat = () => {
        if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    };

    const cleanupWebSocket = useCallback(() => {
        clearHeartbeat();
        if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
        // не закрываем насильно CONNECTING — это и даёт “closed before established”
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            try { wsRef.current.close(); } catch {}
        }
        wsRef.current = null;
        wsLockRef.current = false;
    }, []);

    const scheduleReconnect = useCallback(() => {
        if (manualCloseRef.current) return;
        const delay = Math.min(backoffRef.current, 5000);
        reconnectTimerRef.current = setTimeout(() => {
            connectWS();
            backoffRef.current = Math.min(backoffRef.current * 1.5, 5000);
        }, delay);
    }, []); // eslint-disable-line

    const connectWS = useCallback(() => {
        if (wsLockRef.current) return;
        wsLockRef.current = true;

        let url = config.videoWS; // должен быть ws(s)://…/websocket/connect_user
        if (window.location.protocol === "https:" && url.startsWith("ws://")) {
            url = url.replace(/^ws:\/\//, "wss://");
        }

        try {
            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                wsLockRef.current = false;
                backoffRef.current = 1000;
                clearHeartbeat();
                heartbeatRef.current = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: "ping" }));
                    }
                }, 25000);
            };

            ws.onmessage = ({ data }) => {
                const msg = typeof data === "string" ? parseMaybeNestedJSON(data) : data;
                if (!msg || typeof msg !== "object") return;

                // labels/boxes
                if (msg.type === "labels" && Number.isInteger(msg.camera_id)) {
                    const listRaw = Array.isArray(msg.labels) ? msg.labels : Array.isArray(msg.boxes) ? msg.boxes : [];
                    const normalized = listRaw.map(l => ({ name: l.name, x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2 }));
                    lastBoxesByCameraRef.current.set(msg.camera_id, normalized);
                    if (msg.camera_id === selectedIdRef.current) setBoxes(normalized);
                    return;
                }

                // warning -> в лог и удалить через 3с
                if (msg.type === "warning" && Number.isInteger(msg.camera_id)) {
                    const id = `${msg.camera_id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                    const entry = {
                        id, ts: Date.now(), cameraId: msg.camera_id,
                        device: `Camera #${msg.camera_id}`,
                        name: msg.object_name,
                        attention: msg.warning_type, // "warning" | "error"
                    };
                    setLogs(prev => [entry, ...prev]);
                    setTimeout(() => setLogs(prev => prev.filter(x => x.id !== id)), 3000);
                    return;
                }
            };

            ws.onerror = () => { /* тихо */ };

            ws.onclose = (ev) => {
                clearHeartbeat();
                wsRef.current = null;
                wsLockRef.current = false;
                if (!manualCloseRef.current && ([1006,1011,1001,1002,1003].includes(ev.code) || !ev.code)) {
                    scheduleReconnect();
                }
            };
        } catch {
            wsLockRef.current = false;
            scheduleReconnect();
        }
    }, [cleanupWebSocket, scheduleReconnect]);

    useEffect(() => {
        manualCloseRef.current = false;
        connectWS();
        return () => { manualCloseRef.current = true; cleanupWebSocket(); };
    }, [connectWS, cleanupWebSocket]);

    /* =========================
       Отправка кадров (JPEG base64)
    ========================= */
    const sendImageBase64 = useCallback((camera_id, base64) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ camera_id, image: base64 }));
    }, []);

    const encodeElementToBase64 = useCallback((el) => {
        const canvas = encodeCanvasRef.current;
        const ctx = canvas.getContext("2d", { willReadFrequently: false });

        const srcW = el.tagName === "VIDEO" ? el.videoWidth : el.naturalWidth;
        const srcH = el.tagName === "VIDEO" ? el.videoHeight : el.naturalHeight;
        if (!srcW || !srcH) return null;

        canvas.width = srcW; canvas.height = srcH;
        ctx.drawImage(el, 0, 0, srcW, srcH);

        try {
            const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
            return dataUrl.split(",")[1];
        } catch (e) {
            // canvas tainted (CORS)
            return null;
        }
    }, []);

    const startSender = useCallback((cam, rateMs) => {
        const map = sendersRef.current;
        if (map.has(cam.numericId)) {
            const old = map.get(cam.numericId);
            clearInterval(old.timer);
            map.delete(cam.numericId);
        }

        // USB: шлём только с выбранной (иначе конфликт gUM)
        if (cam.type === "usb" && cam.numericId !== selectedIdRef.current) return;

        const sender = { timer: null, img: null };

        const tick = async () => {
            try {
                let base64 = null;

                if (cam.type === "usb") {
                    const mediaEl = document.querySelector(".VideoPanel .video-element:not([style*='display: none'])");
                    if (mediaEl) base64 = encodeElementToBase64(mediaEl);
                } else if (cam.type === "ip" && cam.url) {
                    // Проксируем, чтобы снять CORS (см. config.ipProxy)
                    const proxied = config.ipProxy
                        ? `${config.ipProxy}?url=${encodeURIComponent(cam.url)}&_=${Date.now()}`
                        : cam.url;

                    if (!sender.img) {
                        sender.img = new Image();
                        sender.img.crossOrigin = "anonymous";
                    }
                    sender.img.src = proxied.includes("?") ? proxied : `${proxied}?_=${Date.now()}`;
                    await sender.img.decode().catch(() => {});

                    if (sender.img.naturalWidth && sender.img.naturalHeight) {
                        base64 = encodeElementToBase64(sender.img);
                    }

                    // Если base64 всё равно пусто — это CORS (таинт). Сообщим один раз в консоль.
                    if (!base64 && !sender.warnedCORS) {
                        sender.warnedCORS = true;
                        console.warn(
                            "[IP CAMERA] CORS блокирует чтение пикселей. " +
                            "Включи прокси на бэке и укажи config.ipProxy, либо раздавай поток с 'Access-Control-Allow-Origin:*'."
                        );
                    }
                }

                if (base64) sendImageBase64(cam.numericId, base64);
            } catch {
                /* игнор кадра */
            }
        };

        sender.timer = setInterval(tick, rateMs);
        sendersRef.current.set(cam.numericId, sender);
    }, [encodeElementToBase64, sendImageBase64]);

    const stopAllSenders = useCallback(() => {
        const map = sendersRef.current;
        for (const [, s] of map) if (s.timer) clearInterval(s.timer);
        map.clear();
    }, []);

    // перезапуск отправителей при смене реестра/выбранной
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
       Выбор камеры
    ========================= */
    const handleCameraSelection = useCallback((cam) => {
        const camId = Number(cam.numericId);
        setSelectedCameraId(camId);

        // показать кэш до прихода новых
        const cached = lastBoxesByCameraRef.current.get(camId);
        setBoxes(Array.isArray(cached) ? cached : []);

        if (stream) { try { stream.getTracks().forEach(t => t.stop()); } catch {} }
        setStream(null);
        setIpUrl(null);

        if (cam?.type === "usb" && cam.deviceId) {
            navigator.mediaDevices
                .getUserMedia({ video: { deviceId: { exact: cam.deviceId } } })
                .then(setStream)
                .catch(e => console.error("USB getUserMedia error:", e));
        } else if (cam?.type === "ip" && cam.url) {
            setIpUrl(cam.url); // отображение — напрямую; отправка — через proxy (см. startSender)
        }
    }, [stream]);

    useEffect(() => () => {
        if (stream) { try { stream.getTracks().forEach(t => t.stop()); } catch {} }
    }, [stream]);

    /* =========================
       onRegistryChange (из CamsPanel)
    ========================= */
    const hasInitRef = useRef(false);
    const onRegistryChange = useCallback((list) => {
        const dict = {};
        for (const c of list) if (Number.isInteger(c.numericId)) dict[c.numericId] = c;
        setCameraRegistry(dict);

        if (!hasInitRef.current && list.length > 0) {
            hasInitRef.current = true;
            // выберем первую
            handleCameraSelection(list[0]);
        }
    }, [handleCameraSelection]);

    return (
        <div className="MainPage">
            <div className="top-section">
                <CamsPanel
                    onSelectCamera={handleCameraSelection}
                    onRegistryChange={onRegistryChange}
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
