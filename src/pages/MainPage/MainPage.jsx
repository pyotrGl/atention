import React, { useCallback, useEffect, useRef, useState } from "react";
import config from "../../config";
import VideoPanel from "../components/VideoPanel";
import LogsPanel from "../components/LogsPanel";
import CamsPanel from "../components/CamsPanel";
import "./MainPage.css";

const parseMaybeNestedJSON = (raw) => {
    try {
        let v = JSON.parse(raw);
        if (typeof v === "string") v = JSON.parse(v);
        return v;
    } catch {
        return null;
    }
};

const genId = (p = "log") => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function MainPage() {
    const [selectedCameraId, setSelectedCameraId] = useState(null);
    const [url, setUrl] = useState(null);
    const [boxes, setBoxes] = useState([]);
    const [logs, setLogs] = useState([]);
    const [cameraRegistry, setCameraRegistry] = useState({});

    const wsMapRef = useRef(new Map());
    const lastBoxesByCameraRef = useRef(new Map());
    const cameraRegistryRef = useRef({});

    const sendOnWS = useCallback((cameraId, payload) => {
        const ws = wsMapRef.current.get(cameraId);
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
    }, []);

    const openWS = useCallback(
        (camera) => {
            if (!camera?.numericId || wsMapRef.current.has(camera.numericId)) return;
            let wsUrl = config.videoWS;
            if (window.location.protocol === "https:" && wsUrl.startsWith("ws://")) {
                wsUrl = wsUrl.replace(/^ws:\/\//, "wss://");
            }
            const ws = new WebSocket(wsUrl);
            wsMapRef.current.set(camera.numericId, ws);

            ws.onopen = () => {
                ws.send(JSON.stringify({ type: "url", camera_id: camera.numericId, camera_url: camera.url }));
                const isActive = selectedCameraId === camera.numericId;
                ws.send(JSON.stringify({ type: "status", status: isActive ? "active" : "not_active" }));
            };

            ws.onmessage = ({ data }) => {
                const msg = typeof data === "string" ? parseMaybeNestedJSON(data) : data;
                if (!msg || typeof msg !== "object") return;

                if (msg.type === "labels" && Number.isInteger(msg.camera_id)) {
                    const list = Array.isArray(msg.labels) ? msg.labels : [];
                    lastBoxesByCameraRef.current.set(msg.camera_id, list);
                    if (msg.camera_id === selectedCameraId) setBoxes(list);
                    return;
                }

                if (msg.type === "warning") {
                    const camId = Number.isInteger(msg.camera_id) ? msg.camera_id : null;
                    const device =
                        (camId && cameraRegistryRef.current[camId]?.name) || (camId ? `Camera #${camId}` : "Unknown device");
                    const entry = {
                        id: genId("warn"),
                        ts: Date.now(),
                        cameraId: camId,
                        device,
                        name: msg.object_name ?? "Unknown object",
                        attention: msg.warning_type ?? "warning",
                    };
                    setLogs((prev) => [entry, ...prev]);
                    setTimeout(() => setLogs((prev) => prev.filter((x) => x.id !== entry.id)), 3000);
                }
            };

            ws.onclose = () => {
                const cur = wsMapRef.current.get(camera.numericId);
                if (cur === ws) wsMapRef.current.delete(camera.numericId);
            };

            ws.onerror = () => {};
        },
        [selectedCameraId]
    );

    const closeWS = useCallback((cameraId) => {
        const ws = wsMapRef.current.get(cameraId);
        if (ws) {
            try {
                ws.close();
            } catch {}
            wsMapRef.current.delete(cameraId);
        }
    }, []);

    const handleCameraSelection = useCallback(
        (camera) => {
            const prevId = selectedCameraId;

            if (!camera) {
                if (prevId != null) sendOnWS(prevId, { type: "status", status: "not_active" });
                setSelectedCameraId(null);
                setUrl(null);
                setBoxes([]);
                return;
            }

            const cameraId = camera.numericId;
            if (prevId != null && prevId !== cameraId) sendOnWS(prevId, { type: "status", status: "not_active" });
            if (!wsMapRef.current.has(cameraId)) openWS(camera);

            setSelectedCameraId(cameraId);
            setUrl(camera.url);
            setBoxes(lastBoxesByCameraRef.current.get(cameraId) || []);
            sendOnWS(cameraId, { type: "status", status: "active" });
        },
        [selectedCameraId, sendOnWS, openWS]
    );

    const handleRegistryChange = useCallback(
        (list) => {
            const nextDict = {};
            for (const c of list || []) if (Number.isInteger(c.numericId)) nextDict[c.numericId] = c;

            const prevDict = cameraRegistryRef.current;
            const prevIds = new Set(Object.keys(prevDict).map((k) => Number(k)));
            const nextIds = new Set(Object.keys(nextDict).map((k) => Number(k)));

            for (const id of nextIds) if (!prevIds.has(id)) openWS(nextDict[id]);
            for (const id of prevIds) if (!nextIds.has(id)) closeWS(id);

            cameraRegistryRef.current = nextDict;
            setCameraRegistry(nextDict);

            if (selectedCameraId != null && !nextIds.has(selectedCameraId)) {
                const firstId = [...nextIds][0];
                if (firstId != null) {
                    const cam = nextDict[firstId];
                    setSelectedCameraId(firstId);
                    setUrl(cam.url);
                    setBoxes(lastBoxesByCameraRef.current.get(firstId) || []);
                    sendOnWS(firstId, { type: "status", status: "active" });
                } else {
                    setSelectedCameraId(null);
                    setUrl(null);
                    setBoxes([]);
                }
            }
        },
        [openWS, closeWS, selectedCameraId, sendOnWS]
    );

    useEffect(() => {
        const map = wsMapRef.current;
        return () => {
            for (const [, ws] of map.entries()) {
                try {
                    ws.close();
                } catch {}
            }
            map.clear();
        };
    }, []);

    return (
        <div className="MainPage">
            <div className="top-section">
                <CamsPanel onSelectCamera={handleCameraSelection} onRegistryChange={handleRegistryChange} />
                <div className="VideoWrap">
                    <VideoPanel url={url} boxes={boxes} />
                </div>
            </div>
            <div className="bottom-section">
                <LogsPanel objects={logs} />
            </div>
        </div>
    );
}

export default MainPage;
