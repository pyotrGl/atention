import React, {useRef, useEffect} from "react";
import "./VideoPanel.css";

function VideoPanel({stream, boxes}) {
	const videoRef = useRef(null);
	const canvasRef = useRef(null);

	// Привязываем видео-поток
	useEffect(() => {
		if (stream && videoRef.current) {
			videoRef.current.srcObject = stream;
		}
	}, [stream]);

	// Рисуем рамки при изменении boxes
	useEffect(() => {
		const canvas = canvasRef.current;
		const video = videoRef.current;
		if (!canvas || !video) return;                 // <-- защита от null
		const ctx = canvas.getContext("2d");
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		boxes.forEach(b => {
			ctx.strokeStyle = "#"+boxes.name;
			ctx.lineWidth = 2;
			ctx.strokeRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);
		});
	}, [boxes, stream]);

	return (
		<div className="VideoPanel">
			<video className="video" ref={videoRef} autoPlay muted playsInline/>
			<canvas className="VideoCanvas" ref={canvasRef}/>
		</div>
	);
}

export default VideoPanel;
