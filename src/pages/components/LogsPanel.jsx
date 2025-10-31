import React from "react";
import "./LogsPanel.css";
import LogRow from "./LogRow";

function LogsPanel({ objects = [] }) {
    return (
        <div className="LogsPanel">
            <LogRow device="DEVICE" name="OBJECT" attention="ACTION" isTitle />
            {objects.map((obj, idx) => (
                <LogRow
                    key={obj.id ?? idx}
                    device={obj.device}
                    name={obj.name}
                    attention={obj.attention}
                />
            ))}
        </div>
    );
}

export default LogsPanel;
