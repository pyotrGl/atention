import React from "react";
import "./LogRow.css"

function LogRow({name, id, device, attention, isTitle}) {

	if (isTitle) {
		return (
			<div className="LogTitle">
				<label className="id">{id}</label>
				<label className="device">{device}</label>
				<label className="name">{name}</label>
				<label className="attention">{attention}</label>
			</div>
		);
	}

	return (
		<div className="LogRow">
			<label className="id">{id}</label>
			<label className="device">{device}</label>
			<label className="name">{name}</label>
			<label className="attention">{attention}</label>
		</div>
	);
}

export default LogRow;