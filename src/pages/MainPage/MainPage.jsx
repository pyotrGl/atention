import React, { useEffect, useRef, useState } from "react";
import Cookies from "js-cookie";
import { useNavigate } from "react-router-dom";
import config from "../../config";
import "./MainPage.css";
import VideoPanel from "../components/VideoPanel";
import LogsPanel from "../components/LogsPanel";

function MainPage() {
	const navigate = useNavigate();
	const wsRef = useRef();
	const captureCanvasRef = useRef(document.createElement('canvas'));
	const [stream, setStream] = useState(null);
	const [boxes, setBoxes] = useState([]);

	useEffect(() => {
		const ws = new WebSocket(config.videoWS);
		ws.binaryType = "arraybuffer";
		wsRef.current = ws;

		ws.onmessage = ({ data }) => {
			try {
				const parsed = JSON.parse(data);
				setBoxes(parsed);
			} catch {}
		};

		navigator.mediaDevices.getUserMedia({ video: true })
			.then(s => {
				setStream(s);

				const videoTrack = s.getVideoTracks()[0];
				const { width, height } = videoTrack.getSettings();

				const captureCanvas = captureCanvasRef.current;
				captureCanvas.width = width;
				captureCanvas.height = height;
				const ctx = captureCanvas.getContext('2d');

				const captureAndSend = () => {
					if (wsRef.current.readyState === WebSocket.OPEN) {
						const videoEl = document.querySelector('.video-element');
						ctx.drawImage(videoEl, 0, 0, width, height);
						captureCanvas.toBlob(blob => {
							if (blob) wsRef.current.send(blob);
						}, 'image/jpeg', 0.7);
					}
				};

				const intervalId = setInterval(captureAndSend, 100);
				return () => clearInterval(intervalId);
			})
			.catch(console.error);

		return () => {
			ws.close();
		};
	}, []);

	return (
		<div className="MainPage">
			<VideoPanel stream={stream} boxes={boxes} />
			<LogsPanel objects={boxes} />
		</div>
	);
}

export default MainPage;
