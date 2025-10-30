import React, { useEffect, useRef, useState, useCallback } from "react";
import "./CamsPanel.css";
import CamsRow from "./CamsRow";

/* ============================================================
   Cookie helpers
   ============================================================ */

const COOKIE_NAME = "ipCameras";

/**
 * Save data to cookies with a max-age (default 1 year)
 */
const setCookie = (name, value, days = 365) => {
    const maxAge = Math.floor(days * 24 * 60 * 60);
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}`;
};

/**
 * Get cookie value by name
 */
const getCookie = (name) => {
    const pattern = new RegExp(
        "(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)"
    );
    const match = document.cookie.match(pattern);
    return match ? decodeURIComponent(match[1]) : null;
};

/* ============================================================
   Component
   ============================================================ */

function CamsPanel({ onSelectCamera, onRegistryChange }) {
    /* ------------------ State ------------------ */
    const [ipCameras, setIpCameras] = useState([]);
    const [nameInput, setNameInput] = useState("");
    const [urlInput, setUrlInput] = useState("");
    const [selectedCameraId, setSelectedCameraId] = useState(null);

    const nextIdRef = useRef(1);

    /* ============================================================
       Load from cookies on mount
       ============================================================ */
    useEffect(() => {
        const raw = getCookie(COOKIE_NAME);
        if (!raw) return;

        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return;

            // Normalize and clean list
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

            // Update ID counter for next camera
            const maxId = restored.reduce((m, c) => Math.max(m, c.numericId), 0);
            nextIdRef.current = maxId + 1;

            // Auto-select the first camera if none is selected
            const first = restored[0];
            setSelectedCameraId(first.id);
            onSelectCamera?.(first);
        } catch {
            console.warn("[CamsPanel] Invalid cookie data, skipping restoration");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* ============================================================
       Save to cookies + notify parent whenever list changes
       ============================================================ */
    useEffect(() => {
        onRegistryChange?.(ipCameras);

        const compact = ipCameras.map(({ name, url, numericId }) => ({
            name,
            url,
            numericId,
        }));

        try {
            setCookie(COOKIE_NAME, JSON.stringify(compact));
        } catch {
            console.warn("[CamsPanel] Failed to save cameras to cookies");
        }
    }, [ipCameras, onRegistryChange]);

    /* ============================================================
       Handlers
       ============================================================ */

    /** Select camera row */
    const handleRowClick = useCallback(
        (camera) => {
            if (camera.id === selectedCameraId) return;
            setSelectedCameraId(camera.id);
            onSelectCamera?.(camera);
        },
        [selectedCameraId, onSelectCamera]
    );

    /** Delete camera (and reselect another if needed) */
    const handleDelete = useCallback(
        (id) => {
            setIpCameras((prev) => {
                const next = prev.filter((cam) => cam.id !== id);

                // If deleted camera was selected — pick another one
                if (selectedCameraId === id) {
                    const fallback = next[0] || null;
                    setSelectedCameraId(fallback ? fallback.id : null);
                    onSelectCamera?.(fallback || null);
                }

                return next;
            });
        },
        [selectedCameraId, onSelectCamera]
    );

    /** Add new IP camera */
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

    /* ============================================================
       Render
       ============================================================ */

    return (
        <div className="CamsPanel">
            {/* ------- Add Camera Form ------- */}
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
                <button
                    className="AddCamButton"
                    onClick={handleAddCamera}
                    title="Add IP camera"
                >
                    ➕
                </button>
            </div>

            {/* ------- Camera List ------- */}
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
