import React, { useEffect, useLayoutEffect, useRef } from "react";
import "./VideoPanel.css";

function VideoPanel({ stream, ipUrl, boxes }) {
    const containerRef = useRef(null);
    const videoRef = useRef(null);
    const imgRef = useRef(null);
    const canvasRef = useRef(null);

    // показать <video> или <img>
    useEffect(() => {
        const v = videoRef.current, i = imgRef.current;
        const hide = el => { if (el) el.style.display = "none"; };
        const show = el => { if (el) el.style.display = "block"; };

        if (stream && v) {
            show(v); hide(i);
            v.srcObject = stream; v.muted = true; v.play().catch(()=>{});
        } else if (ipUrl && i) {
            show(i); hide(v);
            if (v) { v.pause(); v.removeAttribute("src"); v.srcObject = null; }
            i.src = ipUrl;
        } else {
            hide(v); hide(i);
            if (v) { v.pause(); v.removeAttribute("src"); v.srcObject = null; }
            if (i) i.src = "";
        }
    }, [stream, ipUrl]);

    // выравниваем канвас ПО РЕАЛЬНОМУ РЕКТУ видео/картинки
    const syncCanvasToMedia = () => {
        const container = containerRef.current;
        const canvas = canvasRef.current;
        const v = videoRef.current;
        const i = imgRef.current;
        if (!container || !canvas) return null;

        const activeEl =
            v && v.style.display !== "none" ? v :
                i && i.style.display !== "none" ? i : null;
        if (!activeEl) return null;

        // исходные размеры кадра
        const srcW = activeEl === v ? v.videoWidth : i.naturalWidth;
        const srcH = activeEl === v ? v.videoHeight : i.naturalHeight;
        if (!srcW || !srcH) return null;

        // реальные CSS-координаты media внутри контейнера
        const cr = container.getBoundingClientRect();
        const mr = activeEl.getBoundingClientRect();
        const left = mr.left - cr.left;
        const top  = mr.top  - cr.top;
        const cssW = mr.width;
        const cssH = mr.height;

        // позиция/размер канваса в CSS-пикселях = ровно как у media
        canvas.style.left = `${left}px`;
        canvas.style.top  = `${top}px`;
        canvas.style.width  = `${cssW}px`;
        canvas.style.height = `${cssH}px`;

        // ретина-чёткость
        const dpr = window.devicePixelRatio || 1;
        canvas.width  = Math.max(1, Math.round(cssW * dpr));
        canvas.height = Math.max(1, Math.round(cssH * dpr));

        // скопируем border-radius у видео на канвас (для красоты)
        const br = getComputedStyle(activeEl).borderRadius;
        canvas.style.borderRadius = br;

        // масштаб из source-space в canvas-пиксели
        // (при contain у видео обе оси масштабируются одинаково)
        const scale = Math.min(cssW / srcW, cssH / srcH);
        return { k: scale * dpr, srcW, srcH };
    };

    const draw = () => {
        const canvas = canvasRef.current;
        const v = videoRef.current, i = imgRef.current;
        if (!canvas) return;

        const m = syncCanvasToMedia();
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.setTransform(1,0,0,1,0,0);
        ctx.clearRect(0,0,canvas.width,canvas.height);

        const hasSource =
            (v && v.style.display !== "none" && v.videoWidth && v.videoHeight) ||
            (i && i.style.display !== "none" && i.naturalWidth && i.naturalHeight);

        if (!m || !hasSource || !Array.isArray(boxes) || boxes.length === 0) return;

        const { k, srcW, srcH } = m;
        ctx.lineWidth = Math.max(1, 2 * (window.devicePixelRatio || 1));
        ctx.strokeStyle = "#FFFFFF";

        for (const b of boxes) {
            const x1 = Math.max(0, b.x1), y1 = Math.max(0, b.y1);
            const x2 = Math.max(0, b.x2), y2 = Math.max(0, b.y2);
            const w = Math.max(0, x2 - x1), h = Math.max(0, y2 - y1);
            if (w <= 0 || h <= 0 || x1 >= srcW || y1 >= srcH) continue;

            ctx.strokeRect(Math.round(x1 * k), Math.round(y1 * k),
                Math.round(w * k),  Math.round(h * k));
        }
    };

    // перерисовки
    useLayoutEffect(() => {
        draw();
        const ro = new ResizeObserver(draw);
        if (containerRef.current) ro.observe(containerRef.current);
        return () => ro.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [boxes]);

    useEffect(() => {
        const v = videoRef.current, i = imgRef.current;
        const onReady = () => draw();
        if (v) { v.addEventListener("loadedmetadata", onReady); v.addEventListener("loadeddata", onReady); }
        if (i) { i.addEventListener("load", onReady); }
        return () => {
            if (v) { v.removeEventListener("loadedmetadata", onReady); v.removeEventListener("loadeddata", onReady); }
            if (i) { i.removeEventListener("load", onReady); }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stream, ipUrl]);

    return (
        <div className="VideoPanel" ref={containerRef}>
            <video className="video-element" autoPlay playsInline muted ref={videoRef}/>
            <img className="video-element" ref={imgRef} alt="IP Camera" style={{display:"none"}}/>
            <canvas className="video-overlay" ref={canvasRef}/>
        </div>
    );
}

export default VideoPanel;
