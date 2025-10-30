import React, { useEffect, useRef, useState } from "react";
import "./CamsPanel.css";
import CamsRow from "./CamsRow";

function CamsPanel({ onSelectCamera, onRegistryChange = () => {} }) {
    const [usbCams, setUsbCams] = useState([]);
    const [ipCams, setIpCams] = useState([]);
    const [NameInput, setNameInput] = useState("");
    const [URLInput, setURLInput] = useState("");
    const [selectedId, setSelectedId] = useState(null);

    // Счётчик для стабильных numericId IP-камер (int для API)
    const ipIdRef = useRef(1);

    useEffect(() => {
        // 1) Проверка API
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            console.warn("Ваш браузер не поддерживает API enumerateDevices.");
            return;
        }

        // 2) Пытаемся получить доступ, чтобы появились labels (не критично)
        navigator.mediaDevices
            .getUserMedia({ video: true })
            .then((s) => s.getTracks().forEach((t) => t.stop()))
            .catch(() => {
                console.warn("Доступ к камере не предоставлен. Продолжаем без USB-камер.");
            })
            .finally(() => {
                // 3) Всегда пробуем enumerateDevices
                navigator.mediaDevices
                    .enumerateDevices()
                    .then((devices) => {
                        const videoInputs = devices.filter((d) => d.kind === "videoinput");

                        const mapped = videoInputs.map((d, idx) => ({
                            id: d.deviceId || `no-id-${idx}`,
                            name: d.label || `USB Camera ${idx + 1}`,
                            type: "usb",
                            deviceId: d.deviceId,   // важно для getUserMedia(exact)
                            numericId: 1000 + idx,  // int для camera_id
                        }));

                        setUsbCams(mapped);

                        // Автовыбор первой доступной USB-камеры с валидным deviceId (ТОЛЬКО при самом первом монтировании)
                        const firstValid = mapped.find((c) => !!c.deviceId);
                        if (!selectedId && firstValid) {
                            setSelectedId(firstValid.id);
                            onSelectCamera(firstValid);
                        } else if (!selectedId && mapped.length === 0) {
                            console.log("USB-камеры не найдены.");
                        }
                    })
                    .catch((err) => {
                        console.error("Ошибка enumerateDevices:", err);
                    });
            });
        // ВАЖНО: без зависимостей — не перезапускать на каждую смену onSelectCamera/stream
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 🔸 Отправляем наверх актуальный список камер при любом изменении
    useEffect(() => {
        const all = [...usbCams, ...ipCams];
        onRegistryChange(all);
    }, [usbCams, ipCams, onRegistryChange]);

    const handleRowClick = (cam) => {
        if (cam.id === selectedId) return; // не трогаем уже выбранную
        setSelectedId(cam.id);
        onSelectCamera(cam);
    };

    const handleDelete = (id) => {
        // Удаляем только IP
        setIpCams((prev) => {
            const next = prev.filter((cam) => cam.id !== id);

            // Если удалили выбранную IP — выберем первую доступную из объединённого списка
            if (selectedId === id) {
                const fallback = [...usbCams, ...next].find(Boolean);
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
            numericId, // int для camera_id
        };

        setIpCams((prev) => [...prev, cam]);

        // (Опционально) автоселект только что добавленной IP-камеры:
        // setSelectedId(cam.id);
        // onSelectCamera(cam);
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
