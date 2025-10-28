import React, { useEffect, useState } from "react";
import "./CamsPanel.css";
import CamsRow from "./CamsRow";

function CamsPanel({ onSelectCamera }) {
    const [usbCams, setUsbCams] = useState([]);
    const [ipCams, setIpCams] = useState([]);
    const [NameInput, setNameInput] = useState("");
    const [URLInput, setURLInput] = useState("");
    const [selectedId, setSelectedId] = useState(null);

    useEffect(() => {
        // Проверяем, поддерживает ли браузер работу с медиаустройствами
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            console.warn("Ваш браузер не поддерживает API enumerateDevices.");
            return;
        }

        // Пытаемся запросить разрешение для получения меток устройств
        navigator.mediaDevices
            .getUserMedia({ video: true })
            .then((stream) => {
                // Останавливаем все треки (нам нужно было только разрешение)
                stream.getTracks().forEach((t) => t.stop());
            })
            .catch(() => {
                // Если пользователь запретил доступ — не страшно, просто продолжаем без него
                console.warn("Доступ к камере не предоставлен. Продолжаем без USB-камер.");
            })
            .finally(() => {
                // Всегда выполняем enumerateDevices, даже если getUserMedia не сработал
                navigator.mediaDevices
                    .enumerateDevices()
                    .then((devices) => {
                        const videoInputs = devices.filter((d) => d.kind === "videoinput");
                        const mapped = videoInputs.map((d, idx) => ({
                            id: d.deviceId || `no-id-${idx}`,
                            name: d.label || `USB Camera ${idx + 1}`,
                            type: "usb",
                            deviceId: d.deviceId,
                        }));

                        setUsbCams(mapped);

                        if (mapped.length > 0) {
                            setSelectedId(mapped[0].id);
                            onSelectCamera(mapped[0]);
                        } else {
                            console.log("USB-камеры не найдены, ня~");
                        }
                    })
                    .catch((err) => {
                        console.error("Ошибка при получении списка устройств:", err);
                    });
            });
    }, []);


    const handleRowClick = (cam) => {
        setSelectedId(cam.id);
        onSelectCamera(cam);
    };

    const handleDelete = (id) => {
        setIpCams((prev) => prev.filter((cam) => cam.id !== id));
    };

    const addCam = (id, name, url) => {
        setIpCams((prev) => [
            ...prev,
            {
                id: String(id),
                name,
                type: "ip",
                url,
            },
        ]);
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
                    onClick={() =>
                        addCam(ipCams.length + 1, NameInput || "Безымянная", URLInput)
                    }
                >
                    ➕
                </button>
            </div>

            {allCams.map((cam) => (
                <CamsRow
                    key={cam.id}
                    id={cam.id}
                    name={cam.name}
                    isSelected={cam.id === selectedId}
                    onClick={() => handleRowClick(cam)}
                    onDelete={handleDelete}
                />
            ))}
        </div>
    );
}

export default CamsPanel;
