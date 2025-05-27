import React, { useEffect, useState } from "react";
import "./CamsPanel.css";
import CamsRow from "./CamsRow";

function CamsPanel({ onSelectCamera }) {
	// 1. Локальный стейт: список USB-камер (получим через enumerateDevices)
	const [usbCams, setUsbCams] = useState([]);
	const [ipCams, setIpCams] = useState([]);
	const [NameInput, setNameInput] = useState("");
	const [URLInput, setURLInput] = useState("");
	// 2. Список «статических» IP‑камер
	// const ipCams = [
	// 	{
	// 		id: "1",
	// 		name: "IP камера",
	// 		type: "ip",
	// 		url: "http://192.168.0.105:8080/video"
	// 	}
	// ];

	// 3. Выбранная камера: её id (deviceId для USB либо id из ipCams)
	const [selectedId, setSelectedId] = useState(null);

	// 4. При монтировании получаем список устройств
	useEffect(() => {
		navigator.mediaDevices
			.enumerateDevices()
			.then((devices) => {
				// Фильтруем только видеовходы (USB‑камеры)
				const videoInputs = devices.filter(
					(d) => d.kind === "videoinput"
				);
				// Преобразуем в объекты вида { id: deviceId, name: label || default, type: "usb", deviceId }
				const mapped = videoInputs.map((d, idx) => ({
					id: d.deviceId,
					name: d.label || `USB Camera ${idx + 1}`,
					type: "usb",
					deviceId: d.deviceId
				}));
				setUsbCams(mapped);

				// Если есть хотя бы одна USB‑камера, сразу выбираем первую
				if (mapped.length > 0) {
					setSelectedId(mapped[0].id);
					onSelectCamera(mapped[0]);
				}
			})
			.catch((err) => {
				console.error("Не удалось получить список устройств:", err);
			});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// 5. Обработчик клика по строке камеры
	const handleRowClick = (cam) => {
		setSelectedId(cam.id);
		onSelectCamera(cam);
	};

	// 6. Объединяем USB‑и IP‑камеры в один массив для рендера
	const allCams = [
		// Сначала USB‑камеры
		...usbCams,
		// Затем IP‑камеры (id уже уникальны)
		...ipCams
	];

	const addCam = (id, name, url) => {
		setIpCams(prev => [
			...prev,
			{
				id,
				name,
				type: "ip",
				url
			}
		]);
	};


	return (
		<div className="CamsPanel">
			<div className="AddCam">
				<input
					className="NameInput"
					value={NameInput}
					onChange={(e) => setNameInput(e.target.value)}
				/>
				<input
					className="URLInput"
					value={URLInput}
					onChange={(e) => setURLInput(e.target.value)}
				/>
				<button className="AddCamButton" onClick={() => addCam(ipCams.length+1, NameInput, URLInput)}>+</button>
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
