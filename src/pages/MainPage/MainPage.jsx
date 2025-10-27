import React, { useCallback, useEffect, useRef, useState } from "react";
import config from "../../config";
import VideoPanel from "../components/VideoPanel";
import LogsPanel from "../components/LogsPanel";
import CamsPanel from "../components/CamsPanel";
import "./MainPage.css"; // добавь если не было
/**
 * MainPage
 *
 * Управляет:
 *  - Соединением по WebSocket для отправки кадра и получения детекций (boxes)
 *  - Выбором камеры (USB / IP) и управлением MediaStream
 *  - Периодической отправкой JPEG-кадров на сервер
 *
 * Ключевые особенности:
 *  - Полный контроль очистки: таймеры/интервалы/стримы закрываются корректно
 *  - Стабильные коллбэки через useCallback, чтобы эффекты не перезапускались лишний раз
 *  - Бережная работа с WebSocket: heartbeat (ping/pong) + автопереподключение
 */
function MainPage() {
    // === Refs для долгоживущих сущностей ===
    const wsRef = useRef(null); // активный WebSocket
    const pingTimerRef = useRef(null); // id setInterval для heartbeat
    const reconnectTimerRef = useRef(null); // id setTimeout для переподключения
    const captureCanvasRef = useRef(document.createElement("canvas")); // канвас для кодирования JPEG
    const reconnectAttemptsRef = useRef(0); // счётчик переподключений (для потенциального backoff)

    // === Состояние UI/данных ===
    const [stream, setStream] = useState(null); // активный MediaStream (USB камера)
    const [ipUrl, setIpUrl] = useState(null); // URL IP-камеры (если выбран IP режим)
    const [boxes, setBoxes] = useState([]); // объекты детекции от сервера

    // === Константы таймингов (удобно держать в одном месте) ===
    const PING_INTERVAL_MS = 30_000; // раз в 30 сек отправляем ping
    const FRAME_INTERVAL_MS = 200; // каждые 200 мс шлём кадр

    /**
     * Аккуратно очищает все таймеры и закрывает активный WebSocket.
     * Всегда вызываем перед новым подключением или при размонтировании компонента.
     */
    const cleanupWebSocket = useCallback(() => {
        // Останавливаем heartbeat
        if (pingTimerRef.current) {
            clearInterval(pingTimerRef.current);
            pingTimerRef.current = null;
        }

        // Отменяем отложенное переподключение
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }

        // Закрываем сокет, если он ещё жив
        if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
            try {
                wsRef.current.close();
            } catch (_) {
                // игнор: при редких гонках close может бросить
            }
        }

        wsRef.current = null;
    }, []);

    /**
     * Устанавливает WebSocket-соединение и настраивает обработчики.
     * Реагирует только на config.videoWS (стабилен) — мемоизирован, чтобы не плодить эффекты.
     */
    const connectWS = useCallback(() => {
        // На всякий случай очищаем прошлое состояние
        cleanupWebSocket();

        const ws = new WebSocket(config.videoWS);
        ws.binaryType = "arraybuffer"; // сервер может прислать бинарь — оставляем настройку как в оригинале
        wsRef.current = ws;

        ws.onopen = () => {
            // Сброс счётчика переподключений при успешном коннекте
            reconnectAttemptsRef.current = 0;
            // Запуск heartbeat
            pingTimerRef.current = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: "ping" }));
                }
            }, PING_INTERVAL_MS);

            // Диагностика
            // eslint-disable-next-line no-console
            console.log("WS open 👍");
        };

        ws.onmessage = ({ data }) => {
            // Пытаемся разобрать JSON — если это не JSON (например, бинарь), тихо игнорируем
            try {
                const msg = JSON.parse(data);
                if (msg?.type === "pong") return; // ответ на ping — ничего не делаем
                // Ожидаем, что сервер присылает массив боксов; кладём в стейт
                setBoxes(msg);
            } catch (_) {
                // не JSON — игнорируем
            }
        };

        ws.onerror = (e) => {
            // eslint-disable-next-line no-console
            console.error("WS error:", e);
        };

        ws.onclose = () => {
            // eslint-disable-next-line no-console
            console.log("WS closed, переподключаемся… 🚀");

            // чистим heartbeat/таймеры
            if (pingTimerRef.current) {
                clearInterval(pingTimerRef.current);
                pingTimerRef.current = null;
            }

            // Простейший backoff: 1s * (1 + попытки), но с разумным потолком 5s
            const attempt = Math.min(reconnectAttemptsRef.current + 1, 5);
            reconnectAttemptsRef.current = attempt;
            const delay = 1000 * attempt;

            reconnectTimerRef.current = setTimeout(() => {
                connectWS();
            }, delay);
        };
    }, [cleanupWebSocket, PING_INTERVAL_MS]);

    // === Инициализация WebSocket при монтировании и корректное закрытие при размонтировании ===
    useEffect(() => {
        connectWS();
        return () => {
            cleanupWebSocket();
        };
    }, [connectWS, cleanupWebSocket]);

    /**
     * Периодическая отправка текущего кадра видео на сервер в JPEG.
     * Запускается только когда есть активный MediaStream (USB); для IP варианта мы ожидаем, что VideoPanel сам тянет поток по URL.
     */
    useEffect(() => {
        if (!stream) return undefined;

        // Берём первый видеотрек и читаем его фактическое разрешение
        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) return undefined;

        const { width, height } = videoTrack.getSettings();

        // Конфигурируем канвас под реальное разрешение трека
        const canvas = captureCanvasRef.current;
        canvas.width = width || 0; // защита от undefined
        canvas.height = height || 0;
        const ctx = canvas.getContext("2d", { willReadFrequently: false });

        // Функция, которая берёт <video> с классом .video-element, рендерит на канвас и шлёт JPEG в сокет
        const sendFrame = () => {
            const ws = wsRef.current;
            if (!ws || ws.readyState !== WebSocket.OPEN) return;

            // ⚠️ Зависимость от внешнего компонента: ожидаем, что VideoPanel рендерит <video class="video-element" />
            const videoEl = document.querySelector(".video-element");
            if (!videoEl || !width || !height) return;

            try {
                ctx.drawImage(videoEl, 0, 0, width, height);
                // Качество 0.7 — компромисс между размером и деталями
                canvas.toBlob(
                    (blob) => {
                        if (blob && ws.readyState === WebSocket.OPEN) {
                            ws.send(blob);
                        }
                    },
                    "image/jpeg",
                    0.7
                );
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error("sendFrame error:", err);
            }
        };

        const intervalId = setInterval(sendFrame, FRAME_INTERVAL_MS);
        return () => clearInterval(intervalId);
    }, [stream, FRAME_INTERVAL_MS]);

    /**
     * Обработчик выбора камеры из CamsPanel.
     * @param {{ type: 'usb'|'ip', deviceId?: string, url?: string }} cam
     */
    const handleCameraSelection = useCallback((cam) => {
        // 1) Останавливаем текущий стрим (если был)
        if (stream) {
            try {
                stream.getTracks().forEach((t) => t.stop());
            } catch (_) {
                // игнорируем сбои остановки треков
            }
        }

        // 2) Сбрасываем состояние источников
        setStream(null);
        setIpUrl(null);

        // 3) В зависимости от типа включаем новый источник
        if (cam?.type === "usb" && cam.deviceId) {
            navigator.mediaDevices
                .getUserMedia({ video: { deviceId: { exact: cam.deviceId } } })
                .then((newStream) => {
                    setStream(newStream);
                })
                .catch((e) => {
                    // eslint-disable-next-line no-console
                    console.error("USB getUserMedia error:", e);
                });
        } else if (cam?.type === "ip" && cam.url) {
            setIpUrl(cam.url);
        } else {
            // eslint-disable-next-line no-console
            console.warn("Unknown camera selection payload:", cam);
        }
    }, [stream]);

    // === Корректная уборка MediaStream при размонтировании страницы ===
    useEffect(() => {
        return () => {
            if (stream) {
                try {
                    stream.getTracks().forEach((t) => t.stop());
                } catch (_) {
                    // ignore
                }
            }
        };
    }, [stream]);

    // === Рендер ===

    return (
        <div className="MainPage">
            <div className="top-section">
                <CamsPanel onSelectCamera={handleCameraSelection} />
                <div className="VideoWrap">
                    <VideoPanel stream={stream} ipUrl={ipUrl} boxes={boxes} />
                </div>
            </div>
            <div className="bottom-section">
                <LogsPanel objects={boxes} />
            </div>
        </div>
    );
}

export default MainPage;
