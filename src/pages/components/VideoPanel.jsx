import React, { useEffect, useLayoutEffect, useRef, useCallback } from "react";
import "./VideoPanel.css";

function VideoPanel({ url, boxes }) {
    const containerRef = useRef(null);
    const imgRef = useRef(null);
    const canvasRef = useRef(null);

    useEffect(() => {
        const img = imgRef.current;
        if (!img) return;
        img.src = url || "";
    }, [url]);

    const colorFromName = useCallback((name) => {
        const str = String(name ?? "");
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
        }
        const hex = (hash % 0xffffff).toString(16).padStart(6, "0");
        return `#${hex}`;
    }, []);

    const syncCanvas = useCallback(() => {
        const container = containerRef.current;
        const canvas = canvasRef.current;
        const img = imgRef.current;
        if (!container || !canvas || !img) return null;

        const srcW = img.naturalWidth;
        const srcH = img.naturalHeight;
        if (!srcW || !srcH) return null;

        const cr = container.getBoundingClientRect();
        const mr = img.getBoundingClientRect();
        const left = mr.left - cr.left;
        const top = mr.top - cr.top;
        const cssW = mr.width;
        const cssH = mr.height;

        canvas.style.left = `${left}px`;
        canvas.style.top = `${top}px`;
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.round(cssW * dpr));
        canvas.height = Math.max(1, Math.round(cssH * dpr));
        canvas.style.borderRadius = getComputedStyle(img).borderRadius;

        const k = Math.min(cssW / srcW, cssH / srcH) * dpr;
        return { k, srcW, srcH, dpr };
    }, []);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const img = imgRef.current;
        if (!canvas || !img) return;

        const m = syncCanvas();
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!m || !Array.isArray(boxes) || boxes.length === 0 || !img.naturalWidth) return;

        const { k, srcW, srcH, dpr } = m;
        ctx.lineWidth = Math.max(3, 2 * dpr);

        for (const b of boxes) {
            const x1 = Math.max(0, Number(b.x1) || 0);
            const y1 = Math.max(0, Number(b.y1) || 0);
            const x2 = Math.max(0, Number(b.x2) || 0);
            const y2 = Math.max(0, Number(b.y2) || 0);
            const w = Math.max(0, x2 - x1);
            const h = Math.max(0, y2 - y1);
            if (w <= 0 || h <= 0 || x1 >= srcW || y1 >= srcH) continue;

            ctx.strokeStyle = colorFromName(b.name);
            ctx.strokeRect(
                Math.round(x1 * k),
                Math.round(y1 * k),
                Math.round(w * k),
                Math.round(h * k)
            );
        }
    }, [boxes, syncCanvas, colorFromName]);

    useLayoutEffect(() => {
        draw();
        const ro = new ResizeObserver(draw);
        if (containerRef.current) ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, [draw]);

    useEffect(() => {
        const img = imgRef.current;
        if (!img) return;
        const onReady = () => draw();
        img.addEventListener("load", onReady);
        return () => img.removeEventListener("load", onReady);
    }, [draw, url]);

    return (
        <div className="VideoPanel" ref={containerRef}>
            <img className="video-element" ref={imgRef} alt="IP Camera" />
            <canvas className="video-overlay" ref={canvasRef} />
        </div>
    );
}

export default VideoPanel;
