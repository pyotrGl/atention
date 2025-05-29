import React, { useEffect, useRef, useState,  } from "react";
import {Navigate, useNavigate} from "react-router-dom";
import config from "../../config";
import "./MainPage.css";
import Cookies from 'js-cookie';
import VideoPanel from "../components/VideoPanel";
import LogsPanel from "../components/LogsPanel";
import CamsPanel from "../components/CamsPanel";

function MainPage() {
	const wsRef = useRef(null);
	const captureCanvasRef = useRef(document.createElement("canvas"));
	const [stream, setStream] = useState(null);
	const [ipUrl, setIpUrl] = useState(null);
	const [boxes, setBoxes] = useState([]);
	const navigate = useNavigate();


	// 1. Открываем WebSocket при монтировании
	useEffect(() => {

		// fetch(`${config.apiBaseURL}/${config.loginEndpoint}`,{
		// 	method: "POST",
		// 	headers: {
		// 		"Content-Type": "application/json",
		// 	},
		// 	body: JSON.stringify({
		// 		email: Cookies.get("email"), password: Cookies.get("password"),
		// 	}),
		// }).catch(error => {
		// 	console.log(error);
		// 	navigate("/login/403");
		// });

		const ws = new WebSocket(config.videoWS);
		ws.binaryType = "arraybuffer";
		wsRef.current = ws;

		ws.onmessage = ({ data }) => {
			try {
				const parsed = JSON.parse(data);
				setBoxes(parsed);
			} catch {
				// Игнорируем, если не JSON
			}
		};

		ws.onerror = (err) => {
			console.error("WebSocket error:", err);
		};

		ws.onclose = () => {
			console.log("WebSocket closed");
		};

		return () => {
			ws.close();
		};
	}, []);

	// 2. Когда меняется stream, запускаем цикл захвата кадров (для USB‑камер)
	useEffect(() => {
		// Если сейчас выбрана IP‑камера (ipUrl), то захвата USB не нужно
		if (!stream) return;

		const videoTrack = stream.getVideoTracks()[0];
		const { width, height } = videoTrack.getSettings();

		const captureCanvas = captureCanvasRef.current;
		captureCanvas.width = width;
		captureCanvas.height = height;
		const ctx = captureCanvas.getContext("2d");

		const captureAndSend = () => {
			if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
				const videoEl = document.querySelector(".video-element");
				if (!videoEl) return;
				ctx.drawImage(videoEl, 0, 0, width, height);
				captureCanvas.toBlob(
					(blob) => {
						if (blob) wsRef.current.send(blob);
					},
					"image/jpeg",
					1
				);
			}
		};

		const intervalId = setInterval(captureAndSend, 100);
		return () => clearInterval(intervalId);
	}, [stream]);

	// 3. Обработчик выбора камеры
	//    Получает объект cam { type, deviceId?, url?, name? }
	const handleCameraSelection = (cam) => {
		// Останавливаем предыдущий stream, если был
		if (stream) {
			stream.getTracks().forEach((t) => t.stop());
			setStream(null);
		}
		// Сбрасываем IP‑URL, если переключаемся на USB
		setIpUrl(null);

		if (cam.type === "usb") {
			// Запрашиваем USB‑камеру по deviceId
			navigator.mediaDevices
				.getUserMedia({ video: { deviceId: { exact: cam.deviceId } } })
				.then((usbStream) => {
					setStream(usbStream);
				})
				.catch((err) => {
					console.error("Не удалось получить USB‑камеру:", err);
					setStream(null);
				});
		} else if (cam.type === "ip") {
			// Для IP‑камеры устанавливаем ipUrl в cam.url
			setIpUrl(cam.url);
			// stream остаётся null, чтобы не запускать captureAndSend
		}
	};

	return (
		<div className="MainPage">
			<div className="top-section">
				{/* Передаём сразу оба: либо stream, либо ipUrl */}
				<CamsPanel onSelectCamera={handleCameraSelection} />
				<div></div>
				<VideoPanel stream={stream} ipUrl={ipUrl} boxes={boxes} />
			</div>
			<LogsPanel objects={boxes} />
		</div>
	);
}

export default MainPage;
