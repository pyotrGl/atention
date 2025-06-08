import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import config from "../../config";
import Cookies from "js-cookie";
import VideoPanel from "../components/VideoPanel";
import LogsPanel from "../components/LogsPanel";
import CamsPanel from "../components/CamsPanel";

function MainPage() {
	const wsRef = useRef(null);
	const pingRef = useRef(null);
	const reconnectRef = useRef(null);
	const captureCanvasRef = useRef(document.createElement("canvas"));
	const [stream, setStream] = useState(null);
	const [ipUrl, setIpUrl] = useState(null);
	const [boxes, setBoxes] = useState([]);
	const navigate = useNavigate();

	const connectWS = () => {
		const ws = new WebSocket(config.videoWS);
		ws.binaryType = "arraybuffer";
		wsRef.current = ws;

		ws.onopen = () => {
			console.log("WS open 👍");
			// heartbeat
			pingRef.current = setInterval(() => {
				if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
			}, 30000);
		};

		ws.onmessage = ({ data }) => {
			try {
				const msg = JSON.parse(data);
				if (msg.type === "pong") return; // ответ на ping
				setBoxes(msg);
			} catch {
				// не JSON
			}
		};

		ws.onerror = (e) => console.error("WS err:", e);

		ws.onclose = () => {
			console.log("WS closed, ребутимся 🚀");
			clearInterval(pingRef.current);
			reconnectRef.current = setTimeout(connectWS, 1000);
		};
	};

	useEffect(() => {
		connectWS();
		return () => {
			clearInterval(pingRef.current);
			clearTimeout(reconnectRef.current);
			wsRef.current?.close();
		};
	}, []);

	useEffect(() => {
		if (!stream) return;
		const videoTrack = stream.getVideoTracks()[0];
		const { width, height } = videoTrack.getSettings();
		const canvas = captureCanvasRef.current;
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext("2d");

		const sendFrame = () => {
			const ws = wsRef.current;
			if (ws?.readyState === WebSocket.OPEN) {
				const videoEl = document.querySelector(".video-element");
				if (!videoEl) return;
				ctx.drawImage(videoEl, 0, 0, width, height);
				canvas.toBlob((blob) => {
					if (blob) ws.send(blob);
				}, "image/jpeg", 0.7); // чуть юзь качество
			}
		};

		const id = setInterval(sendFrame, 200); // 200ms
		return () => clearInterval(id);
	}, [stream]);

	const handleCameraSelection = (cam) => {
		stream?.getTracks().forEach((t) => t.stop());
		setStream(null);
		setIpUrl(null);
		if (cam.type === "usb") {
			navigator.mediaDevices
				.getUserMedia({ video: { deviceId: { exact: cam.deviceId } } })
				.then(setStream)
				.catch((e) => console.error("USB error:", e));
		} else {
			setIpUrl(cam.url);
		}
	};

	return (
		<div className="MainPage">
			<div className="top-section">
				<CamsPanel onSelectCamera={handleCameraSelection} />
				<VideoPanel stream={stream} ipUrl={ipUrl} boxes={boxes} />
			</div>
			<LogsPanel objects={boxes} />
		</div>
	);
}

export default MainPage;
