import React from "react";
import "./LogsPanel.css";
import LogRow from "./LogRow";

function LogsPanel({ objects }) {
	return (
		<div className="LogsPanel">
			<LogRow id={"ID"} name={"OBJECT"} device={"DEVICE"} attention={"ACTION"} isTitle={true}/>
			{objects && objects.map((obj, idx) => (
				<LogRow
					key={idx}
					id={idx}
					name={obj.name}
				/>
			))}
			<LogRow id={1} name={"Петя"} device={"USBCAM"} attention={"Найден!"}/>
			<LogRow id={2} name={"Рамзик"} device={"IPCAM"} attention={"Тута!"}/>
			<LogRow id={3} name={"Стефан"} device={"USBCAM"} attention={"Здесь!"}/>

		</div>
	);
}

export default LogsPanel;
