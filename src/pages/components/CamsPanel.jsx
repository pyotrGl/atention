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
		// 1) Сначала запрашиваем доступ к любому видеопотоку (чтобы браузер отобразил labels)
		navigator.mediaDevices
			.getUserMedia({ video: true })
			.then((stream) => {
				// Как только разрешение получено, можно сразу остановить все треки (мы брали только для доступа к меткам)
				stream.getTracks().forEach((t) => t.stop());

				// 2) Теперь можно получить список устройств с понятными метками
				return navigator.mediaDevices.enumerateDevices();
			})
			.then((devices) => {
				const videoInputs = devices.filter((d) => d.kind === "videoinput");
				const mapped = videoInputs.map((d, idx) => ({
					id: d.deviceId,
					name: d.label || `USB Camera ${idx + 1}`,
					type: "usb",
					deviceId: d.deviceId,
				}));
				setUsbCams(mapped);

				if (mapped.length > 0) {
					setSelectedId(mapped[0].id);
					onSelectCamera(mapped[0]);
				}
			})
			.catch((err) => {
				console.error("Не удалось получить доступ к камере или список устройств:", err);
			});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const handleRowClick = (cam) => {
		setSelectedId(cam.id);
		onSelectCamera(cam);
	};

	const allCams = [...usbCams, ...ipCams];

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

	return (
		<div className="CamsPanel">
			<div className="AddCam">
				<input
					className="NameInput"
					placeholder="Имя IP‑камеры"
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
				/>
			))}
		</div>
	);
}

export default CamsPanel;
