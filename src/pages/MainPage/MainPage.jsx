import React, { useCallback, useEffect, useRef, useState } from "react";
import config from "../../config";
import VideoPanel from "../components/VideoPanel";
import LogsPanel from "../components/LogsPanel";
import CamsPanel from "../components/CamsPanel";
import "./MainPage.css";

function MainPage() {
    const [selectedCameraId, setSelectedCameraId] = useState(null);
    const [ipUrl, setIpUrl] = useState(null);
    const [boxes, setBoxes] = useState([]);
    const [logs, setLogs] = useState([]);

    const wsRef = useRef(null);
    const manualCloseRef = useRef(false);
    const reconnectTimerRef = useRef(null);
    const backoffRef = useRef(1000);
    const lastBoxesByCameraRef = useRef(new Map());

    const parseMaybeNestedJSON = (raw) => {
        try {
            let v = JSON.parse(raw);
            if (typeof v === "string") v = JSON.parse(v);
            return v;
        } catch {
            return null;
        }
    };

    const scheduleReconnect = useCallback(() => {
        if (manualCloseRef.current) return;
        const delay = Math.min(backoffRef.current, 5000);
        reconnectTimerRef.current = setTimeout(() => {
            connectWS();
            backoffRef.current = Math.min(backoffRef.current * 1.5, 5000);
        }, delay);
    }, []); // eslint-disable-line

    const sendToWS = useCallback((obj) => {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(obj));
        }
    }, []);

    const connectWS = useCallback(() => {
        let url = config.videoWS;
        if (window.location.protocol === "https:" && url.startsWith("ws://")) {
            url = url.replace(/^ws:\/\//, "wss://");
        }

        try {
            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log("[WS] connected");
                backoffRef.current = 1000;
            };

            ws.onmessage = ({ data }) => {
                const msg = typeof data === "string" ? parseMaybeNestedJSON(data) : data;
                if (!msg || typeof msg !== "object") return;

                if (msg.type === "labels" && Number.isInteger(msg.camera_id)) {
                    const list = Array.isArray(msg.labels) ? msg.labels : [];
                    lastBoxesByCameraRef.current.set(msg.camera_id, list);
                    if (msg.camera_id === selectedCameraId) setBoxes(list);
                }

                if (msg.type === "warning" && Number.isInteger(msg.camera_id)) {
                    const id = `${msg.camera_id}-${Date.now()}`;
                    const entry = {
                        id,
                        ts: Date.now(),
                        cameraId: msg.camera_id,
                        device: `Camera #${msg.camera_id}`,
                        name: msg.object_name,
                        attention: msg.warning_type,
                    };
                    setLogs((prev) => [entry, ...prev]);
                    setTimeout(
                        () => setLogs((prev) => prev.filter((x) => x.id !== id)),
                        3000
                    );
                }
            };

            ws.onerror = () => console.warn("[WS] error");
            ws.onclose = () => {
                console.warn("[WS] closed, reconnecting...");
                wsRef.current = null;
                scheduleReconnect();
            };
        } catch {
            scheduleReconnect();
        }
    }, [scheduleReconnect, selectedCameraId]);

    useEffect(() => {
        manualCloseRef.current = false;
        connectWS();
        return () => {
            manualCloseRef.current = true;
            if (wsRef.current) wsRef.current.close();
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        };
    }, [connectWS]);

    const handleCameraSelection = useCallback(
        (cam) => {
            if (!cam) return;
            const camId = cam.numericId;
            setSelectedCameraId(camId);
            setIpUrl(cam.url);
            setBoxes(lastBoxesByCameraRef.current.get(camId) || []);

            // сообщаем на бек
            sendToWS({
                type: "url",
                camera_id: camId,
                camera_url: cam.url,
            });

            sendToWS({
                type: "status",
                status: "active",
            });
        },
        [sendToWS]
    );

    const handleRegistryChange = useCallback(() => {
        // сейчас не используется, но оставим для совместимости
    }, []);

    return (
        <div className="MainPage">
            <div className="top-section">
                <CamsPanel
                    onSelectCamera={handleCameraSelection}
                    onRegistryChange={handleRegistryChange}
                />
                <div className="VideoWrap">
                    <VideoPanel ipUrl={ipUrl} boxes={boxes} />
                </div>
            </div>
            <div className="bottom-section">
                <LogsPanel objects={logs} />
            </div>
        </div>
    );
}

export default MainPage;
