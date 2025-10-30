import React, { useEffect, useRef, useState } from "react";
import "./CamsPanel.css";
import CamsRow from "./CamsRow";

/**
 * onRegistryChange(list) – вызывается ТОЛЬКО из useEffect,
 * чтобы не было "Cannot update a component while rendering".
 */
function CamsPanel({ onSelectCamera, onRegistryChange }) {
    const [usbCams, setUsbCams] = useState([]);
    const [ipCams, setIpCams] = useState([]);
    const [NameInput, setNameInput] = useState("");
    const [URLInput, setURLInput] = useState("");
    const [selectedId, setSelectedId] = useState(null);

    const ipIdRef = useRef(1);

    // Инициализация USB-камер
    useEffect(() => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            console.warn("enumerateDevices не поддерживается");
            return;
        }

        navigator.mediaDevices.getUserMedia({ video: true })
            .then((s) => s.getTracks().forEach((t) => t.stop()))
            .catch(() => console.warn("Доступ к камере не дан — продолжаем без label"))
            .finally(() => {
                navigator.mediaDevices.enumerateDevices()
                    .then((devices) => {
                        const videoInputs = devices.filter((d) => d.kind === "videoinput");
                        const mapped = videoInputs.map((d, idx) => ({
                            id: d.deviceId || `no-id-${idx}`,
                            name: d.label || `USB Camera ${idx + 1}`,
                            type: "usb",
                            deviceId: d.deviceId,
                            numericId: 1000 + idx,
                        }));
                        setUsbCams(mapped);

                        // авто-выбор первой пригодной
                        const first = mapped.find(c => !!c.deviceId);
                        if (!selectedId && first) {
                            setSelectedId(first.id);
                            onSelectCamera(first);
                        }
                    })
                    .catch((err) => console.error("enumerateDevices error:", err));
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Сообщаем родителю об изменениях в реестре (USB + IP)
    useEffect(() => {
        const list = [...usbCams, ...ipCams];
        onRegistryChange && onRegistryChange(list);
    }, [usbCams, ipCams, onRegistryChange]);

    const handleRowClick = (cam) => {
        if (cam.id === selectedId) return;
        setSelectedId(cam.id);
        onSelectCamera(cam);
    };

    const handleDelete = (id) => {
        setIpCams((prev) => {
            const next = prev.filter((cam) => cam.id !== id);
            if (selectedId === id) {
                const fallback = [...usbCams, ...next][0];
                if (fallback) {
                    setSelectedId(fallback.id);
                    onSelectCamera(fallback);
                } else {
                    setSelectedId(null);
                }
            }
            return next;
        });
    };

    const addCam = (id, name, url) => {
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
        // можно авто-выбирать добавленную:
        // setSelectedId(cam.id); onSelectCamera(cam);
    };

    const allCams = [...usbCams, ...ipCams];

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

            {allCams.map((cam) => (
                <CamsRow
                    key={cam.id}
                    id={cam.id}
                    name={`${cam.name}${Number.isInteger(cam.numericId) ? ` (#${cam.numericId})` : ""}`}
                    isSelected={cam.id === selectedId}
                    onClick={() => handleRowClick(cam)}
                    onDelete={handleDelete}
                />
            ))}
        </div>
    );
}

export default CamsPanel;
