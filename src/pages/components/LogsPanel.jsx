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
		</div>
	);
}

export default LogsPanel;
