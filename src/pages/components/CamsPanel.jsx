import React, { useEffect, useRef, useState, useCallback } from "react";
import "./CamsPanel.css";
import CamsRow from "./CamsRow";

const COOKIE_NAME = "ipCameras";

const setCookie = (name, value, days = 365) => {
    const maxAge = Math.floor(days * 24 * 60 * 60);
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}`;
};

const getCookie = (name) => {
    const pattern = new RegExp(
        `(?:^|; )${name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1")}=([^;]*)`
    );
    const match = document.cookie.match(pattern);
    return match ? decodeURIComponent(match[1]) : null;
};

function CamsPanel({ onSelectCamera, onRegistryChange }) {
    const [ipCameras, setIpCameras] = useState([]);
    const [nameInput, setNameInput] = useState("");
    const [urlInput, setUrlInput] = useState("");
    const [selectedCameraId, setSelectedCameraId] = useState(null);

    const nextIdRef = useRef(1);
    const onSelectRef = useRef(onSelectCamera);
    useEffect(() => { onSelectRef.current = onSelectCamera; }, [onSelectCamera]);

    useEffect(() => {
        const raw = getCookie(COOKIE_NAME);
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return;
            const restored = parsed
                .map((c, idx) => ({
                    id: `ip-${c.numericId ?? idx + 1}`,
                    name: c.name || `IP Camera ${c.numericId ?? idx + 1}`,
                    type: "ip",
                    url: c.url || "",
                    numericId: Number(c.numericId ?? idx + 1),
                }))
                .filter((c) => c.url);
            if (!restored.length) return;
            setIpCameras(restored);
            const maxId = restored.reduce((m, c) => Math.max(m, c.numericId), 0);
            nextIdRef.current = maxId + 1;
            const first = restored[0];
            setSelectedCameraId(first.id);
            onSelectRef.current?.(first);
        } catch {}
    }, []);

    useEffect(() => {
        onRegistryChange?.(ipCameras);
        const compact = ipCameras.map(({ name, url, numericId }) => ({ name, url, numericId }));
        try {
            setCookie(COOKIE_NAME, JSON.stringify(compact));
        } catch {}
    }, [ipCameras, onRegistryChange]);

    const handleRowClick = useCallback(
        (camera) => {
            if (!camera || camera.id === selectedCameraId) return;
            setSelectedCameraId(camera.id);
            onSelectRef.current?.(camera);
        },
        [selectedCameraId]
    );

    const handleDelete = useCallback(
        (id) => {
            setIpCameras((prev) => {
                const next = prev.filter((cam) => cam.id !== id);
                if (selectedCameraId === id) {
                    const fallback = next[0] || null;
                    setSelectedCameraId(fallback ? fallback.id : null);
                    onSelectRef.current?.(fallback || null);
                }
                return next;
            });
        },
        [selectedCameraId]
    );

    const handleAddCamera = useCallback(() => {
        const trimmedUrl = (urlInput || "").trim();
        if (!trimmedUrl) return;
        const numericId = nextIdRef.current++;
        const newCamera = {
            id: `ip-${numericId}`,
            name: (nameInput || "").trim() || `IP Camera ${numericId}`,
            type: "ip",
            url: trimmedUrl,
            numericId,
        };
        setIpCameras((prev) => [...prev, newCamera]);
        setNameInput("");
        setUrlInput("");
    }, [nameInput, urlInput]);

    return (
        <div className="CamsPanel">
            <div className="AddCam">
                <input
                    className="NameInput"
                    placeholder="Camera name"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                />
                <input
                    className="URLInput"
                    placeholder="Stream URL"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                />
                <button className="AddCamButton" onClick={handleAddCamera} title="Add IP camera">➕</button>
            </div>

            {ipCameras.map((cam) => (
                <CamsRow
                    key={cam.id}
                    id={cam.id}
                    name={`${cam.name} (#${cam.numericId})`}
                    isSelected={cam.id === selectedCameraId}
                    onClick={() => handleRowClick(cam)}
                    onDelete={handleDelete}
                />
            ))}
        </div>
    );
}

export default CamsPanel;
