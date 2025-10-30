import React, { useCallback, useEffect, useRef, useState } from "react";
import config from "../../config";
import VideoPanel from "../components/VideoPanel";
import LogsPanel from "../components/LogsPanel";
import CamsPanel from "../components/CamsPanel";
import "./MainPage.css";

/* ============================================================
   Utility functions
   ============================================================ */

/**
 * Parses possibly nested JSON safely (handles double-encoded strings)
 */
const parseMaybeNestedJSON = (raw) => {
    try {
        let parsed = JSON.parse(raw);
        if (typeof parsed === "string") parsed = JSON.parse(parsed);
        return parsed;
    } catch {
        return null;
    }
};

/* ============================================================
   Main component
   ============================================================ */

function MainPage() {
    /* ------------------ State ------------------ */
    const [selectedCameraId, setSelectedCameraId] = useState(null);
    const [ipUrl, setIpUrl] = useState(null);
    const [boxes, setBoxes] = useState([]);
    const [logs, setLogs] = useState([]);

    /* ------------------ Refs ------------------ */
    const wsRef = useRef(null);
    const manualCloseRef = useRef(false);
    const reconnectTimerRef = useRef(null);
    const backoffRef = useRef(1000);
    const lastBoxesByCameraRef = useRef(new Map());

    /* ============================================================
       WebSocket management
       ============================================================ */

    /** Sends an object to the backend WebSocket (if open) */
    const sendToWS = useCallback((payload) => {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(payload));
        }
    }, []);

    /** Reconnects with exponential backoff */
    const scheduleReconnect = useCallback(() => {
        if (manualCloseRef.current) return;

        const delay = Math.min(backoffRef.current, 5000);
        reconnectTimerRef.current = setTimeout(() => {
            connectWS();
            backoffRef.current = Math.min(backoffRef.current * 1.5, 5000);
        }, delay);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    /** Establishes WebSocket connection and handles lifecycle */
    const connectWS = useCallback(() => {
        let wsUrl = config.videoWS;

        // Auto-upgrade to wss:// if site is https://
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

                // === Labels ===
                if (msg.type === "labels" && Number.isInteger(msg.camera_id)) {
                    const labelList = Array.isArray(msg.labels) ? msg.labels : [];
                    lastBoxesByCameraRef.current.set(msg.camera_id, labelList);

                    if (msg.camera_id === selectedCameraId) {
                        setBoxes(labelList);
                    }
                    return;
                }

                // === Warnings ===
                if (msg.type === "warning" && Number.isInteger(msg.camera_id)) {
                    const id = `${msg.camera_id}-${Date.now()}`;
                    const logEntry = {
                        id,
                        ts: Date.now(),
                        cameraId: msg.camera_id,
                        device: `Camera #${msg.camera_id}`,
                        name: msg.object_name,
                        attention: msg.warning_type, // "warning" | "error"
                    };

                    setLogs((prev) => [logEntry, ...prev]);
                    setTimeout(() => {
                        setLogs((prev) => prev.filter((x) => x.id !== id));
                    }, 3000);
                    return;
                }
            };

            ws.onerror = () => console.warn("[WS] Error occurred");
            ws.onclose = () => {
                console.warn("[WS] Disconnected — scheduling reconnect...");
                wsRef.current = null;
                scheduleReconnect();
            };
        } catch (err) {
            console.error("[WS] Connection error:", err);
            scheduleReconnect();
        }
    }, [scheduleReconnect, selectedCameraId]);

    /** Initialize WS on mount and cleanup on unmount */
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
       Camera selection handling
       ============================================================ */

    const handleCameraSelection = useCallback(
        (camera) => {
            if (!camera) return;

            const cameraId = camera.numericId;
            setSelectedCameraId(cameraId);
            setIpUrl(camera.url);

            // Display cached boxes until new labels arrive
            const cachedBoxes = lastBoxesByCameraRef.current.get(cameraId) || [];
            setBoxes(cachedBoxes);

            // Notify backend about selected camera
            sendToWS({
                type: "url",
                camera_id: cameraId,
                camera_url: camera.url,
            });

            sendToWS({
                type: "status",
                status: "active",
            });
        },
        [sendToWS]
    );

    /* ============================================================
       Registry updates (currently not used)
       ============================================================ */

    const handleRegistryChange = useCallback(() => {
        // Reserved for future functionality (e.g., syncing list)
    }, []);

    /* ============================================================
       Render
       ============================================================ */

    return (
        <div className="MainPage">
            {/* ======= Top section ======= */}
            <div className="top-section">
                <CamsPanel
                    onSelectCamera={handleCameraSelection}
                    onRegistryChange={handleRegistryChange}
                />

                <div className="VideoWrap">
                    <VideoPanel ipUrl={ipUrl} boxes={boxes} />
                </div>
            </div>

            {/* ======= Bottom section (logs) ======= */}
            <div className="bottom-section">
                <LogsPanel objects={logs} />
            </div>
        </div>
    );
}

export default MainPage;
