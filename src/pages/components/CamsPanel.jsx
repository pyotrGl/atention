import React, { useEffect, useRef, useState } from "react";
import "./CamsPanel.css";
import CamsRow from "./CamsRow";

/** ==== Cookies helpers ==== */
const COOKIE_NAME = "ipCameras";

/** days -> max-age cookie */
function setCookie(name, value, days = 365) {
    const maxAge = Math.floor(days * 24 * 60 * 60);
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}`;
}

function getCookie(name) {
    const m = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
}

function CamsPanel({ onSelectCamera, onRegistryChange }) {
    const [ipCams, setIpCams] = useState([]);
    const [NameInput, setNameInput] = useState("");
    const [URLInput, setURLInput] = useState("");
    const [selectedId, setSelectedId] = useState(null);

    // будем увеличивать с макс. numericId + 1 после восстановления из cookies
    const ipIdRef = useRef(1);

    /** Восстанавливаем список из cookies на старте */
    useEffect(() => {
        const raw = getCookie(COOKIE_NAME);
        if (!raw) return;

        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                // нормализуем и выставляем корректный nextId
                const restored = parsed.map((c, idx) => ({
                    id: `ip-${c.numericId ?? idx + 1}`,
                    name: c.name || `IP Camera ${c.numericId ?? idx + 1}`,
                    type: "ip",
                    url: c.url || "",
                    numericId: Number(c.numericId ?? idx + 1),
                })).filter(c => c.url);

                if (restored.length) {
                    setIpCams(restored);
                    // next id
                    const maxId = restored.reduce((m, c) => Math.max(m, c.numericId), 0);
                    ipIdRef.current = maxId + 1;

                    // авто-выбор первой, если ещё ничего не выбрано
                    const first = restored[0];
                    setSelectedId(first.id);
                    onSelectCamera && onSelectCamera(first);
                }
            }
        } catch {
            // игнор: битые cookies просто пропускаем
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /** Сообщаем родителю и сохраняем cookies при ЛЮБОМ изменении списка */
    useEffect(() => {
        onRegistryChange && onRegistryChange(ipCams);

        // сохраняем компактно: только нужные поля
        const compact = ipCams.map(({ name, url, numericId }) => ({ name, url, numericId }));
        try {
            setCookie(COOKIE_NAME, JSON.stringify(compact));
        } catch {
            // если не влезло в 4KB — ничего страшного, просто не перезапишем
        }
    }, [ipCams, onRegistryChange]);

    const handleRowClick = (cam) => {
        if (cam.id === selectedId) return;
        setSelectedId(cam.id);
        onSelectCamera && onSelectCamera(cam);
    };

    /** Удаление: если удаляем выбранную — переключаемся на другую */
    const handleDelete = (id) => {
        setIpCams((prev) => {
            const next = prev.filter((cam) => cam.id !== id);

            if (selectedId === id) {
                const fallback = next[0] || null;
                setSelectedId(fallback ? fallback.id : null);
                if (fallback) {
                    onSelectCamera && onSelectCamera(fallback);
                } else {
                    // если список опустел — сообщаем, что выбора нет
                    onSelectCamera && onSelectCamera(null);
                }
            }
            return next;
        });
    };

    const addCam = (_ignoredSequential, name, url) => {
        const trimmedUrl = (url || "").trim();
        if (!trimmedUrl) return;
        const numericId = ipIdRef.current++;

        const cam = {
            id: `ip-${numericId}`,
            name: (name || "").trim() || `IP Camera ${numericId}`,
            type: "ip",
            url: trimmedUrl,
            numericId,
        };

        setIpCams((prev) => [...prev, cam]);
        // Выбирать новодобавленную не обязательно; если нужно — раскомментируй:
        // setSelectedId(cam.id); onSelectCamera && onSelectCamera(cam);
    };

    return (
        <div className="CamsPanel">
            <div className="AddCam">
                <input
                    className="NameInput"
                    placeholder="Имя IP-камеры"
                    value={NameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                />
                <input
                    className="URLInput"
                    placeholder="URL потока"
                    value={URLInput}
                    onChange={(e) => setURLInput(e.target.value)}
                />
                <button
                    className="AddCamButton"
                    onClick={() => {
                        addCam(ipCams.length + 1, NameInput || "Безымянная", URLInput);
                        setNameInput("");
                        setURLInput("");
                    }}
                    title="Добавить IP-камеру"
                >
                    ➕
                </button>
            </div>

            {ipCams.map((cam) => (
                <CamsRow
                    key={cam.id}
                    id={cam.id}
                    name={`${cam.name} (#${cam.numericId})`}
                    isSelected={cam.id === selectedId}
                    onClick={() => handleRowClick(cam)}
                    onDelete={handleDelete}
                />
            ))}
        </div>
    );
}

export default CamsPanel;
