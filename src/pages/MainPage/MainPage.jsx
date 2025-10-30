import React, { useCallback, useEffect, useRef, useState } from "react";
import config from "../../config";
import VideoPanel from "../components/VideoPanel";
import LogsPanel from "../components/LogsPanel";
import CamsPanel from "../components/CamsPanel";
import "./MainPage.css";

/* ============================================================
   Utilities
   ============================================================ */

/** Safely parse possibly nested JSON */
const parseMaybeNestedJSON = (raw) => {
    try {
        let parsed = JSON.parse(raw);
        if (typeof parsed === "string") parsed = JSON.parse(parsed);
        return parsed;
    } catch {
        return null;
    }
};

/** Generate stable-ish unique id for UI lists */
const genId = (prefix = "log") =>
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/* ============================================================
   Main component
   ============================================================ */

function MainPage() {
    /* ------------------ State ------------------ */
    const [selectedCameraId, setSelectedCameraId] = useState(null);
    const [ipUrl, setIpUrl] = useState(null);
    const [boxes, setBoxes] = useState([]);
    const [logs, setLogs] = useState([]);

    /** Registry of cameras by numericId for quick lookups in logs */
    const [cameraRegistry, setCameraRegistry] = useState({}); // { [numericId]: {name, url, ...} }

    /* ------------------ Refs ------------------ */
    const wsRef = useRef(null);
    const manualCloseRef = useRef(false);
    const reconnectTimerRef = useRef(null);
    const backoffRef = useRef(1000);
    const lastBoxesByCameraRef = useRef(new Map());

    /* ============================================================
       WebSocket management
       ============================================================ */

    /** Send payload to WS if open */
    const sendToWS = useCallback((payload) => {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(payload));
        }
    }, []);

    /** Reconnect with capped backoff */
    const scheduleReconnect = useCallback(() => {
        if (manualCloseRef.current) return;
        const delay = Math.min(backoffRef.current, 5000);
        reconnectTimerRef.current = setTimeout(() => {
            connectWS();
            backoffRef.current = Math.min(backoffRef.current * 1.5, 5000);
        }, delay);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    /** Open WS and wire handlers */
    const connectWS = useCallback(() => {
        let wsUrl = config.videoWS;
        if (window.location.protocol === "https:" && wsUrl.startsWith("ws://")) {
            wsUrl = wsUrl.replace(/^ws:\/\//, "wss://");
        }

        try {
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log("[WS] Connected");
                backoffRef.current = 1000;
            };

            ws.onmessage = ({ data }) => {
                const msg = typeof data === "string" ? parseMaybeNestedJSON(data) : data;
                if (!msg || typeof msg !== "object") return;

                // === labels ===
                if (msg.type === "labels" && Number.isInteger(msg.camera_id)) {
                    const labelList = Array.isArray(msg.labels) ? msg.labels : [];
                    lastBoxesByCameraRef.current.set(msg.camera_id, labelList);
                    if (msg.camera_id === selectedCameraId) setBoxes(labelList);
                    return;
                }

                // === warning ===
                if (msg.type === "warning") {
                    // camera_id may be absent for now; handle both cases
                    const camId = Number.isInteger(msg.camera_id) ? msg.camera_id : null;
                    const deviceName =
                        (camId && cameraRegistry[camId]?.name) ||
                        (camId ? `Camera #${camId}` : "Unknown device");

                    const entry = {
                        id: genId("warn"),
                        ts: Date.now(),
                        cameraId: camId,
                        device: deviceName,
                        name: msg.object_name ?? "Unknown object",
                        attention: msg.warning_type ?? "warning",
                    };

                    setLogs((prev) => [entry, ...prev]);
                    setTimeout(() => {
                        setLogs((prev) => prev.filter((x) => x.id !== entry.id));
                    }, 3000);
                    return;
                }
            };

            ws.onerror = () => console.warn("[WS] Error");
            ws.onclose = () => {
                console.warn("[WS] Closed — scheduling reconnect");
                wsRef.current = null;
                scheduleReconnect();
            };
        } catch (err) {
            console.error("[WS] Connect error:", err);
            scheduleReconnect();
        }
    }, [scheduleReconnect, selectedCameraId, cameraRegistry]);

    /** Mount/unmount lifecycle */
    useEffect(() => {
        manualCloseRef.current = false;
        connectWS();
        return () => {
            manualCloseRef.current = true;
            if (wsRef.current) wsRef.current.close();
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        };
    }, [connectWS]);

    /* ============================================================
       Camera selection
       ============================================================ */

    const handleCameraSelection = useCallback(
        (camera) => {
            if (!camera) return;

            const cameraId = camera.numericId;
            setSelectedCameraId(cameraId);
            setIpUrl(camera.url);

            // show cached boxes until fresh labels arrive
            const cachedBoxes = lastBoxesByCameraRef.current.get(cameraId) || [];
            setBoxes(cachedBoxes);

            // notify backend
            sendToWS({ type: "url", camera_id: cameraId, camera_url: camera.url });
            sendToWS({ type: "status", status: "active" });
        },
        [sendToWS]
    );

    /* ============================================================
       Registry updates from CamsPanel
       ============================================================ */

    const handleRegistryChange = useCallback((list) => {
        // list: array of cams with numericId, name, url...
        const dict = {};
        for (const c of list || []) {
            if (Number.isInteger(c.numericId)) {
                dict[c.numericId] = c;
            }
        }
        setCameraRegistry(dict);
    }, []);

    /* ============================================================
       Render
       ============================================================ */

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
